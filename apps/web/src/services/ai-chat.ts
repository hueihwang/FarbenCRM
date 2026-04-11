import { db } from "@/db";
import {
  conversations,
  messages,
  workspaces,
  objects,
} from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { globalSearch } from "./search";
import { listObjects, getObjectBySlug, getObjectWithAttributes } from "./objects";
import { listRecords, getRecord, createRecord, updateRecord, deleteRecord } from "./records";
import { listTasks, createTask } from "./tasks";
import { getNotesForRecord, createNote } from "./notes";
import { listLists, listListEntries } from "./lists";

// ─── Types ───────────────────────────────────────────────────────────

interface AIConfig {
  apiKey: string;
  model: string;
}

interface WorkspaceSettings {
  anthropicApiKey?: string;
  anthropicModel?: string;
  tavilyApiKey?: string;
}

export interface ToolHandler {
  requiresConfirmation: boolean;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

interface ToolContext {
  workspaceId: string;
  userId: string;
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// ─── Config ──────────────────────────────────────────────────────────

export async function getAIConfig(workspaceId: string): Promise<AIConfig | null> {
  const [workspace] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const settings = (workspace?.settings ?? {}) as WorkspaceSettings;

  // Workspace setting > env var
  const apiKey = settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    model: settings.anthropicModel || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
  };
}

// ─── System Prompt ───────────────────────────────────────────────────

export async function buildSystemPrompt(workspaceId: string): Promise<string> {
  const objs = await listObjects(workspaceId);

  // Build detailed object schema with attributes and status values
  const objectDetails = await Promise.all(
    objs.map(async (o) => {
      const full = await getObjectWithAttributes(workspaceId, o.slug);
      if (!full) return `- ${o.pluralName} (slug: "${o.slug}")`;

      const attrLines = (full.attributes as any[]).map((a) => {
        let desc = `    - "${a.slug}" (${a.type}${a.isMultiselect ? ", array" : ""})`;
        if (a.statuses?.length) {
          desc += ` — values: ${a.statuses.map((s: any) => `"${s.title}"`).join(", ")}`;
        }
        return desc;
      });
      return `- ${o.pluralName} (slug: "${o.slug}")\n${attrLines.join("\n")}`;
    })
  );

  return `You are an AI assistant for FarbenCRM. You help users manage their CRM data — searching records, creating and updating contacts, companies, deals, tasks, and notes.

Available object types and their attributes:
${objectDetails.join("\n")}

Guidelines:
- When the user refers to "people", "contacts", "companies", "deals" etc., map to the correct object slug.
- Use search_records to find records by name, email, domain, etc.
- Use list_records to browse records of a specific type.
- Use get_record to get full details of a specific record.
- When creating or updating records, use the exact attribute slugs listed above.
- For People: "name" is type personal_name (value: { fullName, firstName, lastName }), "email_addresses" and "phone_numbers" are multiselect arrays.
- For status attributes (like deal stage), use the exact status title values listed above.
- When creating tasks, always provide a clear content description.
- When creating notes, you need a recordId — search for the record first if needed.
- Use web_search to look up company info, industry news, prospect research, or any external information.
- Be concise and helpful. Confirm actions before executing writes.
- If a tool call fails, explain the error to the user and suggest alternatives.`;
}

// ─── Tool Definitions ────────────────────────────────────────────────

export const toolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "search_records",
      description: "Search across all records and lists by name, email, domain, or any text. Returns matching records with their type and display name.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (name, email, domain, etc.)" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_objects",
      description: "List all object types in the workspace (e.g., People, Companies, Deals, custom objects).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_records",
      description: "List records of a specific object type. Use object_slug like 'people', 'companies', or 'deals'.",
      parameters: {
        type: "object",
        properties: {
          object_slug: { type: "string", description: "Object slug, e.g. 'people', 'companies', 'deals'" },
          limit: { type: "number", description: "Max records to return (default 20)" },
          offset: { type: "number", description: "Pagination offset" },
        },
        required: ["object_slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_record",
      description: "Get full details of a specific record by its ID and object slug.",
      parameters: {
        type: "object",
        properties: {
          object_slug: { type: "string", description: "Object slug" },
          record_id: { type: "string", description: "Record UUID" },
        },
        required: ["object_slug", "record_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_tasks",
      description: "List tasks for the current user. Can include completed tasks.",
      parameters: {
        type: "object",
        properties: {
          show_completed: { type: "boolean", description: "Include completed tasks (default false)" },
          limit: { type: "number", description: "Max tasks to return" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_notes_for_record",
      description: "Get all notes attached to a specific record.",
      parameters: {
        type: "object",
        properties: {
          record_id: { type: "string", description: "Record UUID" },
        },
        required: ["record_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_lists",
      description: "List all lists in the workspace.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_list_entries",
      description: "Get entries of a specific list.",
      parameters: {
        type: "object",
        properties: {
          list_id: { type: "string", description: "List UUID" },
          limit: { type: "number", description: "Max entries" },
          offset: { type: "number", description: "Pagination offset" },
        },
        required: ["list_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_record",
      description: "Create a new record. For People use name: { fullName, firstName, lastName }, email_addresses (array), phone_numbers (array). For Companies use name, domain. For Deals use name.",
      parameters: {
        type: "object",
        properties: {
          object_slug: { type: "string", description: "Object slug, e.g. 'people', 'companies', 'deals'" },
          values: {
            type: "object",
            description: "Attribute values keyed by attribute slug",
          },
        },
        required: ["object_slug", "values"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_record",
      description: "Update an existing record's attribute values.",
      parameters: {
        type: "object",
        properties: {
          object_slug: { type: "string", description: "Object slug" },
          record_id: { type: "string", description: "Record UUID" },
          values: {
            type: "object",
            description: "Attribute values to update, keyed by attribute slug",
          },
        },
        required: ["object_slug", "record_id", "values"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_record",
      description: "Delete a record permanently.",
      parameters: {
        type: "object",
        properties: {
          object_slug: { type: "string", description: "Object slug" },
          record_id: { type: "string", description: "Record UUID" },
        },
        required: ["object_slug", "record_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Create a new task. Can optionally link to records and assign to users.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Task description" },
          deadline: { type: "string", description: "ISO date string for the deadline" },
          record_ids: {
            type: "array",
            items: { type: "string" },
            description: "Record UUIDs to link to this task",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_note",
      description: "Create a new note attached to a record.",
      parameters: {
        type: "object",
        properties: {
          record_id: { type: "string", description: "Record UUID to attach the note to" },
          title: { type: "string", description: "Note title" },
          content: { type: "string", description: "Note content as plain text" },
        },
        required: ["record_id", "title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web for information about companies, people, industries, news, or any external topic. Useful for researching prospects, verifying company details, finding contact info, or getting market insights.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          max_results: { type: "number", description: "Max results to return (default 5, max 10)" },
        },
        required: ["query"],
      },
    },
  },
];

// ─── Tool Handlers ───────────────────────────────────────────────────

async function resolveObjectId(slug: string, workspaceId: string): Promise<string | null> {
  const obj = await getObjectBySlug(workspaceId, slug);
  return obj?.id ?? null;
}

async function getTavilyApiKey(workspaceId: string): Promise<string | null> {
  const [workspace] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const settings = (workspace?.settings ?? {}) as WorkspaceSettings;
  return settings.tavilyApiKey || process.env.TAVILY_API_KEY || null;
}

export const toolHandlers: Record<string, ToolHandler> = {
  search_records: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const results = await globalSearch(ctx.workspaceId, args.query as string, {
        limit: (args.limit as number) || 20,
      });
      return { results, count: results.length };
    },
  },

  list_objects: {
    requiresConfirmation: false,
    async execute(_args, ctx) {
      const objs = await listObjects(ctx.workspaceId);
      return objs.map((o) => ({
        slug: o.slug,
        singularName: o.singularName,
        pluralName: o.pluralName,
        icon: o.icon,
        isSystem: o.isSystem,
      }));
    },
  },

  list_records: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const objectId = await resolveObjectId(args.object_slug as string, ctx.workspaceId);
      if (!objectId) return { error: `Object "${args.object_slug}" not found` };
      const result = await listRecords(objectId, {
        limit: (args.limit as number) || 20,
        offset: (args.offset as number) || 0,
      });
      return { records: result.records, total: result.total };
    },
  },

  get_record: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const objectId = await resolveObjectId(args.object_slug as string, ctx.workspaceId);
      if (!objectId) return { error: `Object "${args.object_slug}" not found` };
      const record = await getRecord(objectId, args.record_id as string);
      if (!record) return { error: "Record not found" };
      return record;
    },
  },

  list_tasks: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const result = await listTasks(ctx.workspaceId, ctx.userId, {
        showCompleted: (args.show_completed as boolean) || false,
        limit: (args.limit as number) || 20,
      });
      return { tasks: result.tasks, total: result.total };
    },
  },

  get_notes_for_record: {
    requiresConfirmation: false,
    async execute(args) {
      const notes = await getNotesForRecord(args.record_id as string);
      return { notes, count: notes.length };
    },
  },

  list_lists: {
    requiresConfirmation: false,
    async execute(_args, ctx) {
      const result = await listLists(ctx.workspaceId);
      return result;
    },
  },

  list_list_entries: {
    requiresConfirmation: false,
    async execute(args) {
      const result = await listListEntries(args.list_id as string, {
        limit: (args.limit as number) || 20,
        offset: (args.offset as number) || 0,
      });
      return { entries: result.entries, total: result.total };
    },
  },

  create_record: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const objectId = await resolveObjectId(args.object_slug as string, ctx.workspaceId);
      if (!objectId) return { error: `Object "${args.object_slug}" not found` };
      const record = await createRecord(objectId, args.values as Record<string, unknown>, ctx.userId);
      return record;
    },
  },

  update_record: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const objectId = await resolveObjectId(args.object_slug as string, ctx.workspaceId);
      if (!objectId) return { error: `Object "${args.object_slug}" not found` };
      const record = await updateRecord(
        objectId,
        args.record_id as string,
        args.values as Record<string, unknown>,
        ctx.userId
      );
      if (!record) return { error: "Record not found" };
      return record;
    },
  },

  delete_record: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const objectId = await resolveObjectId(args.object_slug as string, ctx.workspaceId);
      if (!objectId) return { error: `Object "${args.object_slug}" not found` };
      const result = await deleteRecord(objectId, args.record_id as string);
      if (!result) return { error: "Record not found" };
      return { deleted: true, id: args.record_id };
    },
  },

  create_task: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const task = await createTask(args.content as string, ctx.userId, ctx.workspaceId, {
        deadline: args.deadline as string | undefined,
        recordIds: args.record_ids as string[] | undefined,
        assigneeIds: [ctx.userId],
      });
      return task;
    },
  },

  create_note: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const content = args.content
        ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: args.content as string }] }] }
        : undefined;
      const note = await createNote(args.record_id as string, args.title as string, content, ctx.userId);
      return note;
    },
  },

  web_search: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const tavilyKey = await getTavilyApiKey(ctx.workspaceId);
      if (!tavilyKey) {
        return { error: "Web search not configured. Set your Tavily API key in Settings > AI Agent." };
      }

      const maxResults = Math.min((args.max_results as number) || 5, 10);

      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: args.query as string,
          max_results: maxResults,
          include_answer: true,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return { error: `Search failed: ${res.status}` };
      }

      const data = await res.json();
      return {
        answer: data.answer || null,
        results: (data.results || []).map((r: any) => ({
          title: r.title,
          url: r.url,
          content: r.content,
        })),
      };
    },
  },
};

// ─── Message Helpers ─────────────────────────────────────────────────

export async function buildConversationMessages(conversationId: string): Promise<AnthropicMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  // Convert DB messages to Anthropic format
  // Anthropic has only "user" and "assistant" roles.
  // Tool results are sent as user messages with tool_result content blocks.
  // Tool calls are part of assistant messages as tool_use content blocks.
  const result: AnthropicMessage[] = [];

  for (const msg of rows) {
    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content || "" });
    } else if (msg.role === "assistant") {
      const content: AnthropicContentBlock[] = [];
      if (msg.content) {
        content.push({ type: "text", text: msg.content });
      }
      // Convert stored tool_calls (OpenAI format) to Anthropic tool_use blocks
      if (msg.toolCalls) {
        const calls = msg.toolCalls as ToolCall[];
        for (const tc of calls) {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(tc.function.arguments); } catch {}
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input,
          });
        }
      }
      if (content.length > 0) {
        result.push({ role: "assistant", content });
      }
    } else if (msg.role === "tool") {
      // Tool results become user messages with tool_result content blocks
      // Merge consecutive tool results into a single user message
      const toolResult: AnthropicContentBlock = {
        type: "tool_result",
        tool_use_id: msg.toolCallId || "",
        content: msg.content || "",
      };
      const last = result[result.length - 1];
      if (last?.role === "user" && Array.isArray(last.content)) {
        (last.content as AnthropicContentBlock[]).push(toolResult);
      } else {
        result.push({ role: "user", content: [toolResult] });
      }
    }
  }

  return result;
}

export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant" | "system" | "tool",
  opts: {
    content?: string | null;
    toolCalls?: unknown;
    toolCallId?: string;
    toolName?: string;
    metadata?: unknown;
  } = {}
) {
  const [msg] = await db
    .insert(messages)
    .values({
      conversationId,
      role,
      content: opts.content ?? null,
      toolCalls: opts.toolCalls ?? null,
      toolCallId: opts.toolCallId ?? null,
      toolName: opts.toolName ?? null,
      metadata: opts.metadata ?? null,
    })
    .returning();

  return msg;
}

export async function generateTitle(apiKey: string, model: string, userMessage: string): Promise<string> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 30,
        messages: [
          {
            role: "user",
            content: `Generate a very short title (max 6 words) for a CRM conversation that starts with this message. Return only the title, no quotes or punctuation:\n\n${userMessage}`,
          },
        ],
      }),
    });

    if (!res.ok) return "New conversation";

    const data = await res.json();
    const title = data.content?.[0]?.text?.trim();
    return title || "New conversation";
  } catch {
    return "New conversation";
  }
}

// ─── Conversation CRUD ───────────────────────────────────────────────

export async function listConversations(userId: string, workspaceId: string) {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));
}

export async function createConversation(
  userId: string,
  workspaceId: string,
  opts: { title?: string; model?: string } = {}
) {
  const [conv] = await db
    .insert(conversations)
    .values({
      userId,
      workspaceId,
      title: opts.title || "New conversation",
      model: opts.model || "anthropic/claude-sonnet-4",
    })
    .returning();

  return conv;
}

export async function getConversation(conversationId: string, userId: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv || conv.userId !== userId) return null;
  return conv;
}

export async function updateConversation(
  conversationId: string,
  userId: string,
  updates: { title?: string; model?: string }
) {
  const conv = await getConversation(conversationId, userId);
  if (!conv) return null;

  const [updated] = await db
    .update(conversations)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))
    .returning();

  return updated;
}

export async function deleteConversation(conversationId: string, userId: string) {
  const conv = await getConversation(conversationId, userId);
  if (!conv) return null;

  const [deleted] = await db
    .delete(conversations)
    .where(eq(conversations.id, conversationId))
    .returning();

  return deleted;
}

export async function getConversationMessages(conversationId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}

// ─── Anthropic Streaming ─────────────────────────────────────────────

/** Convert tool definitions from OpenAI format to Anthropic format */
function toAnthropicTools() {
  return toolDefinitions.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

export async function callAnthropic(
  config: AIConfig,
  systemPrompt: string,
  messages: AnthropicMessage[],
  stream = true
) {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools: toAnthropicTools(),
      stream,
    }),
  });
}
