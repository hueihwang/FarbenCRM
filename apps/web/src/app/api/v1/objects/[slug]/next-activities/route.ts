import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, notFound, success } from "@/lib/api-utils";
import { getObjectBySlug } from "@/services/objects";
import { getNextActivities } from "@/services/tasks";

/** GET /api/v1/objects/:slug/next-activities: { [recordId]: next open activity } */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();
  const { slug } = await params;
  const obj = await getObjectBySlug(ctx.workspaceId, slug);
  if (!obj) return notFound("Object not found");
  return success(await getNextActivities(obj.id));
}
