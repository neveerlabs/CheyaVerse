import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import {
  deleteAiProvider,
  listAiProviders,
  saveAiProvider,
  testAiProviderConnection,
} from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const providers = await listAiProviders(session.uid);
  return NextResponse.json({
    ok: true,
    providers: providers.map((provider) => ({
      id: provider.id,
      provider: provider.provider,
      model: provider.model,
      active: provider.active,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
      lastError: provider.lastError,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "save";
  const provider = typeof body?.provider === "string" ? body.provider : "";
  const model = typeof body?.model === "string" ? body.model : "";
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey : "";

  if (action === "test") {
    const result = await testAiProviderConnection(provider, model, apiKey);
    return NextResponse.json(result, {
      status: result.ok ? 200 : 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!provider || !model || !apiKey.trim()) {
    return NextResponse.json(
      { ok: false, error: "Select a provider, fill in the model, and add an API key." },
      { status: 400 },
    );
  }

  const check = await testAiProviderConnection(provider, model, apiKey);
  if (!check.ok) {
    return NextResponse.json(
      { ok: false, error: check.message },
      { status: 400 },
    );
  }

  const saved = await saveAiProvider(
    session.uid,
    provider,
    model,
    apiKey,
    typeof body?.active === "boolean" ? body.active : true,
  );

  return NextResponse.json(
    { ok: true, id: saved.id, provider, model, message: check.message },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const providerId = request.nextUrl.searchParams.get("id") || "";
  if (!providerId) {
    return NextResponse.json({ error: "Provider ID is required." }, { status: 400 });
  }
  await deleteAiProvider(session.uid, providerId);
  return NextResponse.json({ ok: true, deleted: providerId });
}
