import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest } from "@/lib/api-utils";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";

interface WorkspaceSettings {
  anthropicApiKey?: string;
  anthropicModel?: string;
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json();
  let { apiKey, model } = body as { apiKey?: string; model?: string };

  // If no key provided in request, use the stored one
  if (!apiKey) {
    const [workspace] = await db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))
      .limit(1);

    const settings = (workspace?.settings ?? {}) as WorkspaceSettings;
    apiKey = settings.anthropicApiKey;
    if (!model) model = settings.anthropicModel;
  }

  if (!apiKey) {
    return badRequest("No API key configured");
  }

  if (!model) model = "claude-sonnet-4-20250514";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 10,
        messages: [{ role: "user", content: "Say hello in one word." }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return success({
        success: false,
        error: (err as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`,
      });
    }

    return success({ success: true });
  } catch (e) {
    return success({
      success: false,
      error: e instanceof Error ? e.message : "Connection failed",
    });
  }
}
