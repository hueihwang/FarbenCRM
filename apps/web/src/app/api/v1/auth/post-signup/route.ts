// POST /api/v1/auth/post-signup
//
// Called by the Register page right after Better Auth creates the user
// account. Adds the new user to the default workspace (the oldest one
// in the system) instead of creating a personal workspace per user.
//
// This makes FarbenCRM behave as single-tenant: every registered user
// sees the same data. If you ever want true multi-tenancy back, this
// endpoint is the single place to change it.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { joinDefaultWorkspace } from "@/services/workspace";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const workspace = await joinDefaultWorkspace(session.user.id);
  if (!workspace) {
    // No workspaces exist at all — caller should send the user to the
    // create-workspace flow so the very first user can bootstrap one.
    return NextResponse.json(
      {
        error: {
          code: "NO_DEFAULT_WORKSPACE",
          message: "No workspace exists yet. Create one to continue.",
        },
      },
      { status: 409 }
    );
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
