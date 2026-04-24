import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, requireAdmin, success, badRequest } from "@/lib/api-utils";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";

interface WorkspaceSettings {
  anthropicApiKey?: string;
  anthropicModel?: string;
  workspaceKnowledge?: string;
}

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const [workspace] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId))
    .limit(1);

  const settings = (workspace?.settings ?? {}) as WorkspaceSettings;

  return success({
    model: settings.anthropicModel || "claude-sonnet-4-20250514",
    hasApiKey: !!settings.anthropicApiKey,
    workspaceKnowledge: settings.workspaceKnowledge || "",
  });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const adminCheck = requireAdmin(ctx);
  if (adminCheck) return adminCheck;

  const body = await req.json();
  const { apiKey, model, workspaceKnowledge } = body as {
    apiKey?: string;
    model?: string;
    workspaceKnowledge?: string;
  };

  if (apiKey === undefined && model === undefined && workspaceKnowledge === undefined) {
    return badRequest("Provide apiKey, model, or workspaceKnowledge");
  }

  const [workspace] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId))
    .limit(1);

  const current = (workspace?.settings ?? {}) as WorkspaceSettings;
  const updated: WorkspaceSettings = { ...current };

  if (apiKey !== undefined) updated.anthropicApiKey = apiKey;
  if (model !== undefined) updated.anthropicModel = model;
  if (workspaceKnowledge !== undefined) updated.workspaceKnowledge = workspaceKnowledge;

  await db
    .update(workspaces)
    .set({ settings: updated, updatedAt: new Date() })
    .where(eq(workspaces.id, ctx.workspaceId));

  return success({
    model: updated.anthropicModel || "claude-sonnet-4-20250514",
    hasApiKey: !!updated.anthropicApiKey,
    workspaceKnowledge: updated.workspaceKnowledge || "",
  });
}
