import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, notFound, success } from "@/lib/api-utils";
import { getObjectBySlug } from "@/services/objects";
import { getRecord } from "@/services/records";
import { getStageHistory } from "@/services/stage-history";

/** GET /api/v1/objects/:slug/records/:recordId/stage-history?attributeId= */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; recordId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { slug, recordId } = await params;
  const obj = await getObjectBySlug(ctx.workspaceId, slug);
  if (!obj) return notFound("Object not found");

  const record = await getRecord(obj.id, recordId);
  if (!record) return notFound("Record not found");

  const attributeId = req.nextUrl.searchParams.get("attributeId") ?? undefined;
  const history = await getStageHistory(obj.id, recordId, attributeId);
  if (!history) return notFound("This object has no status attribute");

  return success(history);
}
