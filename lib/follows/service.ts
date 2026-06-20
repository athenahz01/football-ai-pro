import "server-only";

import { executeSqlInReadOnlyTransaction } from "@/lib/sql/executor";
import { executeTrustedWrite } from "@/lib/db/write-pool";
import { getAuthenticatedUser } from "@/lib/supabase/server-client";

// Server side follows service. The user id always comes from the authenticated
// server session, never from request input, so a user can only ever read or change
// their own follows. Reads use the read only transaction. Writes use the trusted
// parameterized write path. A follow is validated against teams or players before
// it is stored, so it can only point at an entity that exists in our own data. None
// of this touches the grounded answer path.

export type FollowEntityType = "team" | "player";

export type FollowTarget = {
  type: FollowEntityType;
  id: string;
};

export type FollowedItem = {
  type: FollowEntityType;
  id: string;
  name: string;
  createdAt: string;
};

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

const UNAUTHENTICATED: ServiceResult<never> = {
  ok: false,
  status: 401,
  error: "Sign in to manage the teams and players you follow.",
};

async function currentUserId(): Promise<string | null> {
  const user = await getAuthenticatedUser();
  return user?.id ?? null;
}

export async function listFollows(): Promise<ServiceResult<FollowedItem[]>> {
  const userId = await currentUserId();
  if (userId === null) {
    return UNAUTHENTICATED;
  }

  const result = await executeSqlInReadOnlyTransaction(
    `
      select
        uf.team_id,
        t.name as team_name,
        uf.player_id,
        p.name as player_name,
        uf.created_at
      from user_follows uf
      left join teams t on t.team_id = uf.team_id
      left join players p on p.player_id = uf.player_id
      where uf.user_id = $1
      order by uf.created_at desc
    `,
    500,
    5_000,
    [userId],
  );

  if (!result.ok) {
    return { ok: false, status: 500, error: result.message };
  }

  const items: FollowedItem[] = result.rows.map((row) => {
    const teamId = row.team_id as string | null;
    if (teamId !== null) {
      return {
        type: "team",
        id: teamId,
        name: String(row.team_name ?? teamId),
        createdAt: String(row.created_at),
      };
    }

    const playerId = row.player_id as string | null;
    return {
      type: "player",
      id: String(playerId),
      name: String(row.player_name ?? playerId),
      createdAt: String(row.created_at),
    };
  });

  return { ok: true, data: items };
}

export async function followEntity(
  target: FollowTarget,
): Promise<ServiceResult<{ followed: true }>> {
  const userId = await currentUserId();
  if (userId === null) {
    return UNAUTHENTICATED;
  }

  const name = await lookupEntityName(target);
  if (name === null) {
    return {
      ok: false,
      status: 404,
      error: `That ${target.type} does not exist in the data.`,
    };
  }

  const column = target.type === "team" ? "team_id" : "player_id";

  await executeTrustedWrite(
    `
      insert into user_follows (user_id, ${column})
      values ($1, $2)
      on conflict do nothing
    `,
    [userId, target.id],
  );

  return { ok: true, data: { followed: true } };
}

export async function unfollowEntity(
  target: FollowTarget,
): Promise<ServiceResult<{ unfollowed: true }>> {
  const userId = await currentUserId();
  if (userId === null) {
    return UNAUTHENTICATED;
  }

  const column = target.type === "team" ? "team_id" : "player_id";

  await executeTrustedWrite(
    `
      delete from user_follows
      where user_id = $1 and ${column} = $2
    `,
    [userId, target.id],
  );

  return { ok: true, data: { unfollowed: true } };
}

async function lookupEntityName(target: FollowTarget): Promise<string | null> {
  const table = target.type === "team" ? "teams" : "players";
  const idColumn = target.type === "team" ? "team_id" : "player_id";

  const result = await executeSqlInReadOnlyTransaction(
    `select name from ${table} where ${idColumn} = $1`,
    1,
    5_000,
    [target.id],
  );

  if (!result.ok || result.rows.length === 0) {
    return null;
  }

  return String(result.rows[0].name);
}
