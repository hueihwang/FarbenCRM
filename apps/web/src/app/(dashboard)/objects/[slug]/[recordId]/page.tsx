"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { RecordDetail } from "@/components/records/record-detail";
import { RelatedRecords } from "@/components/records/related-records";
import { ActivityTimeline } from "@/components/records/activity-timeline";
import { StageBar } from "@/components/records/stage-bar";
import { useDealOutcome } from "@/components/records/deal-outcome";
import { useToast } from "@/components/ui/toast";
import { RecordNotes } from "@/components/notes/record-notes";
import { RecordTasks } from "@/components/tasks/record-tasks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Trash2,
  Users,
  Building2,
  Handshake,
  Box,
} from "lucide-react";
import { extractPersonalName } from "@/lib/display-name";

interface ObjectData {
  id: string;
  slug: string;
  singularName: string;
  pluralName: string;
  icon: string;
  attributes: any[];
}

interface RecordData {
  id: string;
  objectId: string;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  lastActivityAt?: string;
  values: Record<string, unknown>;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  users: Users,
  "building-2": Building2,
  handshake: Handshake,
};

export default function RecordDetailPage() {
  const params = useParams<{ slug: string; recordId: string }>();
  const router = useRouter();
  const { slug, recordId } = params;

  const [object, setObject] = useState<ObjectData | null>(null);
  const [record, setRecord] = useState<RecordData | null>(null);
  const [related, setRelated] = useState<{ related: any[]; forward: any[] }>({
    related: [],
    forward: [],
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [stageVersion, setStageVersion] = useState(0);
  const toast = useToast();

  const refreshActivity = useCallback(async () => {
    setStageVersion((v) => v + 1);
    const actRes = await fetch(`/api/v1/objects/${slug}/records/${recordId}/activity`);
    if (actRes.ok) setActivities(await actRes.json().then((r) => r.data));
  }, [slug, recordId]);

  const outcome = useDealOutcome({
    objectSlug: slug,
    attributes: object?.attributes ?? [],
    onChanged: (_id, changes) => {
      setRecord((prev) =>
        prev ? { ...prev, values: { ...prev.values, ...changes }, lastActivityAt: new Date().toISOString() } : prev
      );
      refreshActivity();
    },
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [objRes, recRes] = await Promise.all([
        fetch(`/api/v1/objects/${slug}`),
        fetch(`/api/v1/objects/${slug}/records/${recordId}`),
      ]);

      if (objRes.ok) setObject(await objRes.json().then((r) => r.data));
      if (recRes.ok) setRecord(await recRes.json().then((r) => r.data));

      // Load related and activity in parallel
      const [relRes, actRes] = await Promise.all([
        fetch(`/api/v1/objects/${slug}/records/${recordId}/related`),
        fetch(`/api/v1/objects/${slug}/records/${recordId}/activity`),
      ]);

      if (relRes.ok) setRelated(await relRes.json().then((r) => r.data));
      if (actRes.ok) setActivities(await actRes.json().then((r) => r.data));
    } finally {
      setLoading(false);
    }
  }, [slug, recordId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpdate = useCallback(
    async (attrSlug: string, value: unknown) => {
      const isStatus = object?.attributes.find((a: any) => a.slug === attrSlug)?.type === "status";

      // Choosing Won or Lost in the Stage field goes through the same flow as the buttons
      if (isStatus && outcome.available && value === outcome.lost?.id) {
        outcome.requestLost(recordId);
        return;
      }
      if (isStatus && outcome.available && value === outcome.won?.id) {
        outcome.markWon(recordId, record?.values.company as { id: string; displayName?: string } | undefined);
        return;
      }

      const previous = record;
      setRecord((prev) =>
        prev
          ? { ...prev, values: { ...prev.values, [attrSlug]: value }, lastActivityAt: new Date().toISOString() }
          : prev
      );

      const res = await fetch(`/api/v1/objects/${slug}/records/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: { [attrSlug]: value } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error?.message ?? "Couldn't save the change");
        setRecord(previous);
        return;
      }

      // A stage change updates the stage bar and the activity feed
      if (isStatus) refreshActivity();
    },
    [slug, recordId, object, record, outcome, toast, refreshActivity]
  );

  const handleReopen = useCallback(async () => {
    const statusAttr = object?.attributes.find((a: any) => a.type === "status");
    if (!statusAttr) return;
    const open = (statusAttr.statuses ?? []).filter((s: any) => s.isActive);
    // Back to the last open stage the deal was in, else the first stage
    let target = open[0]?.id;
    const res = await fetch(`/api/v1/objects/${slug}/records/${recordId}/stage-history`);
    if (res.ok) {
      const h = (await res.json()).data;
      const lastOpen = [...(h?.changes ?? [])].reverse().find((c: any) => open.some((s: any) => s.id === c.toStatusId));
      if (lastOpen) target = lastOpen.toStatusId;
    }
    if (target) await handleUpdate(statusAttr.slug, target);
  }, [object, slug, recordId, handleUpdate]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Are you sure you want to delete this record?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/objects/${slug}/records/${recordId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push(`/objects/${slug}`);
      }
    } finally {
      setDeleting(false);
    }
  }, [slug, recordId, router]);

  if (loading && !record) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!object || !record) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Record not found
      </div>
    );
  }

  const nameAttr = object.attributes.find((a: any) => a.slug === "name");
  let displayName = "Unnamed";
  if (nameAttr) {
    const val = record.values.name;
    if (nameAttr.type === "personal_name" && val) {
      displayName = extractPersonalName(val) || "Unnamed";
    } else if (typeof val === "string") {
      displayName = val;
    }
  }

  const ObjIcon = iconMap[object.icon] || Box;

  return (
    <div className="flex h-full">
      {outcome.dialogs}
      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="border-b border-border px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-3 mb-3">
            <Link href={`/objects/${slug}`}>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ObjIcon className="h-4 w-4" />
              <Link href={`/objects/${slug}`} className="hover:text-foreground">
                {object.pluralName}
              </Link>
              <span>/</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold truncate">{displayName}</h1>
            <div className="flex shrink-0 items-center gap-1.5">
            {outcome.available && outcome.statusSlug && (() => {
              const current = record.values[outcome.statusSlug];
              const closed = current === outcome.won?.id || current === outcome.lost?.id;
              return closed ? (
                <Button variant="outline" size="sm" onClick={handleReopen}>
                  Reopen
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    className="bg-green-600 text-white hover:bg-green-700 hover:opacity-100"
                    onClick={() => outcome.markWon(recordId, record.values.company as { id: string; displayName?: string } | undefined)}
                  >
                    {outcome.won?.title ?? "Won"}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => outcome.requestLost(recordId)}>
                    {outcome.lost?.title ?? "Lost"}
                  </Button>
                </>
              );
            })()}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {deleting ? "Deleting..." : "Delete"}
            </Button>
            </div>
          </div>
          {object.attributes.some((a: any) => a.type === "status") && (
            <StageBar
              objectSlug={slug}
              recordId={recordId}
              version={stageVersion}
              lastActivityAt={record.lastActivityAt}
            />
          )}
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-6 py-3 sm:py-4">
          <Tabs defaultValue="attributes">
            <TabsList>
              <TabsTrigger value="attributes">Attributes</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="activity">
                Activity
                {activities.length > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {activities.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="related">
                Related
                {(related.related.length + related.forward.length) > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {related.related.length + related.forward.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="attributes">
              <RecordDetail
                attributes={object.attributes}
                values={record.values}
                onUpdate={handleUpdate}
              />
            </TabsContent>

            <TabsContent value="notes">
              <RecordNotes objectSlug={slug} recordId={recordId} />
            </TabsContent>

            <TabsContent value="tasks">
              <RecordTasks objectSlug={slug} recordId={recordId} />
            </TabsContent>

            <TabsContent value="activity">
              <ActivityTimeline activities={activities} />
            </TabsContent>

            <TabsContent value="related">
              <RelatedRecords
                related={related.related}
                forward={related.forward}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right sidebar - metadata */}
      <div className="hidden w-64 shrink-0 border-l border-border lg:block">
        <div className="p-4 space-y-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Record Info
          </h3>
          <div className="space-y-3">
            <MetaItem label="Record ID" value={record.id.slice(0, 8) + "..."} />
            <MetaItem label="Object" value={object.singularName} />
            <MetaItem
              label="Created"
              value={new Date(record.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            />
            <MetaItem
              label="Updated"
              value={new Date(record.updatedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}
