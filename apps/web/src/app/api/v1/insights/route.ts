import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, badRequest, notFound, success } from "@/lib/api-utils";
import { getInsights } from "@/services/insights";
import type { PeriodKey } from "@/services/insights-calc";

const PERIODS: PeriodKey[] = ["month", "quarter", "year", "all"];

/** GET /api/v1/insights?period=month|quarter|year|all: management dashboard figures */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const period = (req.nextUrl.searchParams.get("period") ?? "month") as PeriodKey;
  if (!PERIODS.includes(period)) return badRequest(`period must be one of: ${PERIODS.join(", ")}`);

  const insights = await getInsights(ctx.workspaceId, ctx.userId, period);
  if (!insights) return notFound("This workspace has no Deals pipeline");
  return success(insights);
}
