"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { AttributeType } from "@farbencrm/shared";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, Star, Building2 } from "lucide-react";

interface AttributeEditorProps {
  type: AttributeType;
  value: unknown;
  options?: { id: string; title: string; color: string }[];
  statuses?: { id: string; title: string; color: string; isActive: boolean }[];
  onSave: (value: unknown) => void;
  onCancel: () => void;
}

export function AttributeEditor({
  type,
  value,
  options,
  statuses,
  onSave,
  onCancel,
}: AttributeEditorProps) {
  switch (type) {
    case "text":
    case "email_address":
    case "phone_number":
    case "domain":
      return <TextEditor value={value as string} onSave={onSave} onCancel={onCancel} type={type === "email_address" ? "email" : type === "phone_number" ? "tel" : "text"} />;

    case "number":
    case "rating":
      if (type === "rating") {
        return <RatingEditor value={value as number} onSave={onSave} onCancel={onCancel} />;
      }
      return <NumberEditor value={value as number} onSave={onSave} onCancel={onCancel} />;

    case "currency":
      return <CurrencyEditor value={value as { amount?: number; currencyCode?: string }} onSave={onSave} onCancel={onCancel} />;

    case "date":
      return <DateEditor value={value as string} onSave={onSave} onCancel={onCancel} />;

    case "checkbox":
      // Toggle immediately
      onSave(!value);
      return null;

    case "select":
      return <SelectEditor value={value} options={options || []} onSave={onSave} onCancel={onCancel} />;

    case "status":
      return <StatusEditor value={value as string} statuses={statuses || []} onSave={onSave} onCancel={onCancel} />;

    case "personal_name":
      return <PersonalNameEditor value={value as { firstName?: string; lastName?: string; fullName?: string }} onSave={onSave} onCancel={onCancel} />;

    case "record_reference": {
      // Value may be { id, displayName } object or raw string UUID
      const refVal = value && typeof value === "object" && "id" in (value as Record<string, unknown>)
        ? (value as { id: string }).id
        : (value as string | null);
      return <RecordReferenceEditor value={refVal} onSave={onSave} onCancel={onCancel} />;
    }

    case "location":
      return <LocationEditor value={value as LocationValue} onSave={onSave} onCancel={onCancel} />;

    case "actor_reference": {
      // Value may be a hydrated { id, displayName } object or a raw user-ID string
      const actorId = value && typeof value === "object" && "id" in (value as Record<string, unknown>)
        ? (value as { id: string }).id
        : (value as string | null);
      return <ActorReferenceEditor value={actorId} onSave={onSave} onCancel={onCancel} />;
    }

    default:
      return <TextEditor value={String(value ?? "")} onSave={onSave} onCancel={onCancel} />;
  }
}

// ─── Sub-editors ─────────────────────────────────────────────────────

function TextEditor({ value, onSave, onCancel, type = "text" }: {
  value: string | null;
  onSave: (v: unknown) => void;
  onCancel: () => void;
  type?: string;
}) {
  const [text, setText] = useState(value ?? "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <Input
      ref={ref}
      type={type}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onSave(text || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSave(text || null);
        if (e.key === "Escape") onCancel();
      }}
      className="h-7 text-sm"
    />
  );
}

function NumberEditor({ value, onSave, onCancel }: {
  value: number | null;
  onSave: (v: unknown) => void;
  onCancel: () => void;
}) {
  const [num, setNum] = useState(value?.toString() ?? "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <Input
      ref={ref}
      type="number"
      value={num}
      onChange={(e) => setNum(e.target.value)}
      onBlur={() => onSave(num ? Number(num) : null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSave(num ? Number(num) : null);
        if (e.key === "Escape") onCancel();
      }}
      className="h-7 text-sm"
    />
  );
}

function CurrencyEditor({ value, onSave, onCancel }: {
  value: { amount?: number; currencyCode?: string } | null;
  onSave: (v: unknown) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(value?.amount?.toString() ?? "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  function save() {
    onSave(amount ? { amount: Number(amount), currencyCode: value?.currencyCode || "USD" } : null);
  }

  return (
    <Input
      ref={ref}
      type="number"
      step="0.01"
      value={amount}
      onChange={(e) => setAmount(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") onCancel();
      }}
      className="h-7 text-sm"
    />
  );
}

function DateEditor({ value, onSave, onCancel }: {
  value: string | null;
  onSave: (v: unknown) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(value ?? "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <Input
      ref={ref}
      type="date"
      value={date}
      onChange={(e) => {
        setDate(e.target.value);
        onSave(e.target.value || null);
      }}
      onBlur={() => onSave(date || null)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      className="h-7 text-sm"
    />
  );
}

function RatingEditor({ value, onSave, onCancel }: {
  value: number | null;
  onSave: (v: unknown) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={onCancel}>
      {Array.from({ length: 5 }, (_, i) => (
        <button
          key={i}
          onClick={() => onSave(i + 1)}
          className="hover:scale-110 transition-transform"
        >
          <Star
            className={`h-4 w-4 ${i < (value ?? 0) ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/40 hover:text-yellow-500"}`}
          />
        </button>
      ))}
    </div>
  );
}

function SelectEditor({ value, options, onSave, onCancel }: {
  value: unknown;
  options: { id: string; title: string; color: string }[];
  onSave: (v: unknown) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onCancel]);

  return (
    <div ref={ref} className="absolute z-50 mt-1 max-h-48 w-48 overflow-auto rounded-md border bg-popover p-1 shadow-lg">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onSave(opt.id)}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
            value === opt.id && "bg-accent"
          )}
        >
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: opt.color }} />
          {opt.title}
          {value === opt.id && <Check className="ml-auto h-3.5 w-3.5" />}
        </button>
      ))}
    </div>
  );
}

function StatusEditor({ value, statuses, onSave, onCancel }: {
  value: string | null;
  statuses: { id: string; title: string; color: string; isActive: boolean }[];
  onSave: (v: unknown) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onCancel]);

  return (
    <div ref={ref} className="absolute z-50 mt-1 max-h-48 w-48 overflow-auto rounded-md border bg-popover p-1 shadow-lg">
      {statuses.map((s) => (
        <button
          key={s.id}
          onClick={() => onSave(s.id)}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
            value === s.id && "bg-accent"
          )}
        >
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
          {s.title}
          {value === s.id && <Check className="ml-auto h-3.5 w-3.5" />}
        </button>
      ))}
    </div>
  );
}

function PersonalNameEditor({ value, onSave, onCancel }: {
  value: { firstName?: string; lastName?: string; fullName?: string } | null;
  onSave: (v: unknown) => void;
  onCancel: () => void;
}) {
  const [first, setFirst] = useState(value?.firstName ?? "");
  const [last, setLast] = useState(value?.lastName ?? "");
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  function save() {
    if (!first && !last) { onSave(null); return; }
    onSave({
      firstName: first || undefined,
      lastName: last || undefined,
      fullName: [first, last].filter(Boolean).join(" "),
    });
  }

  return (
    <div className="flex gap-1">
      <Input
        ref={firstRef}
        value={first}
        onChange={(e) => setFirst(e.target.value)}
        placeholder="First"
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
        className="h-7 text-sm"
      />
      <Input
        value={last}
        onChange={(e) => setLast(e.target.value)}
        placeholder="Last"
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
        className="h-7 text-sm"
      />
    </div>
  );
}

const OBJECT_COLORS: Record<string, string> = {
  companies: "bg-blue-500",
  people: "bg-purple-500",
  deals: "bg-orange-500",
};

function RecordReferenceEditor({ value, onSave, onCancel }: {
  value: string | null;
  onSave: (v: unknown) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { recordId: string; displayName: string; objectSlug: string; objectName: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ref.current?.focus();
    // Load initial results
    fetch("/api/v1/records/browse?limit=15")
      .then((r) => r.json())
      .then((data) => setResults(data.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) onCancel();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onCancel]);

  const search = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) {
      fetch("/api/v1/records/browse?limit=15")
        .then((r) => r.json())
        .then((data) => setResults(data.data || []))
        .catch(() => {});
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}&limit=15`);
        if (res.ok) {
          const data = await res.json();
          setResults(
            (data.data || [])
              .filter((r: { type: string }) => r.type === "record")
              .map((r: { id: string; title: string; objectSlug: string; objectName: string }) => ({
                recordId: r.id,
                displayName: r.title,
                objectSlug: r.objectSlug,
                objectName: r.objectName,
              }))
          );
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 250);
  }, []);

  return (
    <div ref={wrapperRef} className="absolute z-50 mt-1 w-64 rounded-md border bg-popover shadow-lg">
      <div className="p-1.5 border-b border-border">
        <Input
          ref={ref}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Search records..."
          className="h-7 text-sm"
        />
      </div>
      <div className="max-h-48 overflow-auto p-1">
        {loading && results.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">Loading...</p>
        )}
        {!loading && results.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">No records found</p>
        )}
        {/* Clear option */}
        {value && (
          <button
            onClick={() => onSave(null)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent mb-0.5"
          >
            Clear
          </button>
        )}
        {results.map((rec) => (
          <button
            key={rec.recordId}
            onClick={() => onSave(rec.recordId)}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
              value === rec.recordId && "bg-accent"
            )}
          >
            <div
              className={cn(
                "h-4 w-4 rounded flex items-center justify-center shrink-0",
                OBJECT_COLORS[rec.objectSlug] || "bg-muted-foreground"
              )}
            >
              <Building2 className="h-2.5 w-2.5 text-white" />
            </div>
            <span className="truncate flex-1 text-left">{rec.displayName}</span>
            {value === rec.recordId && <Check className="ml-auto h-3.5 w-3.5" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Location editor ─────────────────────────────────────────────────

export interface LocationValue {
  line1?: string;
  city?: string;
  state?: string;
  countryCode?: string;
  postcode?: string;
}

function LocationEditor({ value, onSave, onCancel }: {
  value: LocationValue | null | undefined;
  onSave: (v: unknown) => void;
  onCancel: () => void;
}) {
  const [city, setCity] = useState(value?.city ?? "");
  const [state, setState] = useState(value?.state ?? "");
  const [countryCode, setCountryCode] = useState(value?.countryCode ?? "");
  const [line1, setLine1] = useState(value?.line1 ?? "");
  const [postcode, setPostcode] = useState(value?.postcode ?? "");
  const cityRef = useRef<HTMLInputElement>(null);

  useEffect(() => { cityRef.current?.focus(); cityRef.current?.select(); }, []);

  const save = useCallback(() => {
    const v: LocationValue = {};
    if (line1.trim()) v.line1 = line1.trim();
    if (city.trim()) v.city = city.trim();
    if (state.trim()) v.state = state.trim();
    if (countryCode.trim()) v.countryCode = countryCode.trim().toUpperCase().slice(0, 2);
    if (postcode.trim()) v.postcode = postcode.trim();
    // If every field is empty, clear the value
    onSave(Object.keys(v).length === 0 ? null : v);
  }, [line1, city, state, countryCode, postcode, onSave]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };

  return (
    <div
      className="absolute z-50 top-0 left-0 min-w-[320px] rounded-md border border-border bg-popover p-2 shadow-lg space-y-1.5"
      onKeyDown={handleKey}
    >
      <Input
        ref={cityRef}
        value={city}
        onChange={(e) => setCity(e.target.value)}
        placeholder="City"
        className="h-8 text-sm"
      />
      <div className="flex gap-1.5">
        <Input
          value={state}
          onChange={(e) => setState(e.target.value)}
          placeholder="State / region"
          className="h-8 text-sm flex-1"
        />
        <Input
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))}
          placeholder="MY"
          maxLength={2}
          className="h-8 text-sm w-16 uppercase"
        />
      </div>
      <Input
        value={line1}
        onChange={(e) => setLine1(e.target.value)}
        placeholder="Street (optional)"
        className="h-8 text-sm"
      />
      <Input
        value={postcode}
        onChange={(e) => setPostcode(e.target.value)}
        placeholder="Postcode (optional)"
        className="h-8 text-sm"
      />
      <div className="flex gap-1.5 justify-end pt-1">
        <button
          onClick={onCancel}
          className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          Cancel
        </button>
        <button
          onClick={save}
          className="text-xs px-2 py-1 rounded bg-foreground text-background hover:opacity-90"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Actor reference editor (workspace user dropdown) ────────────────

interface WorkspaceMember {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
}

function ActorReferenceEditor({ value, onSave, onCancel }: {
  value: string | null;
  onSave: (v: unknown) => void;
  onCancel: () => void;
}) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    fetch("/api/v1/workspace-members")
      .then((r) => r.json())
      .then((d) => setMembers(d.data ?? []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = members.filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (m.userName ?? "").toLowerCase().includes(q) ||
      (m.userEmail ?? "").toLowerCase().includes(q)
    );
  });

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };

  return (
    <div
      className="absolute z-50 top-0 left-0 min-w-[260px] rounded-md border border-border bg-popover shadow-lg"
      onKeyDown={handleKey}
    >
      <div className="p-1.5 border-b border-border">
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search team members..."
          className="h-8 text-sm"
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {loading && (
          <div className="px-2 py-2 text-xs text-muted-foreground">Loading team…</div>
        )}
        {!loading && (
          <>
            {/* Unassign option */}
            <button
              onMouseDown={(e) => { e.preventDefault(); onSave(null); }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left hover:bg-accent",
                !value && "bg-accent/50"
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground">
                <span className="text-[10px]">×</span>
              </span>
              <span className="text-muted-foreground">Unassigned</span>
            </button>

            {filtered.length === 0 && !loading && (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                {query ? "No members match" : "No team members"}
              </div>
            )}

            {filtered.map((m) => {
              const selected = m.userId === value;
              const name = m.userName || m.userEmail;
              return (
                <button
                  key={m.userId}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    // Save the full hydrated shape so the optimistic UI update
                    // matches what the server returns on the next fetch. The
                    // server's writeValues() extracts .id when persisting.
                    onSave({
                      id: m.userId,
                      displayName: name,
                      email: m.userEmail,
                    });
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left hover:bg-accent",
                    selected && "bg-accent/50"
                  )}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary shrink-0">
                    {(name || "?").charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{name}</div>
                    {m.userName && m.userEmail && m.userName !== m.userEmail && (
                      <div className="truncate text-[11px] text-muted-foreground">{m.userEmail}</div>
                    )}
                  </div>
                  {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
