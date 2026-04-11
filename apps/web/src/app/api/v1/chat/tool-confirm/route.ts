import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, badRequest } from "@/lib/api-utils";
import {
  getAIConfig,
  buildSystemPrompt,
  buildConversationMessages,
  saveMessage,
  getConversation,
  toolHandlers,
  callAnthropic,
} from "@/services/ai-chat";
import type { AnthropicMessage, AnthropicContentBlock } from "@/services/ai-chat";
import { db } from "@/db";
import { messages, conversations } from "@/db/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 60;

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
  status: string;
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json();
  const { conversationId, messageId, toolCallId, approved } = body as {
    conversationId: string;
    messageId: string;
    toolCallId: string;
    approved: boolean;
  };

  if (!conversationId || !messageId || !toolCallId || approved === undefined) {
    return badRequest("conversationId, messageId, toolCallId, and approved are required");
  }

  const conv = await getConversation(conversationId, ctx.userId);
  if (!conv) return badRequest("Conversation not found");

  const config = await getAIConfig(ctx.workspaceId);
  if (!config) return badRequest("AI not configured");

  // Get the assistant message with pending tool calls
  const [assistantMsg] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!assistantMsg) return badRequest("Message not found");

  const metadata = assistantMsg.metadata as { pendingToolCalls?: PendingToolCall[] } | null;
  const pending = metadata?.pendingToolCalls?.find((tc) => tc.id === toolCallId);
  if (!pending) return badRequest("Tool call not found");

  const toolCtx = { workspaceId: ctx.workspaceId, userId: ctx.userId };
  const handler = toolHandlers[pending.name];
  if (!handler) return badRequest("Unknown tool");

  let resultStr: string;

  if (approved) {
    let parsedArgs: Record<string, unknown> = {};
    try { parsedArgs = JSON.parse(pending.arguments); } catch {}

    try {
      const result = await handler.execute(parsedArgs, toolCtx);
      resultStr = JSON.stringify(result);
    } catch (e) {
      resultStr = JSON.stringify({ error: e instanceof Error ? e.message : "Execution failed" });
    }
  } else {
    resultStr = JSON.stringify({ rejected: true, message: "User rejected this action." });
  }

  // Update pending status
  const updatedPending = metadata?.pendingToolCalls?.map((tc) =>
    tc.id === toolCallId ? { ...tc, status: approved ? "approved" : "rejected" } : tc
  );
  await db
    .update(messages)
    .set({ metadata: { ...metadata, pendingToolCalls: updatedPending } })
    .where(eq(messages.id, messageId));

  // Save tool result message
  await saveMessage(conversationId, "tool", {
    content: resultStr,
    toolCallId: pending.id,
    toolName: pending.name,
  });

  // Update conversation timestamp
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  // Continue streaming with Anthropic
  const systemPrompt = await buildSystemPrompt(ctx.workspaceId);
  const anthropicMessages = await buildConversationMessages(conversationId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await streamContinuation(config, systemPrompt, anthropicMessages, conversationId, toolCtx, controller, encoder);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Stream error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`));
      } finally {
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function streamContinuation(
  config: { apiKey: string; model: string },
  systemPrompt: string,
  anthropicMessages: AnthropicMessage[],
  conversationId: string,
  toolCtx: { workspaceId: string; userId: string },
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  depth = 0
) {
  if (depth > 10) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: "Too many tool call rounds" })}\n\n`));
    return;
  }

  const res = await callAnthropic(config, systemPrompt, anthropicMessages, true);
  if (!res.ok) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: `Anthropic error: ${res.status}` })}\n\n`));
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  const toolUseBlocks: Array<{ id: string; name: string; inputJson: string }> = [];
  let currentBlockType = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let eventType = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);

        switch (eventType) {
          case "content_block_start": {
            const block = parsed.content_block;
            if (block?.type === "text") {
              currentBlockType = "text";
            } else if (block?.type === "tool_use") {
              currentBlockType = "tool_use";
              toolUseBlocks.push({ id: block.id, name: block.name, inputJson: "" });
            }
            break;
          }
          case "content_block_delta": {
            const delta = parsed.delta;
            if (delta?.type === "text_delta" && delta.text) {
              fullContent += delta.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", content: delta.text })}\n\n`));
            } else if (delta?.type === "input_json_delta" && delta.partial_json) {
              const current = toolUseBlocks[toolUseBlocks.length - 1];
              if (current) current.inputJson += delta.partial_json;
            }
            break;
          }
          case "content_block_stop":
            currentBlockType = "";
            break;
        }
      } catch {}
    }
  }

  const toolCalls = toolUseBlocks.map((tb) => ({
    id: tb.id,
    type: "function" as const,
    function: { name: tb.name, arguments: tb.inputJson },
  }));

  if (toolCalls.length > 0) {
    const assistantMsg = await saveMessage(conversationId, "assistant", {
      content: fullContent || null,
      toolCalls: toolCalls,
    });

    // Build assistant content for next request
    const assistantContent: AnthropicContentBlock[] = [];
    if (fullContent) assistantContent.push({ type: "text", text: fullContent });
    for (const tb of toolUseBlocks) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tb.inputJson); } catch {}
      assistantContent.push({ type: "tool_use", id: tb.id, name: tb.name, input });
    }
    anthropicMessages.push({ role: "assistant", content: assistantContent });

    for (const tc of toolCalls) {
      const handler = toolHandlers[tc.function.name];
      if (!handler) continue;

      if (handler.requiresConfirmation) {
        let parsedArgs: Record<string, unknown> = {};
        try { parsedArgs = JSON.parse(tc.function.arguments); } catch {}

        await db.update(messages).set({
          metadata: {
            pendingToolCalls: toolCalls.map((t) => ({
              id: t.id, name: t.function.name, arguments: t.function.arguments, status: "pending",
            })),
          },
        }).where(eq(messages.id, assistantMsg.id));

        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            type: "tool_call_pending", messageId: assistantMsg.id, toolCallId: tc.id,
            name: tc.function.name, arguments: parsedArgs,
          })}\n\n`
        ));
        return;
      }

      let parsedArgs: Record<string, unknown> = {};
      try { parsedArgs = JSON.parse(tc.function.arguments); } catch {}

      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: "tool_executing", name: tc.function.name, arguments: parsedArgs })}\n\n`
      ));

      try {
        const result = await handler.execute(parsedArgs, toolCtx);
        const resultStr = JSON.stringify(result);
        await saveMessage(conversationId, "tool", { content: resultStr, toolCallId: tc.id, toolName: tc.function.name });

        const toolResult: AnthropicContentBlock = { type: "tool_result", tool_use_id: tc.id, content: resultStr };
        const lastMsg = anthropicMessages[anthropicMessages.length - 1];
        if (lastMsg?.role === "user" && Array.isArray(lastMsg.content)) {
          (lastMsg.content as AnthropicContentBlock[]).push(toolResult);
        } else {
          anthropicMessages.push({ role: "user", content: [toolResult] });
        }
      } catch (e) {
        const errStr = JSON.stringify({ error: e instanceof Error ? e.message : "Failed" });
        await saveMessage(conversationId, "tool", { content: errStr, toolCallId: tc.id, toolName: tc.function.name });

        const toolResult: AnthropicContentBlock = { type: "tool_result", tool_use_id: tc.id, content: errStr, is_error: true };
        const lastMsg = anthropicMessages[anthropicMessages.length - 1];
        if (lastMsg?.role === "user" && Array.isArray(lastMsg.content)) {
          (lastMsg.content as AnthropicContentBlock[]).push(toolResult);
        } else {
          anthropicMessages.push({ role: "user", content: [toolResult] });
        }
      }
    }

    const hasPending = toolCalls.some((tc) => toolHandlers[tc.function.name]?.requiresConfirmation);
    if (!hasPending) {
      await streamContinuation(config, systemPrompt, anthropicMessages, conversationId, toolCtx, controller, encoder, depth + 1);
    }
  } else if (fullContent) {
    const msg = await saveMessage(conversationId, "assistant", { content: fullContent });
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", messageId: msg.id })}\n\n`));
  }
}
