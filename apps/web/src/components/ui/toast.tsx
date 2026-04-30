"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertTriangle, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "warning";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 4500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback<ToastContextValue["show"]>(
    (message, variant = "success") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant }]);
      const timer = setTimeout(() => dismiss(id), DEFAULT_DURATION_MS);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const success = useCallback((m: string) => show(m, "success"), [show]);
  const error = useCallback((m: string) => show(m, "error"), [show]);
  const warning = useCallback((m: string) => show(m, "warning"), [show]);

  // Cleanup timers on unmount
  useEffect(() => {
    const refSnapshot = timers.current;
    return () => {
      refSnapshot.forEach((t) => clearTimeout(t));
      refSnapshot.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show, success, error, warning, dismiss }}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

const VARIANT_STYLES: Record<ToastVariant, { icon: React.ReactNode; ring: string }> = {
  success: {
    icon: <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />,
    ring: "ring-green-500/20",
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
    ring: "ring-amber-500/20",
  },
  error: {
    icon: <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />,
    ring: "ring-red-500/20",
  },
};

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      // Bottom-right on desktop, full-width across the bottom on mobile so
      // toasts never overlap the on-screen keyboard or hamburger menu.
      className="fixed inset-x-3 bottom-3 z-[100] flex flex-col items-stretch gap-2 sm:inset-auto sm:bottom-4 sm:right-4 sm:max-w-sm sm:items-end pointer-events-none"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const v = VARIANT_STYLES[toast.variant];
        return (
          <div
            key={toast.id}
            role={toast.variant === "error" ? "alert" : "status"}
            aria-live={toast.variant === "error" ? "assertive" : "polite"}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-popover px-3 py-2.5 text-sm shadow-lg ring-1",
              v.ring,
              "animate-in fade-in slide-in-from-bottom-2 duration-150"
            )}
          >
            <div className="mt-0.5 shrink-0">{v.icon}</div>
            <div className="flex-1 text-foreground">{toast.message}</div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss"
              className="-m-1 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
