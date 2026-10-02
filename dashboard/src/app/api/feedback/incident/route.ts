import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import { config } from "@/lib/config";
import { readBoundedJson } from "@/lib/read-bounded-json";
import { sendTelegramMessage } from "@/lib/telegram";
import { getTurso } from "@/lib/turso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INCIDENT_COOLDOWN_MS = 10 * 60 * 1000;
const INCIDENT_BODY_LIMIT_BYTES = 512;
const INCIDENT_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const INCIDENT_ENDPOINT_GROUPS = new Set([
  "/api/account",
  "/api/auth",
  "/api/avatar",
  "/api/chats",
  "/api/cover",
  "/api/device-links",
  "/api/download",
  "/api/events",
  "/api/github",
  "/api/internal",
  "/api/library",
  "/api/link-preview",
  "/api/media",
  "/api/messages",
  "/api/notifications",
  "/api/notify",
  "/api/presence",
  "/api/push",
  "/api/session",
  "/api/user",
  "/api/users",
]);

let incidentTableReady: Promise<void> | null = null;

async function ensureIncidentTable(): Promise<void> {
  if (!incidentTableReady) {
    incidentTableReady = getTurso()
      .execute(`CREATE TABLE IF NOT EXISTS system_incident_alerts (
        fingerprint TEXT PRIMARY KEY,
        last_notified_at INTEGER NOT NULL
      )`)
      .then(() => undefined)
      .catch((error) => {
        incidentTableReady = null;
        throw error;
      });
  }
  await incidentTableReady;
}

function failureResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return failureResponse("Invalid request origin.", 403);
  }

  let session: Awaited<ReturnType<typeof getUserSession>>;
  try {
    session = await getUserSession(request);
  } catch (error) {
    console.error("[feedback/incident] session verification failed:", error);
    return failureResponse("Incident reporting is temporarily unavailable.", 503);
  }
  if (!session) {
    return failureResponse("Unauthorized.", 401);
  }
  if (config.adminTelegramIds.size === 0 || !config.telegram.botToken) {
    console.error("[feedback/incident] Telegram admin reporting is not configured.");
    return failureResponse("Incident reporting is not configured.", 503);
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, INCIDENT_BODY_LIMIT_BYTES);
  } catch {
    return failureResponse("Invalid incident report.", 400);
  }
  if (!body || typeof body !== "object") {
    return failureResponse("Invalid incident report.", 400);
  }

  const report = body as Record<string, unknown>;
  const kind = report.kind;
  const endpoint = report.endpoint;
  const method = report.method;
  const status = report.status;
  const validRepeatedServerFailure =
    kind === "repeated-5xx" &&
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 500 &&
    status <= 599;
  const validGitHubCredentialMismatch =
    kind === "github-credential-mismatch" &&
    endpoint === "/api/github" &&
    method === "GET" &&
    status === 409;
  if (
    (kind !== "repeated-5xx" && kind !== "github-credential-mismatch") ||
    typeof endpoint !== "string" ||
    !INCIDENT_ENDPOINT_GROUPS.has(endpoint) ||
    typeof method !== "string" ||
    !INCIDENT_METHODS.has(method) ||
    typeof status !== "number" ||
    !Number.isInteger(status) ||
    (!validRepeatedServerFailure && !validGitHubCredentialMismatch)
  ) {
    return failureResponse("Invalid incident report.", 400);
  }

  const fingerprint = createHash("sha256")
    .update(`${kind}:${method}:${endpoint}`)
    .digest("hex");
  const now = Date.now();

  try {
    await ensureIncidentTable();
    const claim = await getTurso().execute({
      sql: `INSERT INTO system_incident_alerts (fingerprint, last_notified_at)
            VALUES (?, ?)
            ON CONFLICT(fingerprint) DO UPDATE SET
              last_notified_at = excluded.last_notified_at
            WHERE system_incident_alerts.last_notified_at <= ?
            RETURNING fingerprint`,
      args: [fingerprint, now, now - INCIDENT_COOLDOWN_MS],
    });
    if (claim.rows.length === 0) {
      return NextResponse.json(
        { ok: true, alerted: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const runtime = (process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown")
      .replace(/[\r\n]/g, " ")
      .slice(0, 40);
    const build = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local")
      .replace(/[\r\n]/g, " ")
      .slice(0, 12);
    const message = [
      "CheyaVerse server incident",
      validGitHubCredentialMismatch
        ? "Severity: GitHub credential read mismatch"
        : "Severity: repeated HTTP 5xx",
      validGitHubCredentialMismatch
        ? "Signal: Settings confirmed a readable token, but Projects could not find it after retries"
        : "Signal: 3+ failures in 30 seconds",
      `Endpoint group: ${endpoint}`,
      `Method: ${method}`,
      `Latest status: HTTP ${status}`,
      `Runtime: ${runtime}`,
      `Build: ${build}`,
      `Time: ${new Date(now).toISOString()}`,
      `Fingerprint: ${fingerprint.slice(0, 12)}`,
    ].join("\n");

    const deliveries = await Promise.all(
      Array.from(config.adminTelegramIds, (adminId) =>
        sendTelegramMessage(adminId, message, {
          retry: { maxAttempts: 1, timeoutMs: 5_000 },
        }),
      ),
    );
    const deliveredCount = deliveries.filter(Boolean).length;
    if (deliveredCount === 0) {
      await getTurso().execute({
        sql: "DELETE FROM system_incident_alerts WHERE fingerprint = ? AND last_notified_at = ?",
        args: [fingerprint, now],
      });
      console.error("[feedback/incident] Telegram delivery failed for all admins.");
      return failureResponse("Incident alert could not be delivered.", 503);
    }
    if (deliveredCount < deliveries.length) {
      console.warn("[feedback/incident] Telegram delivery failed for some admins.", {
        delivered: deliveredCount,
        configured: deliveries.length,
      });
    }
    return NextResponse.json(
      { ok: true, alerted: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[feedback/incident] automatic alert failed:", error);
    return failureResponse("Incident reporting is temporarily unavailable.", 503);
  }
}
