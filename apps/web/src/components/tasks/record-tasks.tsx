"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Check, Circle, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskDialog } from "./task-dialog";
import { ActivityIcon } from "./activity-icon";
import { describeDue, DUE_TONE_CLASS } from "./activity-due";
import { activityLabel, type ActivityType } from "@/lib/activity-types";

interface Task {
  id: string;
  content: string;
  type: ActivityType;
  deadline: string | null;
  hasDueTime: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  linkedRecords: { id: string; displayName: string; objectSlug: string }[];
  assignees: { id: string; name: string; email: string }[];
}

interface RecordTasksProps {
  objectSlug: string;
  recordId: string;
  recordDisplayName?: string;
  /** Called after any activity is created, changed or completed */
  onChanged?: () => void;
}

/** Activities of one record, Pipedrive style: completing one asks for the next. */
export function RecordTasks({ objectSlug, recordId, recordDisplayName, onChanged }: RecordTasksProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [askNext, setAskNext] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/objects/${objectSlug}/records/${recordId}/tasks`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.data);
      }
    } finally {
      setLoading(false);
    }
  }, [objectSlug, recordId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    fetch("/api/auth/get-session")
      .then((r) => r.json())
      .then((data) => {
        if (data?.user) setCurrentUserId(data.user.id);
      })
      .catch(() => {});
  }, []);

  async function toggleComplete(taskId: string, isCompleted: boolean) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, isCompleted: !isCompleted } : t)));
    await fetch(`/api/v1/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted: !isCompleted }),
    });
    // Just completed one and nothing else is planned: suggest the next step
    if (!isCompleted && !tasks.some((t) => t.id !== taskId && !t.isCompleted)) setAskNext(true);
    onChanged?.();
  }

  function openCreateDialog() {
    setAskNext(false);
    setDialogMode("create");
    setEditingTask(null);
    setDialogOpen(true);
  }

  function openEditDialog(task: Task) {
    setDialogMode("edit");
    setEditingTask(task);
    setDialogOpen(true);
  }

  async function handleSave(data: {
    content: string;
    deadline: string | null;
    type: ActivityType;
    hasDueTime: boolean;
    recordIds: string[];
    assigneeIds: string[];
  }) {
    if (dialogMode === "create") {
      const res = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create activity");
    } else if (editingTask) {
      const res = await fetch(`/api/v1/tasks/${editingTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update activity");
    }
    fetchTasks();
    onChanged?.();
  }

  async function handleDelete() {
    if (!editingTask) return;
    await fetch(`/api/v1/tasks/${editingTask.id}`, { method: "DELETE" });
    fetchTasks();
    onChanged?.();
  }

  const openTasks = tasks
    .filter((t) => !t.isCompleted)
    .sort((a, b) => (a.deadline ? Date.parse(a.deadline) : Infinity) - (b.deadline ? Date.parse(b.deadline) : Infinity));
  const completedTasks = tasks.filter((t) => t.isCompleted);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Activities</h3>
        <Button variant="ghost" size="sm" onClick={openCreateDialog} className="text-xs">
          <Plus className="mr-1 h-3.5 w-3.5" />
          Schedule activity
        </Button>
      </div>

      {askNext && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="flex-1">Done. Schedule the next activity?</span>
          <Button size="sm" className="h-7 text-xs" onClick={openCreateDialog}>
            Schedule
          </Button>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setAskNext(false)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading && tasks.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">Loading...</p>}

      {!loading && openTasks.length === 0 && !askNext && (
        <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          No next activity planned.
          <button className="ml-auto font-medium underline-offset-2 hover:underline" onClick={openCreateDialog}>
            Schedule one
          </button>
        </div>
      )}

      <div className="space-y-1">
        {openTasks.map((task) => {
          const due = describeDue(task.deadline, task.hasDueTime);
          return (
            <div
              key={task.id}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/30 cursor-pointer"
              onClick={() => openEditDialog(task)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleComplete(task.id, task.isCompleted);
                }}
                className="shrink-0"
                aria-label={`Mark "${task.content}" as done`}
              >
                <Circle className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
              </button>
              <span title={activityLabel(task.type)} className="shrink-0 text-muted-foreground">
                <ActivityIcon type={task.type} className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm flex-1 truncate">{task.content}</span>
              {task.deadline && <span className={cn("text-xs shrink-0", DUE_TONE_CLASS[due.tone])}>{due.label}</span>}
            </div>
          );
        })}
      </div>

      {completedTasks.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground pt-2">Done ({completedTasks.length})</p>
          {completedTasks.map((task) => (
            <div
              key={task.id}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/30 cursor-pointer"
              onClick={() => openEditDialog(task)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleComplete(task.id, task.isCompleted);
                }}
                className="shrink-0"
                aria-label={`Mark "${task.content}" as not done`}
              >
                <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                </div>
              </button>
              <span className="shrink-0 text-muted-foreground">
                <ActivityIcon type={task.type} className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm flex-1 truncate line-through text-muted-foreground">{task.content}</span>
            </div>
          ))}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        currentUserId={currentUserId}
        defaultRecordId={recordId}
        defaultRecordName={recordDisplayName ?? "This record"}
        defaultRecordSlug={objectSlug}
        initialData={
          editingTask
            ? {
                id: editingTask.id,
                content: editingTask.content,
                type: editingTask.type,
                hasDueTime: editingTask.hasDueTime,
                deadline: editingTask.deadline ? new Date(editingTask.deadline) : null,
                assigneeIds: editingTask.assignees.map((a) => a.id),
                recordIds: editingTask.linkedRecords.map((r) => r.id),
                linkedRecords: editingTask.linkedRecords,
                assignees: editingTask.assignees,
              }
            : undefined
        }
        onSave={handleSave}
        onDelete={dialogMode === "edit" ? handleDelete : undefined}
      />
    </div>
  );
}
