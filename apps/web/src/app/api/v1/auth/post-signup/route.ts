// POST /api/v1/auth/post-signup
//
// Called by the Register page after Better Auth creates the user
// account. We DELIBERATELY do not auto-add the user to any workspace
// — access has to be granted explicitly by an admin via
// Settings → Members. This prevents the public registration form
// from being a data-leak vector.
//
// If the user happens to be a member of a workspace already (e.g.
// admin invited them by email before they finished registering), we
// set the active-workspace cookie so they land in that workspace.
// Otherwise we return 204 and the register page sends them to the
// "no workspaces yet" screen.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findFirstUserWorkspace } from "@/services/workspace";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const workspace = await findFirstUserWorkspace(session.user.id);

  if (!workspace) {
    // No membership yet — register page will redirect to /pending-access
    return new NextResponse(null, { status: 204 });
  }

  const response = NextResponse.json({ data: workspace }, { status: 200 });
  response.cookies.set("active-workspace-id", workspace.id, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return response;
}
