"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Insights, Money, PeriodKey } from "@/services/insights-calc";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

function money(m: Money | undefined): string {
  const entries = Object.entries(m ?? {}).filter(([, v]) => v);
  if (entries.length === 0) return "0";
  return entries
    .map(([cur, amt]) => {
      try {
        return new Intl.NumberFormat("en-MY", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(amt);
      } catch {
        return `${cur} ${Math.round(amt).toLocaleString()}`;
      }
    })
    .join(" + ");
}
const total = (m: Money | undefined) => Object.values(m ?? {}).reduce((a, b) => a + b, 0);

export default function InsightsPage() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/v1/insights?period=${period}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't load insights");
        if (!cancelled) setData(json.data);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const periodLabel = PERIODS.find((p) => p.key === period)!.label.toLowerCase();

  return (
    <div className="p-4 sm:p-6 max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">Insights</h1>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex rounded-md border border-border text-xs" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                "px-2.5 py-1.5 first:rounded-l-md last:rounded-r-md transition-colors",
                period === p.key ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile href="#pipeline" label="Open pipeline" value={money(data.kpis.open.value)} sub={`${data.kpis.open.count} open deals`} />
            <Tile href="#won-lost" label={`Won ${periodLabel}`} value={money(data.kpis.won.value)} sub={`${data.kpis.won.count} deals`} tone="good" />
            <Tile
              href="#won-lost"
              label={`Win rate ${periodLabel}`}
              value={data.kpis.winRate === null ? "n/a" : `${data.kpis.winRate}%`}
              sub={`${data.kpis.won.count} won, ${data.kpis.lost.count} lost`}
            />
            <Tile href="#rotting" label="Rotting deals" value={String(data.kpis.rotting)} sub="idle past their stage limit" tone={data.kpis.rotting ? "bad" : undefined} />
            <Tile href="#overdue" label="Overdue tasks" value={String(data.kpis.overdueTasks)} sub="past due, not done" tone={data.kpis.overdueTasks ? "bad" : undefined} />
            <Tile href="#samples" label="Samples awaiting feedback" value={String(data.kpis.samplesAwaiting)} sub="Sample Status: Sent" />
            <Tile href="#quiet" label="Quiet customers" value={String(data.kpis.quietCustomers)} sub="active, no order in 90 days" tone={data.kpis.quietCustomers ? "warn" : undefined} />
            <Tile href="#owners" label="Salespeople" value={String(data.byOwner.length)} sub="with open or won deals" />
          </div>

          {/* Pipeline by stage */}
          <Section id="pipeline" title="Pipeline by stage" note="Current deals in each stage">
            {(() => {
              const max = Math.max(1, ...data.pipeline.map((s) => total(s.value) || s.count));
              return data.pipeline.map((s) => (
                <BarRow
                  key={s.stageId}
                  label={s.isOpen ? s.title : `${s.title} (closed)`}
                  color={s.color}
                  width={(total(s.value) || s.count) / max}
                  right={`${s.count} · ${money(s.value)}`}
                  deals={s.deals}
                />
              ));
            })()}
          </Section>

          {/* Won and lost */}
          <Section id="won-lost" title={`Won and lost ${periodLabel}`} note="Deals that entered Won or Lost in the period">
            <BarRow label="Won" color="#22c55e" width={1} right={`${data.kpis.won.count} · ${money(data.kpis.won.value)}`} deals={data.kpis.won.deals} />
            <BarRow
              label="Lost"
              color="#ef4444"
              width={data.kpis.won.count ? Math.min(1, data.kpis.lost.count / Math.max(1, data.kpis.won.count)) : data.kpis.lost.count ? 1 : 0}
              right={`${data.kpis.lost.count} · ${money(data.kpis.lost.value)}`}
              deals={data.kpis.lost.deals}
            />
          </Section>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Funnel */}
            <Section id="funnel" title="Conversion" note={`Deals created ${periodLabel}, by the furthest stage they reached`}>
              {(() => {
                const max = Math.max(1, data.funnel[0]?.reached ?? 1);
                return data.funnel.map((s) => (
                  <BarRow
                    key={s.stageId}
                    label={s.title}
                    color="#6366f1"
                    width={s.reached / max}
                    right={`${s.reached}${s.conversionFromPrevious === null ? "" : ` · ${s.conversionFromPrevious}%`}`}
                    deals={s.deals}
                  />
                ));
              })()}
            </Section>

            {/* Average days in stage */}
            <Section id="days" title="Average days in stage" note={`Completed stays that ended ${periodLabel}`}>
              {(() => {
                const max = Math.max(1, ...data.avgDaysInStage.map((s) => s.avgDays ?? 0));
                return data.avgDaysInStage.map((s) => (
                  <BarRow
                    key={s.stageId}
                    label={s.title}
                    color="#a855f7"
                    width={(s.avgDays ?? 0) / max}
                    right={s.avgDays === null ? "no data yet" : `${s.avgDays} days (${s.deals} deals)`}
                  />
                ));
              })()}
            </Section>
          </div>

          {/* Per salesperson */}
          <Section id="owners" title="By salesperson" note={`Open now; won ${periodLabel}`}>
            {data.byOwner.length === 0 ? (
              <Empty />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1.5 font-medium">Salesperson</th>
                      <th className="py-1.5 font-medium">Open</th>
                      <th className="py-1.5 font-medium">Open value</th>
                      <th className="py-1.5 font-medium">Won</th>
                      <th className="py-1.5 font-medium">Won value</th>
                      <th className="py-1.5 font-medium">Rotting</th>
                      <th className="py-1.5 font-medium">Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byOwner.map((o) => (
                      <tr key={o.owner} className="border-t border-border/50">
                        <td className="py-1.5">{o.owner}</td>
                        <td className="py-1.5">{o.openCount}</td>
                        <td className="py-1.5">{money(o.openValue)}</td>
                        <td className="py-1.5">{o.wonCount}</td>
                        <td className="py-1.5">{money(o.wonValue)}</td>
                        <td className={cn("py-1.5", o.rotting && "text-destructive font-medium")}>{o.rotting}</td>
                        <td className={cn("py-1.5", o.overdue && "text-destructive font-medium")}>{o.overdue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section id="rotting" title="Rotting deals" note="Idle longer than their stage allows">
              <ItemList
                items={data.rotting.map((d) => ({
                  key: d.id,
                  href: `/objects/deals/${d.id}`,
                  title: d.name,
                  detail: `${d.stage} · ${d.owner ?? "no owner"}`,
                  badge: `${d.idleDays}d idle (limit ${d.limit})`,
                  tone: "bad" as const,
                }))}
              />
            </Section>

            <Section id="overdue" title="Overdue tasks by person">
              {data.overdueByPerson.length === 0 ? (
                <Empty />
              ) : (
                data.overdueByPerson.map((g) => (
                  <Expandable key={g.owner} label={g.owner} count={g.tasks.length}>
                    <ItemList
                      items={g.tasks.map((t) => ({
                        key: t.id,
                        href: t.linked[0] ? `/objects/deals/${t.linked[0].id}` : "/tasks",
                        title: t.content,
                        detail: t.linked.map((l) => l.name).join(", ") || "not linked",
                        badge: `due ${t.due}`,
                        tone: "bad" as const,
                      }))}
                    />
                  </Expandable>
                ))
              )}
            </Section>

            <Section id="samples" title="Samples awaiting feedback" note="Open deals with Sample Status Sent">
              <ItemList
                items={data.samplesAwaiting.map((d) => ({
                  key: d.id,
                  href: `/objects/deals/${d.id}`,
                  title: d.name,
                  detail: d.owner ?? "no owner",
                  badge: d.daysWaiting === null ? "no sent date" : `${d.daysWaiting}d waiting`,
                }))}
              />
            </Section>

            <Section id="quiet" title="Quiet customers" note="Active customers with no order in 90 days">
              <ItemList
                items={data.quietCustomers.map((c) => ({
                  key: c.id,
                  href: `/objects/companies/${c.id}`,
                  title: c.name,
                  detail: c.personInCharge ?? "no person in charge",
                  badge: c.daysSinceOrder === null ? "no order date" : `${c.daysSinceOrder}d since order`,
                  tone: "warn" as const,
                }))}
              />
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Building blocks ─────────────────────────────────────────────────

const TONES = {
  good: "text-green-600 dark:text-green-400",
  bad: "text-destructive",
  warn: "text-amber-600 dark:text-amber-400",
};

function Tile({ href, label, value, sub, tone }: { href: string; label: string; value: string; sub: string; tone?: keyof typeof TONES }) {
  return (
    <a href={href} className="block">
      <Card className="h-full p-3 sm:p-4 hover:shadow-md transition-shadow">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-lg sm:text-xl font-semibold truncate", tone && TONES[tone])}>{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">{sub}</p>
      </Card>
    </a>
  );
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="p-4 scroll-mt-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <div className="mt-3 space-y-2">{children}</div>
    </Card>
  );
}

function BarRow({ label, color, width, right, deals }: { label: string; color: string; width: number; right: string; deals?: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const canOpen = !!deals && deals.length > 0;
  return (
    <div>
      <button
        type="button"
        onClick={() => canOpen && setOpen((o) => !o)}
        className={cn("w-full text-left", canOpen ? "cursor-pointer" : "cursor-default")}
        aria-expanded={canOpen ? open : undefined}
      >
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1 truncate">
            {canOpen && (open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
            {label}
          </span>
          <span className="shrink-0 text-muted-foreground">{right}</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-muted">
          <div className="h-2 rounded-full" style={{ width: `${Math.max(width > 0 ? 2 : 0, Math.round(width * 100))}%`, backgroundColor: color }} />
        </div>
      </button>
      {open && deals && (
        <ul className="mt-1.5 ml-4 space-y-0.5 text-xs">
          {deals.map((d) => (
            <li key={d.id}>
              <Link href={`/objects/deals/${d.id}`} className="text-primary hover:underline">
                {d.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Expandable({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-sm" aria-expanded={open}>
        <span className="flex items-center gap-1">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {label}
        </span>
        <span className="rounded-full bg-destructive/10 px-2 text-xs font-medium text-destructive">{count}</span>
      </button>
      {open && <div className="mt-1.5 ml-4">{children}</div>}
    </div>
  );
}

function ItemList({
  items,
}: {
  items: { key: string; href: string; title: string; detail: string; badge: string; tone?: keyof typeof TONES }[];
}) {
  if (items.length === 0) return <Empty />;
  return (
    <ul className="divide-y divide-border/50">
      {items.map((i) => (
        <li key={i.key} className="flex items-center justify-between gap-2 py-1.5">
          <div className="min-w-0">
            <Link href={i.href} className="block truncate text-sm text-primary hover:underline">
              {i.title}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{i.detail}</p>
          </div>
          <span className={cn("shrink-0 text-xs", i.tone ? TONES[i.tone] : "text-muted-foreground")}>{i.badge}</span>
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  return <p className="text-xs text-muted-foreground">Nothing here right now.</p>;
}
