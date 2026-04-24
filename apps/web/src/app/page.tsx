import Link from "next/link";
import { ArrowRight, Users, Briefcase, CheckSquare, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { baseUrl } from "@/lib/base-url";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FarbenCRM",
  description: "Internal CRM for the team.",
  alternates: { canonical: baseUrl },
  robots: { index: false, follow: false },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40">
        <div className="mx-auto flex h-14 items-center justify-between px-6 max-w-5xl">
          <Link
            href="/"
            className="text-[16px] font-semibold tracking-[-0.015em]"
          >
            Farben<span className="font-normal text-muted-foreground/60">CRM</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle className="rounded-full p-2 !text-muted-foreground/60 transition-all hover:!text-foreground hover:bg-foreground/[0.05]" />
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-1.5 text-[13px] font-medium text-background transition-opacity hover:opacity-80"
            >
              Sign in
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-24 pb-16 w-full text-center">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground/60">
          Internal tool · Team access only
        </p>
        <h1 className="mt-5 text-5xl font-medium tracking-[-0.04em] leading-[0.95] sm:text-6xl">
          Farben<span className="text-muted-foreground/50">CRM</span>
        </h1>
        <p className="mt-5 text-xl font-normal tracking-[-0.015em] leading-snug text-muted-foreground max-w-xl mx-auto">
          The team's shared workspace for contacts, deals, and customer activity.
        </p>
        <div className="mt-8">
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-[13px] font-medium text-background transition-opacity hover:opacity-85"
          >
            Sign in with your work account
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* What's inside */}
      <section className="mx-auto max-w-4xl px-6 pb-20 w-full">
        <p className="mb-8 text-center text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground/50">
          What's inside
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-card/40 px-6 py-5">
            <Users className="h-5 w-5 text-muted-foreground mb-3" />
            <h3 className="text-[14px] font-medium">Contacts & companies</h3>
            <p className="mt-1.5 text-[13px] leading-[1.6] text-muted-foreground">
              Single source of truth for every account, lead, and relationship the team owns.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/40 px-6 py-5">
            <Briefcase className="h-5 w-5 text-muted-foreground mb-3" />
            <h3 className="text-[14px] font-medium">Deal pipeline</h3>
            <p className="mt-1.5 text-[13px] leading-[1.6] text-muted-foreground">
              Track opportunities through each stage. See what's closing, what's stuck, what needs follow-up.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/40 px-6 py-5">
            <CheckSquare className="h-5 w-5 text-muted-foreground mb-3" />
            <h3 className="text-[14px] font-medium">Tasks & notes</h3>
            <p className="mt-1.5 text-[13px] leading-[1.6] text-muted-foreground">
              Log calls, assign follow-ups, and keep a full history of every customer interaction.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/40 px-6 py-5">
            <Sparkles className="h-5 w-5 text-muted-foreground mb-3" />
            <h3 className="text-[14px] font-medium">AI assistant</h3>
            <p className="mt-1.5 text-[13px] leading-[1.6] text-muted-foreground">
              Ask questions, pull reports, research prospects, and draft follow-ups — all in plain English.
            </p>
          </div>
        </div>
      </section>

      {/* Help */}
      <section className="mx-auto max-w-4xl px-6 pb-20 w-full text-center">
        <p className="text-[13px] text-muted-foreground">
          Need an account or having trouble signing in? Contact your system administrator.
        </p>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/30">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <span className="text-[12px] text-muted-foreground/60">
            FarbenCRM · Internal use only
          </span>
          <span className="text-[12px] text-muted-foreground/60">
            © {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
}
