"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Flame, Loader2, Plus, Search, Snowflake, Sun, User2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import { useToast } from "@/components/ui/toast";

// ─── Types ───────────────────────────────────────────────────────────

type Urgency = "Hot" | "Warm" | "Cool";

interface SearchHit {
  type: "record" | "list";
  id: string;
  title: string;
  subtitle: string;
  objectSlug?: string;
}

interface ListOption {
  id: string;
  name: string;
  objectSlug: string;
}

interface MemberOption {
  userId: string;
  userName: string;
}

interface CompanyChoice {
  id: string | null; // null means "create new with this name"
  name: string;
}

const URGENCIES: {
  value: Urgency;
  label: string;
  tone: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "Hot", label: "Hot", tone: "bg-red-500 hover:bg-red-600", Icon: Flame },
  { value: "Warm", label: "Warm", tone: "bg-amber-500 hover:bg-amber-600", Icon: Sun },
  { value: "Cool", label: "Cool", tone: "bg-slate-500 hover:bg-slate-600", Icon: Snowflake },
];

// ─── Page ────────────────────────────────────────────────────────────

export default function BoothPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const toast = useToast();

  // Context (set once per session, persists across captures)
  const [lists, setLists] = useState<ListOption[]>([]);
  const [listId, setListId] = useState<string>(""); // "" = no event
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [capturedBy, setCapturedBy] = useState<string>("");

  // Per-capture
  const [company, setCompany] = useState<CompanyChoice | null>(null);
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyHits, setCompanyHits] = useState<SearchHit[]>([]);
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  const [urgency, setUrgency] = useState<Urgency | null>(null);
  const [noteContent, setNoteContent] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Default "Captured by" to logged-in user. localStorage override wins so
  // that an iPad with a shared login can be set to the actual staff name
  // and it sticks across reloads.
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("booth:captured-by") : null;
    if (stored) setCapturedBy(stored);
    else if (session?.user?.name) setCapturedBy(session.user.name);
  }, [session]);

  // Persist the "Captured by" override
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (capturedBy) window.localStorage.setItem("booth:captured-by", capturedBy);
  }, [capturedBy]);

  // Default "Event" to localStorage choice (sticks across reloads)
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("booth:list-id") : null;
    if (stored) setListId(stored);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (listId) window.localStorage.setItem("booth:list-id", listId);
    else window.localStorage.removeItem("booth:list-id");
  }, [listId]);

  // Fetch lists for the Event picker — only People-object lists, since we
  // add Person records to whichever list is selected.
  useEffect(() => {
    fetch("/api/v1/lists")
      .then((res) => res.json())
      .then((body) => {
        const items: ListOption[] = (body?.data ?? []).filter(
          (l: ListOption) => l.objectSlug === "people"
        );
        setLists(items);
      })
      .catch(() => {});
  }, []);

  // Fetch workspace members for the Captured-by dropdown.
  useEffect(() => {
    fetch("/api/v1/workspace-members")
      .then((res) => res.json())
      .then((body) => {
        const items: MemberOption[] = (body?.data ?? []).map(
          (m: { userId: string; userName: string | null }) => ({
            userId: m.userId,
            userName: m.userName ?? "(unnamed)",
          })
        );
        setMembers(items);
      })
      .catch(() => {});
  }, []);

  // Debounced company search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!companyQuery.trim() || company) {
      setCompanyHits([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/v1/search?q=${encodeURIComponent(companyQuery)}&limit=10`
        );
        if (res.ok) {
          const data = await res.json();
          const hits: SearchHit[] = (data.data || []).filter(
            (r: SearchHit) => r.type === "record" && r.objectSlug === "companies"
          );
          setCompanyHits(hits);
        }
      } finally {
        setSearching(false);
      }
    }, 200);
  }, [companyQuery, company]);

  function pickCompany(hit: SearchHit) {
    setCompany({ id: hit.id, name: hit.title });
    setCompanyQuery(hit.title);
    setCompanySearchOpen(false);
  }

  function pickNewCompany() {
    if (!companyQuery.trim()) return;
    setCompany({ id: null, name: companyQuery.trim() });
    setCompanySearchOpen(false);
  }

  function clearCompany() {
    setCompany(null);
    setCompanyQuery("");
    setCompanyHits([]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!company || !noteContent.trim()) return;
    setSubmitting(true);

    const wantsPerson =
      firstName.trim() || lastName.trim() || email.trim() || phone.trim();

    try {
      const res = await fetch("/api/v1/booth-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company.id ? { id: company.id } : { name: company.name },
          person: wantsPerson
            ? {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim() || undefined,
                phone: phone.trim() || undefined,
                jobTitle: jobTitle.trim() || undefined,
              }
            : undefined,
          noteContent: noteContent.trim(),
          urgency: urgency ?? undefined,
          listId: listId || undefined,
          capturedBy: capturedBy.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      toast.success(`Saved — ${company.name}`);
      // Reset per-capture state. Keep Event + Captured by for the session.
      clearCompany();
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setJobTitle("");
      setUrgency(null);
      setNoteContent("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !!company && !!noteContent.trim() && !submitting;
  const activeList = lists.find((l) => l.id === listId);

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Booth quick note</h1>
        <p className="text-sm text-muted-foreground">
          One screen to log a meeting. Creates Company + Person + Note in one
          action.
        </p>
      </div>

      {/* Session context — set once, persists across captures via localStorage */}
      <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Event / context
          </Label>
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— No event (general conversation) —</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Captured by
          </Label>
          <select
            value={capturedBy}
            onChange={(e) => setCapturedBy(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {members.length === 0 && (
              <option value="">— Loading users… —</option>
            )}
            {/* If the stored name isn't a current workspace member (e.g.
                stale localStorage from a previous staff member), surface
                it so the user can see and re-pick. */}
            {capturedBy && !members.some((m) => m.userName === capturedBy) && (
              <option value={capturedBy}>{capturedBy}</option>
            )}
            {members.map((m) => (
              <option key={m.userId} value={m.userName}>
                {m.userName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {/* Company */}
        <Section title="Company" icon={<Building2 className="h-4 w-4" />}>
          {company ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{company.name}</span>
                {company.id ? (
                  <span className="text-xs text-muted-foreground shrink-0">existing</span>
                ) : (
                  <span className="text-xs text-amber-600 shrink-0">will create</span>
                )}
              </div>
              <button
                type="button"
                onClick={clearCompany}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={companyQuery}
                onChange={(e) => {
                  setCompanyQuery(e.target.value);
                  setCompanySearchOpen(true);
                }}
                onFocus={() => setCompanySearchOpen(true)}
                placeholder="Type company name…"
                className="pl-9"
                autoComplete="off"
              />
              {companySearchOpen && companyQuery.trim() && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-60 overflow-auto">
                  {searching && (
                    <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                    </div>
                  )}
                  {!searching &&
                    companyHits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        onClick={() => pickCompany(hit)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                      >
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium truncate">{hit.title}</span>
                        {hit.subtitle && (
                          <span className="text-muted-foreground truncate">
                            {hit.subtitle}
                          </span>
                        )}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={pickNewCompany}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left",
                      companyHits.length > 0 && "border-t"
                    )}
                  >
                    <Plus className="h-3.5 w-3.5 text-green-600" />
                    Create new: <span className="font-medium">{companyQuery}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Person (optional) */}
        <Section
          title="Person (optional)"
          icon={<User2 className="h-4 w-4" />}
          subtitle="Skip if you didn't get the visitor's name"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Last name">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </div>
          <Field label="Role">
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Procurement Manager" />
          </Field>
        </Section>

        {/* Urgency + Note */}
        <Section title="The conversation">
          <Field label="Urgency">
            <div className="grid grid-cols-3 gap-2">
              {URGENCIES.map((u) => {
                const active = urgency === u.value;
                return (
                  <button
                    key={u.value}
                    type="button"
                    onClick={() => setUrgency(active ? null : u.value)}
                    aria-pressed={active}
                    aria-label={`Urgency ${u.label}`}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md py-2.5 font-medium text-white text-sm transition-opacity",
                      u.tone,
                      active ? "opacity-100" : "opacity-30"
                    )}
                  >
                    <u.Icon className="h-4 w-4" aria-hidden="true" />
                    {u.label}
                  </button>
                );
              })}
            </div>
            {urgency === null && (
              <p className="text-xs text-muted-foreground">
                Optional. Sets urgency on the Person record.
              </p>
            )}
          </Field>
          <Field label="What did they say?">
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={5}
              required
              placeholder="What they need, who else they're talking to, follow-up commitments…"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </Field>
        </Section>

        {activeList && (
          <p className="text-xs text-muted-foreground">
            This note will be tagged <strong>[{activeList.name}]</strong>
            {capturedBy && (
              <>
                {" "}and saved as captured by <strong>{capturedBy}</strong>
              </>
            )}
            .
          </p>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" disabled={!canSubmit} className="flex-1">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              "Save booth note"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/notes")}
          >
            All notes
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── Local primitives ────────────────────────────────────────────────

function Section({
  title,
  icon,
  subtitle,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border bg-card p-4 space-y-3">
      <legend className="px-1 text-sm font-semibold flex items-center gap-1.5">
        {icon}
        {title}
      </legend>
      {subtitle && <p className="text-xs text-muted-foreground -mt-2">{subtitle}</p>}
      {children}
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
