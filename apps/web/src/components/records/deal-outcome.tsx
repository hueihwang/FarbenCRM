"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface Stage {
  id: string;
  title: string;
  isActive: boolean;
  celebrationEnabled?: boolean;
}
interface Attr {
  slug: string;
  type: string;
  statuses?: Stage[];
  options?: { id: string; title: string }[];
}
type Changes = Record<string, unknown>;

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the user's own time zone

async function patchRecord(objectSlug: string, recordId: string, values: Changes) {
  const res = await fetch(`/api/v1/objects/${objectSlug}/records/${recordId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Couldn't save");
  }
}

/**
 * Won and Lost flow for objects with a pipeline (Deals): Lost asks for a
 * required Lost Reason and an optional comment (saved as a note); Won offers
 * to update the company's Last Order Date and Customer Type.
 * `onChanged` receives the values that were saved, for optimistic UI updates.
 */
export function useDealOutcome({
  objectSlug,
  attributes,
  onChanged,
}: {
  objectSlug: string;
  attributes: Attr[];
  onChanged: (recordId: string, changes: Changes) => void;
}) {
  const toast = useToast();
  const statusAttr = attributes.find((a) => a.type === "status");
  const stages = statusAttr?.statuses ?? [];
  const won = stages.find((s) => !s.isActive && s.celebrationEnabled);
  const lost = stages.find((s) => !s.isActive && !s.celebrationEnabled);
  const reasons = attributes.find((a) => a.slug === "lost_reason")?.options ?? [];
  const needsReason = attributes.some((a) => a.slug === "lost_reason");

  const [lostFor, setLostFor] = useState<string | null>(null);
  const [reasonId, setReasonId] = useState("");
  const [comment, setComment] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [wonFor, setWonFor] = useState<{ recordId: string; company: { id: string; displayName?: string } } | null>(null);
  const [busy, setBusy] = useState(false);

  async function markLostDirect(recordId: string, values: Changes) {
    await patchRecord(objectSlug, recordId, values);
    onChanged(recordId, values);
  }

  /** Start "mark as Lost": opens the reason dialog when a Lost Reason field exists. */
  async function requestLost(recordId: string) {
    if (!statusAttr || !lost) return;
    if (!needsReason) {
      try {
        await markLostDirect(recordId, { [statusAttr.slug]: lost.id });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    setReasonId("");
    setComment("");
    setReasonError("");
    setLostFor(recordId);
  }

  async function confirmLost() {
    if (!lostFor || !statusAttr || !lost) return;
    if (!reasonId) {
      setReasonError("Choose a reason first");
      return;
    }
    setBusy(true);
    try {
      await markLostDirect(lostFor, { [statusAttr.slug]: lost.id, lost_reason: reasonId });
      if (comment.trim()) {
        const reason = reasons.find((r) => r.id === reasonId)?.title ?? "Lost";
        await fetch(`/api/v1/objects/${objectSlug}/records/${lostFor}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Lost: ${reason}`,
            content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: comment.trim() }] }] },
          }),
        });
      }
      toast.success(`Marked ${lost.title}`);
      setLostFor(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Mark as Won; afterwards offer to update the linked company. */
  async function markWon(recordId: string, company?: { id: string; displayName?: string } | null) {
    if (!statusAttr || !won) return;
    try {
      await patchRecord(objectSlug, recordId, { [statusAttr.slug]: won.id });
      onChanged(recordId, { [statusAttr.slug]: won.id });
      toast.success(`Marked ${won.title}`);
      if (company?.id) setWonFor({ recordId, company });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function confirmWon() {
    if (!wonFor) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/objects/companies/attributes`);
      const attrs: Attr[] = res.ok ? (await res.json()).data : [];
      const values: Changes = {};
      if (attrs.some((a) => a.slug === "last_order_date")) values.last_order_date = today();
      const active = attrs.find((a) => a.slug === "customer_type")?.options?.find((o) => o.title === "Active Customer");
      if (active) values.customer_type = active.id;
      if (Object.keys(values).length) {
        await patchRecord("companies", wonFor.company.id, values);
        toast.success(`${wonFor.company.displayName ?? "Company"} updated`);
      }
      setWonFor(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const dialogs = (
    <>
      <Dialog open={!!lostFor} onOpenChange={(o) => !o && !busy && setLostFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as {lost?.title ?? "Lost"}</DialogTitle>
            <DialogDescription>Why was this deal lost? This feeds the lost-reason figures for management.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="font-medium">Lost Reason</span>
              <select
                value={reasonId}
                onChange={(e) => {
                  setReasonId(e.target.value);
                  setReasonError("");
                }}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                aria-invalid={!!reasonError}
              >
                <option value="">Choose a reason</option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
              {reasonError && <span className="mt-1 block text-xs text-destructive">{reasonError}</span>}
            </label>
            <label className="block text-sm">
              <span className="font-medium">Comment</span> <span className="text-muted-foreground">(optional, saved as a note)</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Went with a cheaper local supplier at RM 14/kg"
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLostFor(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmLost} disabled={busy}>
              Mark as {lost?.title ?? "Lost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!wonFor} onOpenChange={(o) => !o && !busy && setWonFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update {wonFor?.company.displayName ?? "the company"}?</DialogTitle>
            <DialogDescription>
              Set its Last Order Date to today and its Customer Type to Active Customer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWonFor(null)} disabled={busy}>
              Not now
            </Button>
            <Button onClick={confirmWon} disabled={busy}>
              Update company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { available: !!(statusAttr && won && lost), statusSlug: statusAttr?.slug, won, lost, requestLost, markWon, dialogs };
}
