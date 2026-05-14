"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Loader2 } from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

/**
 * Landing page for users who have a Better Auth account but no
 * workspace membership yet. They need an admin to add them via
 * Settings → Members.
 *
 * We deliberately do NOT show the "Create your own workspace" path
 * here — that would defeat the privacy fix (anyone could sign up
 * and spin up their own isolated workspace). Workspace creation is
 * left for the explicit /select-workspace flow which is only reached
 * by users who already have at least one membership.
 */
export default function PendingAccessPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      router.push("/login");
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <CardTitle className="text-2xl">Account created</CardTitle>
        <CardDescription>
          You&apos;re signed up
          {session?.user?.email ? (
            <>
              {" "}as <span className="font-medium">{session.user.email}</span>
            </>
          ) : null}
          , but you don&apos;t have access to a workspace yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Ask a FarbenCRM admin to add your email to their workspace via{" "}
          <span className="font-medium text-foreground">
            Settings → Members → Add Member by Email
          </span>
          . Once they do, sign back in and you&apos;ll land in the workspace.
        </p>
        <p className="text-xs">
          Workspaces are invite-only. The CRM owner controls who sees the
          data — you can&apos;t self-join.
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing out…
            </>
          ) : (
            "Sign out"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
