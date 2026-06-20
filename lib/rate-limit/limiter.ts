import "server-only";

import { config } from "@/lib/config/env";
import { executeTrustedWrite } from "@/lib/db/write-pool";

// Per subject rate limiter backed by Postgres fixed window counters. It runs
// before any Claude call, so a client cannot run up model cost past the
// configured thresholds. The subject is an IP address for anonymous traffic or a
// user id for a signed in user. Signed in users get higher limits. Counters are
// incremented through the trusted parameterized write path, never the model SQL
// path.

type WindowKind = "minute" | "day";

export type RateLimitSubject = {
  kind: "ip" | "user";
  value: string;
};

type WindowLimits = {
  minute: number;
  day: number;
};

type WindowCheck = {
  kind: WindowKind;
  limit: number;
  count: number;
  retryAfterSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  scope: WindowKind | null;
  subjectKind: RateLimitSubject["kind"];
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function limitsFor(subject: RateLimitSubject): WindowLimits {
  if (subject.kind === "user") {
    return {
      minute: config.rateLimitUserPerMinute,
      day: config.rateLimitUserPerDay,
    };
  }

  return {
    minute: config.rateLimitPerMinute,
    day: config.rateLimitPerDay,
  };
}

export async function checkRateLimit(
  subject: RateLimitSubject,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const limits = limitsFor(subject);
  const windows: WindowCheck[] = [];

  const minute = await incrementWindow(
    subject,
    "minute",
    floorToWindow(now, MINUTE_MS),
  );
  windows.push({
    kind: "minute",
    limit: limits.minute,
    count: minute,
    retryAfterSeconds: secondsUntilNextWindow(now, MINUTE_MS),
  });

  const day = await incrementWindow(
    subject,
    "day",
    floorToWindow(now, DAY_MS),
  );
  windows.push({
    kind: "day",
    limit: limits.day,
    count: day,
    retryAfterSeconds: secondsUntilNextWindow(now, DAY_MS),
  });

  const exceeded = windows.find((window) => window.count > window.limit);

  if (exceeded !== undefined) {
    return {
      allowed: false,
      limit: exceeded.limit,
      remaining: 0,
      retryAfterSeconds: exceeded.retryAfterSeconds,
      scope: exceeded.kind,
      subjectKind: subject.kind,
    };
  }

  const tightest = windows.reduce((current, window) =>
    window.limit - window.count < current.limit - current.count
      ? window
      : current,
  );

  return {
    allowed: true,
    limit: tightest.limit,
    remaining: Math.max(0, tightest.limit - tightest.count),
    retryAfterSeconds: 0,
    scope: tightest.kind,
    subjectKind: subject.kind,
  };
}

async function incrementWindow(
  subject: RateLimitSubject,
  kind: WindowKind,
  windowStart: Date,
): Promise<number> {
  const result = await executeTrustedWrite<{ request_count: number }>(
    `
      insert into rate_limit_usage (subject_kind, subject, window_kind, window_start, request_count)
      values ($1, $2, $3, $4, 1)
      on conflict (subject_kind, subject, window_kind, window_start)
      do update set request_count = rate_limit_usage.request_count + 1
      returning request_count
    `,
    [subject.kind, subject.value, kind, windowStart.toISOString()],
  );

  return Number(result.rows[0]?.request_count ?? 1);
}

function floorToWindow(now: number, windowMs: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

function secondsUntilNextWindow(now: number, windowMs: number): number {
  const nextBoundary = (Math.floor(now / windowMs) + 1) * windowMs;
  return Math.max(1, Math.ceil((nextBoundary - now) / 1000));
}
