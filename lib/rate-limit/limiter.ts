import "server-only";

import { config } from "@/lib/config/env";
import { executeTrustedWrite } from "@/lib/db/write-pool";

// Per IP rate limiter backed by Postgres fixed window counters. It runs before
// any Claude call, so a client cannot run up model cost past the configured
// thresholds. Counters are incremented through the trusted parameterized write
// path, never the model SQL path. Per user limits arrive with authentication in a
// later slice; for now the client IP is the key.

type WindowKind = "minute" | "day";

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
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export async function checkRateLimit(
  ip: string,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const windows: WindowCheck[] = [];

  const minute = await incrementWindow(
    ip,
    "minute",
    floorToWindow(now, MINUTE_MS),
  );
  windows.push({
    kind: "minute",
    limit: config.rateLimitPerMinute,
    count: minute,
    retryAfterSeconds: secondsUntilNextWindow(now, MINUTE_MS),
  });

  const day = await incrementWindow(ip, "day", floorToWindow(now, DAY_MS));
  windows.push({
    kind: "day",
    limit: config.rateLimitPerDay,
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
  };
}

async function incrementWindow(
  ip: string,
  kind: WindowKind,
  windowStart: Date,
): Promise<number> {
  const result = await executeTrustedWrite<{ request_count: number }>(
    `
      insert into rate_limit_counters (ip, window_kind, window_start, request_count)
      values ($1, $2, $3, 1)
      on conflict (ip, window_kind, window_start)
      do update set request_count = rate_limit_counters.request_count + 1
      returning request_count
    `,
    [ip, kind, windowStart.toISOString()],
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
