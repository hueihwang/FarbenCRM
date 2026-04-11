import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";


import { ScrollReveal } from "@/components/scroll-reveal";
import { ThemeToggle } from "@/components/theme-toggle";
import { RotatingChat } from "@/components/landing/rotating-chat";
import { TerminalDemo } from "@/components/landing/terminal-demo";
import { LandingNav } from "@/components/landing/landing-nav";
import { JsonLd } from "@/components/json-ld";
import { TrackedLink, TrackedAnchor } from "@/components/analytics/tracked-link";
import { baseUrl } from "@/lib/base-url";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: {
    canonical: baseUrl,
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "FarbenCRM",
  url: baseUrl,
  logo: `${baseUrl}/favicon.ico`,
  sameAs: [],
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "FarbenCRM",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Linux, macOS, Windows",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description:
    "The CRM your AI agent already knows how to use. Open-source, self-hosted, with built-in AI assistant.",
};

const homeFaqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is FarbenCRM?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "FarbenCRM is a free, open-source, self-hosted CRM with native AI agent integration. Your AI agent manages contacts, deals, tasks, and notes through natural language. It ships with a built-in AI chat assistant, a full REST API, and deploys with Docker Compose. MIT licensed with no per-seat pricing.",
      },
    },
    {
      "@type": "Question",
      name: "How does the AI agent work with FarbenCRM?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "FarbenCRM integrates with your AI agent in two minutes. Generate a skill file from Settings, drop it into your agent config, and your bot can create contacts, update deals, log notes, search data, and manage tasks from wherever you already talk to it. Inside the CRM, a built-in AI chat assistant also analyzes your data and takes actions.",
      },
    },
    {
      "@type": "Question",
      name: "Is FarbenCRM free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. FarbenCRM is MIT licensed and completely free. There is no per-seat pricing and no paywalled features. You can self-host it on your own infrastructure with full data ownership.",
      },
    },
  ],
};

export default function LandingPage() {
  return (
    <div className="relative bg-background text-foreground">
      <JsonLd data={organizationSchema} />
      <JsonLd data={softwareSchema} />
      <JsonLd data={homeFaqSchema} />
      {/* Subtle top gradient */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh]"
        style={{
          background:
            "linear-gradient(180deg, var(--landing-tint) 0%, transparent 100%)",
        }}
      />

      {/* Scroll-aware nav */}
      <LandingNav>
        <div className="mx-auto flex h-14 sm:h-16 items-center justify-between px-4 sm:px-8 max-w-6xl">
          <Link
            href="/"
            className="text-[15px] sm:text-[16px] font-semibold tracking-[-0.015em] text-foreground transition-opacity hover:opacity-70"
          >
            Farben<span className="font-normal text-muted-foreground/60">CRM</span>
          </Link>
          <div className="flex items-center">
            {/* Utility group */}
            <div className="flex items-center gap-1.5 sm:gap-3 mr-3 sm:mr-6">
              <ThemeToggle className="rounded-full p-2 !text-muted-foreground/50 transition-all hover:!text-foreground hover:bg-foreground/[0.05]" />
            </div>
            {/* Action group */}
            <div className="flex items-center gap-1">
              <Link
                href="/login"
                className="hidden sm:inline-flex rounded-full px-4 py-1.5 text-[13px] text-muted-foreground transition-all hover:text-foreground hover:bg-foreground/[0.04]"
              >
                Log in
              </Link>
              <TrackedLink
                href="/register"
                className="rounded-full border border-foreground/12 px-3.5 sm:px-4 py-1.5 text-[13px] font-medium text-foreground transition-all hover:border-foreground/25 hover:bg-foreground/[0.03]"
                eventProps={{ button_text: "Get started", location: "nav", destination: "register" }}
              >
                Get started
              </TrackedLink>
            </div>
          </div>
        </div>
      </LandingNav>

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-6 pt-36 pb-12 sm:pt-48 sm:pb-20">
        <div className="text-center">
          <h1 className="brand-reveal text-5xl font-medium tracking-[-0.04em] leading-[0.92] sm:text-7xl lg:text-[6rem]">
            Farben<span className="text-muted-foreground/50">CRM</span>
          </h1>

          <p className="landing-fade-up mt-6 text-2xl font-normal tracking-[-0.02em] leading-snug text-muted-foreground sm:text-3xl lg:text-[2.25rem]">
            The CRM your AI agent
            <br className="hidden sm:block" /> already knows how to use.
          </p>

          <p className="landing-fade-up-1 mt-6 text-[15px] leading-relaxed text-muted-foreground/70">
            Open-source. Self-hosted. Built-in AI assistant.
          </p>

          <div className="landing-fade-up-2 mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <TrackedLink
              href="/register"
              className="group inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-[13px] font-medium text-background shadow-[0_1px_4px_rgba(0,0,0,0.1),0_0px_1px_rgba(0,0,0,0.06)] transition-all hover:opacity-80 hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
              eventProps={{ button_text: "Get started", location: "hero", destination: "register" }}
            >
              Get started
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </TrackedLink>
            <TrackedLink
              href="/docs"
              className="inline-flex items-center gap-2 rounded-full border border-foreground/15 dark:border-white/15 px-5 py-2.5 text-[13px] font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-foreground/30 dark:hover:border-white/25 hover:bg-accent hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
              eventProps={{ button_text: "View docs", location: "hero", destination: "docs" }}
            >
              <BookOpen className="h-3.5 w-3.5" />
              View docs
            </TrackedLink>
          </div>
        </div>
      </section>

      {/* Terminal demo: agent interacting with CRM */}
      <section className="relative mx-auto max-w-5xl px-6 pb-28 sm:pb-40">
        <ScrollReveal>
          <div className="mx-auto max-w-4xl">
            <div className="overflow-hidden rounded-2xl border-2 border-white/[0.08] shadow-[0_12px_60px_-10px_rgba(0,0,0,0.5),0_4px_20px_-4px_rgba(0,0,0,0.3)] ring-1 ring-white/[0.06]">
              {/* Terminal title bar */}
              <div className="flex items-center border-b border-white/[0.05] bg-[#111113] px-6 py-3">
                <span className="text-[12px] font-medium text-white/40">
                  FarbenCRM
                </span>
              </div>
              {/* Terminal body */}
              <div className="bg-[#0c0c0e] px-5 py-8 sm:px-14 sm:py-14 min-h-[240px] sm:min-h-[320px] flex flex-col justify-center">
                <TerminalDemo />
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Three differentiators */}
      <section className="relative mx-auto max-w-5xl px-6 pb-28 sm:pb-40">
        <ScrollReveal>
          <p className="mb-10 text-center text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground/50">
            Why FarbenCRM
          </p>
        </ScrollReveal>
        <div className="grid gap-5 sm:grid-cols-3 sm:gap-5">
          <ScrollReveal delay={0} className="h-full">
            <div className="h-full rounded-2xl border border-foreground/[0.06] dark:border-white/[0.06] bg-foreground/[0.015] dark:bg-white/[0.02] px-7 py-7 transition-[border-color,background-color,box-shadow,transform] duration-150 hover:border-foreground/20 dark:hover:border-white/15 hover:bg-foreground/[0.025] dark:hover:bg-white/[0.035] hover:shadow-[0_4px_20px_-6px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_24px_-6px_rgba(0,0,0,0.4)] hover:-translate-y-0.5">
              <h3 className="text-[15px] font-medium tracking-[-0.01em]">
                Your agent runs your CRM
              </h3>
              <p className="mt-2 text-[14px] leading-[1.65] text-muted-foreground">
                Connect your AI agent in 2 minutes. Manage contacts, deals,
                tasks from wherever you already talk to your agent.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.1} className="h-full">
            <div className="h-full rounded-2xl border border-foreground/[0.06] dark:border-white/[0.06] bg-foreground/[0.015] dark:bg-white/[0.02] px-7 py-7 transition-[border-color,background-color,box-shadow,transform] duration-150 hover:border-foreground/20 dark:hover:border-white/15 hover:bg-foreground/[0.025] dark:hover:bg-white/[0.035] hover:shadow-[0_4px_20px_-6px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_24px_-6px_rgba(0,0,0,0.4)] hover:-translate-y-0.5">
              <h3 className="text-[15px] font-medium tracking-[-0.01em]">
                Built-in AI assistant
              </h3>
              <p className="mt-2 text-[14px] leading-[1.65] text-muted-foreground">
                When you're inside the CRM, an AI chat agent analyzes your data,
                looks things up, and takes actions.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.2} className="h-full">
            <div className="h-full rounded-2xl border border-foreground/[0.06] dark:border-white/[0.06] bg-foreground/[0.015] dark:bg-white/[0.02] px-7 py-7 transition-[border-color,background-color,box-shadow,transform] duration-150 hover:border-foreground/20 dark:hover:border-white/15 hover:bg-foreground/[0.025] dark:hover:bg-white/[0.035] hover:shadow-[0_4px_20px_-6px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_24px_-6px_rgba(0,0,0,0.4)] hover:-translate-y-0.5">
              <h3 className="text-[15px] font-medium tracking-[-0.01em]">
                Open-source, self-hosted
              </h3>
              <p className="mt-2 text-[14px] leading-[1.65] text-muted-foreground">
                MIT licensed. Your data stays on your server. Deploy with Docker
                Compose.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Secondary demo: AI inside the CRM */}
      <section className="relative mx-auto max-w-5xl px-6 pb-28 sm:pb-40">
        <ScrollReveal>
          <p className="mb-10 text-center text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground/50">
            AI inside the CRM
          </p>
        </ScrollReveal>
        <ScrollReveal>
          <div className="mx-auto max-w-4xl">
            <div className="overflow-hidden rounded-2xl border-2 border-foreground/12 dark:border-white/[0.1] shadow-[0_12px_50px_-10px_rgba(0,0,0,0.18),0_4px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_12px_60px_-10px_rgba(0,0,0,0.5),0_4px_20px_-4px_rgba(0,0,0,0.3)] dark:ring-1 dark:ring-white/[0.06]">
              {/* Window chrome */}
              <div className="flex items-center gap-2 border-b border-foreground/8 dark:border-white/[0.06] bg-card/80 dark:bg-white/[0.03] px-6 py-3.5">
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-foreground/10 dark:bg-white/[0.08]" />
                  <div className="h-3 w-3 rounded-full bg-foreground/10 dark:bg-white/[0.08]" />
                  <div className="h-3 w-3 rounded-full bg-foreground/10 dark:bg-white/[0.08]" />
                </div>
                <span className="ml-3 text-[12px] font-medium text-muted-foreground/50">
                  AI Chat
                </span>
              </div>
              {/* Chat area */}
              <div className="bg-background dark:bg-[#0c0c0e] px-5 py-8 sm:px-14 sm:py-14 min-h-[200px] sm:min-h-[280px] flex flex-col justify-center">
                <RotatingChat />
              </div>
              {/* Input bar */}
              <div className="border-t border-foreground/8 dark:border-white/[0.06] bg-card/50 dark:bg-white/[0.02] px-6 py-4">
                <div className="flex items-center gap-3 rounded-xl bg-background/60 dark:bg-white/[0.04] border border-foreground/8 dark:border-white/[0.06] px-5 py-3">
                  <span className="text-[13px] text-muted-foreground/40">
                    Ask your CRM anything...
                  </span>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Final CTA */}
      <section className="relative mx-auto max-w-5xl px-6 pb-28 sm:pb-40">
        <ScrollReveal>
          <div className="text-center">
            <p className="text-[15px] text-muted-foreground">
              Connect your agent. Get started.
            </p>
            <div className="mt-5">
              <TrackedLink
                href="/register"
                className="group inline-flex items-center gap-2 rounded-full border border-foreground/15 dark:border-white/12 px-6 py-2.5 text-[14px] font-medium text-foreground transition-[border-color,background-color] duration-150 hover:border-foreground/30 dark:hover:border-white/20 hover:bg-foreground/[0.03] dark:hover:bg-white/[0.04]"
                eventProps={{ button_text: "Get started", location: "footer_cta", destination: "register" }}
              >
                Get started
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </TrackedLink>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/15">
        <div className="mx-auto flex max-w-5xl flex-col sm:flex-row items-center justify-between gap-4 px-6 py-6 sm:py-8">
          <span className="text-[12px] text-muted-foreground/60">
            FarbenCRM
          </span>
          <div className="flex items-center gap-5">
            <Link
              href="/docs"
              className="text-[12px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            >
              Docs
            </Link>
            <Link
              href="/blog"
              className="text-[12px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            >
              Blog
            </Link>
            <span className="text-[12px] text-muted-foreground/60">
              MIT License
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
