import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, badRequest } from "@/lib/api-utils";
import {
  getAIConfig,
  buildSystemPrompt,
  buildConversationMessages,
  saveMessage,
  getConversation,
  generateTitle,
  toolHandlers,
  callAnthropic,
} from "@/services/ai-chat";
import type { AnthropicMessage, AnthropicContentBlock } from "@/services/ai-chat";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json();
  const { conversationId, message } = body as {
    conversationId: string;
    message: string;
  };

  if (!conversationId || !message?.trim()) {
    return badRequest("conversationId and message are required");
  }

  const conv = await getConversation(conversationId, ctx.userId);
  if (!conv) return badRequest("Conversation not found");

  const config = await getAIConfig(ctx.workspaceId);
  if (!config) {
    return badRequest("AI not configured. Set your Anthropic API key in Settings > AI Agent.");
  }

  // Save user message
  await saveMessage(conversationId, "user", { content: message });

  // Update conversation timestamp
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  // Build messages for Anthropic
  const systemPrompt = await buildSystemPrompt(ctx.workspaceId);
  const historyMessages = await buildConversationMessages(conversationId);

  // Fire-and-forget title generation on first user message
  const userMsgCount = historyMessages.filter((m) => m.role === "user").length;
  if (userMsgCount === 1) {
    generateTitle(config.apiKey, config.model, message).then((title) => {
      db.update(conversations)
        .set({ title })
        .where(eq(conversations.id, conversationId))
        .execute()
        .catch(() => {});
    });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const toolCtx = { workspaceId: ctx.workspaceId, userId: ctx.userId };

      try {
        await streamCompletion(config, systemPrompt, historyMessages, conversationId, toolCtx, controller, encoder);
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

async function streamCompletion(
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
    const errBody = await res.text();
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: `Anthropic error: ${res.status}` })}\n\n`));
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  // Track tool use blocks being built
  const toolUseBlocks: Array<{ id: string; name: string; inputJson: string }> = [];
  let currentBlockIndex = -1;
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
            currentBlockIndex = parsed.index ?? 0;
            const block = parsed.content_block;
            if (block?.type === "text") {
              currentBlockType = "text";
            } else if (block?.type === "tool_use") {
              currentBlockType = "tool_use";
              toolUseBlocks.push({
                id: block.id,
                name: block.name,
                inputJson: "",
              });
            }
            break;
          }

          case "content_block_delta": {
            const delta = parsed.delta;
            if (delta?.type === "text_delta" && delta.text) {
              fullContent += delta.text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "token", content: delta.text })}\n\n`)
              );
            } else if (delta?.type === "input_json_delta" && delta.partial_json) {
              const current = toolUseBlocks[toolUseBlocks.length - 1];
              if (current) {
                current.inputJson += delta.partial_json;
              }
            }
            break;
          }

          case "content_block_stop":
            currentBlockType = "";
            break;

          case "message_stop":
            // End of message
            break;
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  // Convert tool_use blocks to the internal ToolCall format for storage
  const toolCalls = toolUseBlocks.map((tb) => ({
    id: tb.id,
    type: "function" as const,
    function: {
      name: tb.name,
      arguments: tb.inputJson,
    },
  }));

  // If we got tool calls, process them
  if (toolCalls.length > 0) {
    // Save assistant message with tool calls
    const assistantMsg = await saveMessage(conversationId, "assistant", {
      content: fullContent || null,
      toolCalls: toolCalls,
    });

    // Build the assistant content blocks for the next Anthropic request
    const assistantContent: AnthropicContentBlock[] = [];
    if (fullContent) {
      assistantContent.push({ type: "text", text: fullContent });
    }
    for (const tb of toolUseBlocks) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tb.inputJson); } catch {}
      assistantContent.push({ type: "tool_use", id: tb.id, name: tb.name, input });
    }
    anthropicMessages.push({ role: "assistant", content: assistantContent });

    // Check if any require confirmation
    for (const tc of toolCalls) {
      const handler = toolHandlers[tc.function.name];
      if (!handler) {
        // Unknown tool
        const errContent = JSON.stringify({ error: `Unknown tool: ${tc.function.name}` });
        await saveMessage(conversationId, "tool", {
          content: errContent,
          toolCallId: tc.id,
          toolName: tc.function.name,
        });
        // Add tool_result to messages for next round
        const lastMsg = anthropicMessages[anthropicMessages.length - 1];
        if (lastMsg?.role === "user" && Array.isArray(lastMsg.content)) {
          (lastMsg.content as AnthropicContentBlock[]).push({
            type: "tool_result",
            tool_use_id: tc.id,
            content: errContent,
            is_error: true,
          });
        } else {
          anthropicMessages.push({
            role: "user",
            content: [{
              type: "tool_result",
              tool_use_id: tc.id,
              content: errContent,
              is_error: true,
            }],
          });
        }
        continue;
      }

      if (handler.requiresConfirmation) {
        let parsedArgs: Record<string, unknown> = {};
        try { parsedArgs = JSON.parse(tc.function.arguments); } catch {}

        // Save metadata marking it as pending
        await db
          .update(messages)
          .set({
            metadata: {
              pendingToolCalls: toolCalls.map((t) => ({
                id: t.id,
                name: t.function.name,
                arguments: t.function.arguments,
                status: "pending",
              })),
            },
          })
          .where(eq(messages.id, assistantMsg.id));

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "tool_call_pending",
              messageId: assistantMsg.id,
              toolCallId: tc.id,
              name: tc.function.name,
              arguments: parsedArgs,
            })}\n\n`
          )
        );
        return; // Stop streaming - wait for confirmation
      }

      // Auto-execute read tools
      let parsedArgs: Record<string, unknown> = {};
      try { parsedArgs = JSON.parse(tc.function.arguments); } catch {}

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "tool_executing", name: tc.function.name, arguments: parsedArgs })}\n\n`
        )
      );

      try {
        const result = await handler.execute(parsedArgs, toolCtx);
        const resultStr = JSON.stringify(result);

        await saveMessage(conversationId, "tool", {
          content: resultStr,
          toolCallId: tc.id,
          toolName: tc.function.name,
        });

        // Add tool_result to messages
        const toolResult: AnthropicContentBlock = {
          type: "tool_result",
          tool_use_id: tc.id,
          content: resultStr,
        };
        const lastMsg = anthropicMessages[anthropicMessages.length - 1];
        if (lastMsg?.role === "user" && Array.isArray(lastMsg.content)) {
          (lastMsg.content as AnthropicContentBlock[]).push(toolResult);
        } else {
          anthropicMessages.push({ role: "user", content: [toolResult] });
        }
      } catch (e) {
        const errStr = JSON.stringify({ error: e instanceof Error ? e.message : "Tool execution failed" });
        await saveMessage(conversationId, "tool", {
          content: errStr,
          toolCallId: tc.id,
          toolName: tc.function.name,
        });

        const toolResult: AnthropicContentBlock = {
          type: "tool_result",
          tool_use_id: tc.id,
          content: errStr,
          is_error: true,
        };
        const lastMsg = anthropicMessages[anthropicMessages.length - 1];
        if (lastMsg?.role === "user" && Array.isArray(lastMsg.content)) {
          (lastMsg.content as AnthropicContentBlock[]).push(toolResult);
        } else {
          anthropicMessages.push({ role: "user", content: [toolResult] });
        }
      }
    }

    // If no pending tool calls, continue the conversation
    const hasPending = toolCalls.some((tc) => toolHandlers[tc.function.name]?.requiresConfirmation);
    if (!hasPending) {
      await streamCompletion(config, systemPrompt, anthropicMessages, conversationId, toolCtx, controller, encoder, depth + 1);
    }
  } else {
    // No tool calls - save the final assistant message
    if (fullContent) {
      const msg = await saveMessage(conversationId, "assistant", { content: fullContent });
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "done", messageId: msg.id })}\n\n`)
      );
    } else {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "done", messageId: null })}\n\n`)
      );
    }
  }
}
