import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INACTIVITY_LIMIT_MS = 5 * 24 * 60 * 60 * 1000;

function hasValidCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return Boolean(
    secret &&
      expected.length === actual.length &&
      timingSafeEqual(expected, actual),
  );
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("[supabase-keepalive] CRON_SECRET is not configured.");
    return NextResponse.json(
      { ok: false, error: "Cron authentication is not configured." },
      { status: 503 },
    );
  }
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const activityResult = await getDatabase().execute({
      sql: `SELECT last_user_activity_at,
                   EXTRACT(EPOCH FROM (now() - last_user_activity_at)) * 1000
                     AS inactivity_ms
            FROM public.system_db_activity
            WHERE singleton = TRUE
            LIMIT 1`,
    });
    const lastActivity = activityResult.rows[0]?.last_user_activity_at;
    const inactivityMs = Number(activityResult.rows[0]?.inactivity_ms);
    if (!lastActivity || !Number.isFinite(inactivityMs) || inactivityMs < 0) {
      throw new Error("Database activity timestamp is missing or invalid.");
    }

    if (inactivityMs < INACTIVITY_LIMIT_MS) {
      return NextResponse.json({
        ok: true,
        heartbeat: false,
        lastUserActivityAt: new Date(
          lastActivity instanceof Date ? lastActivity : String(lastActivity),
        ).toISOString(),
      });
    }

    await getDatabase().batch([
      {
        sql: `INSERT INTO public.system_keepalive (singleton, touched_at)
              VALUES (TRUE, clock_timestamp())
              ON CONFLICT (singleton)
              DO UPDATE SET touched_at = EXCLUDED.touched_at`,
      },
      {
        sql: "DELETE FROM public.system_keepalive WHERE singleton = TRUE",
      },
    ]);

    return NextResponse.json({ ok: true, heartbeat: true });
  } catch (error) {
    console.error("[supabase-keepalive] scheduled heartbeat failed:", error);
    return NextResponse.json(
      { ok: false, error: "Scheduled database heartbeat failed." },
      { status: 503 },
    );
  }
}
