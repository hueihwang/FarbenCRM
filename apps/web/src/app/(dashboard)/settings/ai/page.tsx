"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

export default function AISettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [workspaceKnowledge, setWorkspaceKnowledge] = useState("");
  const [knowledgeSaved, setKnowledgeSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    fetch("/api/v1/ai-settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) {
          setModel(data.data.model);
          setHasApiKey(data.data.hasApiKey);
          setWorkspaceKnowledge(data.data.workspaceKnowledge || "");
        }
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, string> = { model };
      if (apiKey) body.apiKey = apiKey;

      const res = await fetch("/api/v1/ai-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setHasApiKey(data.data.hasApiKey);
        setApiKey("");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveKnowledge() {
    setSaving(true);
    setKnowledgeSaved(false);
    try {
      const res = await fetch("/api/v1/ai-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceKnowledge }),
      });
      if (res.ok) {
        setKnowledgeSaved(true);
        setTimeout(() => setKnowledgeSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setTestMessage("");
    try {
      const keyToTest = apiKey || undefined;
      const res = await fetch("/api/v1/ai-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: keyToTest, model }),
      });
      const data = await res.json();
      if (res.ok && data.data?.success) {
        setTestResult("success");
        setTestMessage("Connection successful");
      } else {
        setTestResult("error");
        setTestMessage(data.error?.message || data.data?.error || "Connection failed");
      }
    } catch {
      setTestResult("error");
      setTestMessage("Network error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">AI Agent</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure the AI assistant that can answer questions about your CRM data, search the web, and take actions on your behalf.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="apiKey">Anthropic API Key</Label>
          <div className="relative">
            <Input
              id="apiKey"
              type={showKey ? "text" : "password"}
              placeholder={hasApiKey ? "••••••••••••••••" : "sk-ant-api03-..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {hasApiKey && !apiKey && (
            <p className="text-xs text-muted-foreground">API key is set. Enter a new key to replace it.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Get your API key from{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              console.anthropic.com
            </a>
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <select
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing || (!hasApiKey && !apiKey)}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Test Connection
          </Button>
          {testResult && (
            <span className={`flex items-center gap-1 text-sm ${testResult === "success" ? "text-green-600" : "text-red-600"}`}>
              {testResult === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {testMessage}
            </span>
          )}
        </div>
      </div>

      <div className="border-t pt-8 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Company knowledge</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Shared context about your organization — products, customers, internal jargon, policies, tone. The AI reads this on every conversation for every user, so it answers like someone who already knows the business. Keep it tight (a few thousand words max).
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="workspaceKnowledge">Knowledge base</Label>
          <textarea
            id="workspaceKnowledge"
            value={workspaceKnowledge}
            onChange={(e) => setWorkspaceKnowledge(e.target.value)}
            rows={14}
            placeholder={`About Farben:
- What the company does, who the customers are
- Key products, services, or brands
- Internal terminology and abbreviations
- Tone and voice conventions
- Anything else the AI should treat as background knowledge`}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
          />
          <p className="text-xs text-muted-foreground">
            {workspaceKnowledge.length.toLocaleString()} characters · ~{Math.ceil(workspaceKnowledge.length / 4).toLocaleString()} tokens per message
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSaveKnowledge} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save knowledge
          </Button>
          {knowledgeSaved && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
