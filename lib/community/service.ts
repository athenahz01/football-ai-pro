import "server-only";

import { z } from "zod";

import {
  isMetricAvailable,
  type EntityType,
  type MetricKey,
} from "@/lib/insights/metrics";
import {
  getCompetition,
  getEntityMetrics,
  leaderboard,
  type EntityMetrics,
  type LeaderboardRow,
} from "@/lib/insights/queries";
import { getReplayData, listReplayClips, type ReplayClip } from "@/lib/replay/queries";
import { executeSqlInReadOnlyTransaction } from "@/lib/sql/executor";
import { executeTrustedWrite } from "@/lib/db/write-pool";
import { getAuthenticatedUser } from "@/lib/supabase/server-client";

// Server side community service. A post stores the parameters that produce a view,
// never the numbers, so every render re runs the same fixed parameterized read only
// queries from lib/insights and lib/replay and the feed is always live and current.
// The author id always comes from the authenticated server session, never from
// request input, so a user can only publish as themselves and only delete their own
// posts. Reads use the read only transaction. Writes use the trusted parameterized
// write path. There is no model written SQL anywhere here, and shared_posts is never
// exposed to the text to SQL model.

const TIMEOUT_MS = 5_000;
const FEED_LIMIT = 50;
const LEADERBOARD_LIMIT = 20;

export type PostKind = "comparison" | "leaderboard" | "replay";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

const UNAUTHENTICATED: ServiceResult<never> = {
  ok: false,
  status: 401,
  error: "Sign in to share to the community.",
};

// The accepted shape of each kind's parameters. Validation here is the first gate;
// the values are then checked against real competitions, metrics, and clips below,
// so a stored post can only ever point at a real, renderable view.
const entityTypeSchema = z.enum(["players", "teams"]);
const metricSchema = z.enum(["goals", "shots", "passes", "xt", "vaep", "xg"]);

const comparisonParamsSchema = z.object({
  competition: z.string().trim().min(1).max(128),
  type: entityTypeSchema,
  a: z.string().trim().min(1).max(128),
  b: z.string().trim().min(1).max(128),
});

const leaderboardParamsSchema = z.object({
  competition: z.string().trim().min(1).max(128),
  type: entityTypeSchema,
  metric: metricSchema,
  min: z.number().int().min(0).max(1000),
});

const replayParamsSchema = z.object({
  clip: z.string().trim().min(1).max(128),
});

export type ComparisonParams = z.infer<typeof comparisonParamsSchema>;
export type LeaderboardParams = z.infer<typeof leaderboardParamsSchema>;
export type ReplayParams = z.infer<typeof replayParamsSchema>;

export const publishInputSchema = z.object({
  kind: z.enum(["comparison", "leaderboard", "replay"]),
  params: z.unknown(),
  caption: z.string().trim().max(280).optional(),
});

export type PublishInput = z.infer<typeof publishInputSchema>;

export type CommunityPost = {
  id: string;
  kind: PostKind;
  params: unknown;
  caption: string | null;
  viewCount: number;
  createdAt: string;
  authorLabel: string;
};

export type RenderedComparison = {
  kind: "comparison";
  competitionName: string;
  seasonName: string | null;
  source: string;
  entityType: EntityType;
  a: EntityMetrics;
  b: EntityMetrics;
};

export type RenderedLeaderboard = {
  kind: "leaderboard";
  competitionName: string;
  seasonName: string | null;
  source: string;
  entityType: EntityType;
  metric: MetricKey;
  rows: LeaderboardRow[];
};

export type RenderedReplay = {
  kind: "replay";
  clip: ReplayClip;
  playerCount: number;
  ballCount: number;
  frameCount: number;
};

export type RenderedPost =
  | {
      ok: true;
      render: RenderedComparison | RenderedLeaderboard | RenderedReplay;
    }
  | { ok: false; reason: string };

async function currentUserId(): Promise<string | null> {
  const user = await getAuthenticatedUser();
  return user?.id ?? null;
}

export async function publishPost(
  input: PublishInput,
): Promise<ServiceResult<{ id: string }>> {
  const userId = await currentUserId();
  if (userId === null) {
    return UNAUTHENTICATED;
  }

  const validated = await validateParams(input.kind, input.params);
  if (!validated.ok) {
    return { ok: false, status: 400, error: validated.reason };
  }

  const caption =
    input.caption && input.caption.length > 0 ? input.caption : null;

  const result = await executeTrustedWrite<{ id: string }>(
    `
      insert into shared_posts (author_user_id, kind, params, caption)
      values ($1, $2, $3::jsonb, $4)
      returning id
    `,
    [userId, input.kind, JSON.stringify(validated.params), caption],
  );

  return { ok: true, data: { id: String(result.rows[0].id) } };
}

export async function deletePost(
  id: string,
): Promise<ServiceResult<{ deleted: true }>> {
  const userId = await currentUserId();
  if (userId === null) {
    return UNAUTHENTICATED;
  }

  // The author is taken from the session and matched in the where clause, so a user
  // can only ever delete a post they own.
  const result = await executeTrustedWrite(
    `
      delete from shared_posts
      where id = $1 and author_user_id = $2
    `,
    [id, userId],
  );

  if (result.rowCount === 0) {
    return {
      ok: false,
      status: 404,
      error: "That post does not exist or is not yours to delete.",
    };
  }

  return { ok: true, data: { deleted: true } };
}

export async function listPosts(): Promise<CommunityPost[]> {
  const result = await executeSqlInReadOnlyTransaction(
    `
      select id, author_user_id, kind, params, caption, view_count, created_at
      from shared_posts
      order by created_at desc
      limit $1
    `,
    FEED_LIMIT,
    TIMEOUT_MS,
    [FEED_LIMIT],
  );

  if (!result.ok) {
    return [];
  }

  return result.rows.map(toCommunityPost);
}

async function readPostRow(
  id: string,
): Promise<Record<string, unknown> | null> {
  const result = await executeSqlInReadOnlyTransaction(
    `
      select id, author_user_id, kind, params, caption, view_count, created_at
      from shared_posts
      where id = $1
    `,
    1,
    TIMEOUT_MS,
    [id],
  );

  if (!result.ok || result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

// Open a single post: increment its view count through the trusted write path, then
// return the post plus whether the current session user owns it. Ownership is
// decided server side by comparing the session user id to the stored author id, so
// the author id never leaves the server and only a boolean reaches the client.
export async function openPost(
  id: string,
): Promise<{ post: CommunityPost; isOwner: boolean } | null> {
  const row = await readPostRow(id);
  if (row === null) {
    return null;
  }

  await executeTrustedWrite(
    `update shared_posts set view_count = view_count + 1 where id = $1`,
    [id],
  );

  const post = toCommunityPost(row);
  const userId = await currentUserId();
  const isOwner = userId !== null && userId === String(row.author_user_id);

  return { post: { ...post, viewCount: post.viewCount + 1 }, isOwner };
}

// Re render a post live from its stored parameters, using only the existing fixed
// read only queries. If the underlying view is no longer available, for example a
// competition that is gone, the post degrades to an honest reason rather than
// fabricating anything.
export async function renderPost(
  kind: PostKind,
  params: unknown,
): Promise<RenderedPost> {
  if (kind === "comparison") {
    return renderComparison(params);
  }
  if (kind === "leaderboard") {
    return renderLeaderboard(params);
  }
  return renderReplay(params);
}

async function renderComparison(params: unknown): Promise<RenderedPost> {
  const parsed = comparisonParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, reason: "This shared comparison is no longer valid." };
  }

  const competition = await getCompetition(parsed.data.competition);
  if (competition === null) {
    return { ok: false, reason: "This competition is no longer available." };
  }

  const [a, b] = await Promise.all([
    getEntityMetrics(competition, parsed.data.type, parsed.data.a),
    getEntityMetrics(competition, parsed.data.type, parsed.data.b),
  ]);

  if (a === null || b === null) {
    return { ok: false, reason: "One of these entities is no longer available." };
  }

  return {
    ok: true,
    render: {
      kind: "comparison",
      competitionName: competition.name,
      seasonName: competition.seasonName,
      source: competition.source,
      entityType: parsed.data.type,
      a,
      b,
    },
  };
}

async function renderLeaderboard(params: unknown): Promise<RenderedPost> {
  const parsed = leaderboardParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, reason: "This shared leaderboard is no longer valid." };
  }

  const competition = await getCompetition(parsed.data.competition);
  if (competition === null) {
    return { ok: false, reason: "This competition is no longer available." };
  }

  const rows = await leaderboard(
    competition,
    parsed.data.type,
    parsed.data.metric,
    parsed.data.min,
    LEADERBOARD_LIMIT,
  );

  return {
    ok: true,
    render: {
      kind: "leaderboard",
      competitionName: competition.name,
      seasonName: competition.seasonName,
      source: competition.source,
      entityType: parsed.data.type,
      metric: parsed.data.metric,
      rows,
    },
  };
}

async function renderReplay(params: unknown): Promise<RenderedPost> {
  const parsed = replayParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, reason: "This shared replay is no longer valid." };
  }

  const data = await getReplayData(parsed.data.clip);
  if (data === null) {
    return { ok: false, reason: "This clip is no longer available." };
  }

  const playerCount = data.tracks.filter(
    (track) => track.trackClass !== "ball",
  ).length;
  const ballCount = data.tracks.filter(
    (track) => track.trackClass === "ball",
  ).length;

  return {
    ok: true,
    render: {
      kind: "replay",
      clip: data.clip,
      playerCount,
      ballCount,
      frameCount: data.frameCount,
    },
  };
}

// Validation gate for publish. Beyond the shape, every value is checked against the
// same real data the insights and replay layers serve, so a post can only point at
// a renderable view.
async function validateParams(
  kind: PostKind,
  params: unknown,
): Promise<{ ok: true; params: unknown } | { ok: false; reason: string }> {
  if (kind === "comparison") {
    const parsed = comparisonParamsSchema.safeParse(params);
    if (!parsed.success) {
      return { ok: false, reason: "Provide a competition, type, and two entities." };
    }
    if (parsed.data.a === parsed.data.b) {
      return { ok: false, reason: "Pick two different entities to compare." };
    }
    const competition = await getCompetition(parsed.data.competition);
    if (competition === null) {
      return { ok: false, reason: "That competition does not exist." };
    }
    const [a, b] = await Promise.all([
      getEntityMetrics(competition, parsed.data.type, parsed.data.a),
      getEntityMetrics(competition, parsed.data.type, parsed.data.b),
    ]);
    if (a === null || b === null) {
      return { ok: false, reason: "Those entities are not both in this competition." };
    }
    return { ok: true, params: parsed.data };
  }

  if (kind === "leaderboard") {
    const parsed = leaderboardParamsSchema.safeParse(params);
    if (!parsed.success) {
      return { ok: false, reason: "Provide a competition, type, metric, and minimum." };
    }
    const competition = await getCompetition(parsed.data.competition);
    if (competition === null) {
      return { ok: false, reason: "That competition does not exist." };
    }
    if (
      !isMetricAvailable(competition.source, parsed.data.type, parsed.data.metric)
    ) {
      return {
        ok: false,
        reason: "That metric is not available for this competition.",
      };
    }
    return { ok: true, params: parsed.data };
  }

  const parsed = replayParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, reason: "Provide a clip to replay." };
  }
  const clips = await listReplayClips();
  if (!clips.some((clip) => clip.clipId === parsed.data.clip)) {
    return { ok: false, reason: "That clip does not have a stored replay." };
  }
  return { ok: true, params: parsed.data };
}

function toCommunityPost(row: Record<string, unknown>): CommunityPost {
  return {
    id: String(row.id),
    kind: row.kind as PostKind,
    params: parseParams(row.params),
    caption: row.caption === null ? null : String(row.caption),
    viewCount: Number(row.view_count ?? 0),
    createdAt: String(row.created_at),
    authorLabel: authorLabel(String(row.author_user_id)),
  };
}

function parseParams(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value ?? {};
}

// A neutral, stable label that never exposes the author's identity or email. It is
// derived from the start of the auth user id only so posts by the same author read
// as the same member without revealing who they are.
function authorLabel(userId: string): string {
  const handle = userId.replace(/-/g, "").slice(0, 6) || "member";
  return `Member ${handle}`;
}
