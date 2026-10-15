"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";

interface Stage {
  id: string;
  title: string;
  color: string;
  isActive: boolean;
  rottingDays?: number | null;
}

/**
 * Per-stage "rots after X days" settings for a status attribute (e.g. Deals > Stage).
 * Blank means the stage never rots. Closed stages (Won, Lost) never rot.
 */
export function PipelineStageSettings({
  objectSlug,
  attributeTitle,
  stages,
}: {
  objectSlug: string;
  attributeTitle: string;
  stages: Stage[];
}) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(stages.map((s) => [s.id, s.rottingDays ? String(s.rottingDays) : ""]))
  );
  const [saved, setSaved] = useState<Record<string, string>>(values);

  async function save(stage: Stage) {
    const raw = (values[stage.id] ?? "").trim();
    if (raw === (saved[stage.id] ?? "")) return;
    const days = raw === "" ? null : Number(raw);
    if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 365)) {
      toast.error("Enter whole days from 1 to 365, or leave blank to switch rotting off");
      setValues((v) => ({ ...v, [stage.id]: saved[stage.id] ?? "" }));
      return;
    }
    const res = await fetch(`/api/v1/objects/${objectSlug}/attributes/options`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId: stage.id, attributeType: "status", rottingDays: days }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error?.message ?? "Couldn't save the rotting limit");
      return;
    }
    setSaved((v) => ({ ...v, [stage.id]: raw }));
    toast.success(days ? `${stage.title} rots after ${days} days` : `${stage.title} never rots`);
  }

  return (
    <div className="border-t border-border px-4 py-3">
      <h4 className="text-sm font-medium">{attributeTitle}: pipeline stages</h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
        A deal turns red as &quot;rotting&quot; when nothing has happened on it (no edit, note or task) for this many
        days in that stage. Leave blank to switch off.
      </p>
      <div className="mt-3 space-y-1.5">
        {stages.map((stage) => (
          <div key={stage.id} className="flex items-center gap-3 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
            <span className="w-40 truncate">{stage.title}</span>
            {stage.isActive ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Rots after
                <input
                  type="number"
                  min={1}
                  max={365}
                  inputMode="numeric"
                  aria-label={`Rotting days for ${stage.title}`}
                  value={values[stage.id] ?? ""}
                  placeholder="never"
                  onChange={(e) => setValues((v) => ({ ...v, [stage.id]: e.target.value }))}
                  onBlur={() => save(stage)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="h-7 w-20 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                />
                days
              </label>
            ) : (
              <span className="text-xs text-muted-foreground">Closed stage, never rots</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
