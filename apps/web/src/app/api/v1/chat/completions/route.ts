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
  const systemPrompt = await buildSystemPrompt(ctx.workspaceId, ctx.userId);
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
  // After MAX_TOOL_ROUNDS of tool calls, force the model to produce a text
  // answer (tool_choice: "none") instead of spiraling deeper.
  const MAX_TOOL_ROUNDS = 6;
  const forceTextOnly = depth >= MAX_TOOL_ROUNDS;
  if (depth > 12) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: "Too many tool call rounds" })}\n\n`));
    return;
  }

  const res = await callAnthropic(config, systemPrompt, anthropicMessages, true, forceTextOnly ? "none" : "auto");
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
  let streamError: string | null = null;
  let stopReason: string | null = null;

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
            } else if (block?.type === "web_search_tool_use") {
              // Native web search — Anthropic resolves it server-side; we only
              // forward a status event so the frontend can show an indicator.
              currentBlockType = "web_search_tool_use";
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "web_search_start" })}\n\n`)
              );
            } else if (block?.type === "web_search_tool_result") {
              currentBlockType = "web_search_tool_result";
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
            if (currentBlockType === "web_search_tool_result") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "web_search_done" })}\n\n`)
              );
            }
            currentBlockType = "";
            break;

          case "message_delta":
            // Contains usage + stop_reason at end of message.
            if (parsed.delta?.stop_reason) stopReason = parsed.delta.stop_reason;
            break;

          case "message_stop":
            // End of message
            break;

          case "error": {
            // Anthropic streaming error — surface it instead of silently dropping.
            const msg = parsed.error?.message || parsed.message || "Unknown streaming error";
            streamError = msg;
            console.error("[chat] Anthropic stream error:", msg, parsed);
            break;
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  if (streamError) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: streamError })}\n\n`));
    // Save a visible assistant message so the user isn't left with a dead conversation
    const errMsg = await saveMessage(conversationId, "assistant", {
      content: `⚠️ The model returned an error: ${streamError}. Please try again or rephrase your question.`,
    });
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", messageId: errMsg.id })}\n\n`));
    return;
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
      // Empty response with no error — model produced nothing. Log and surface a visible message
      // so the UI doesn't just hang on tool bubbles forever.
      console.error("[chat] Empty assistant response", { depth, stopReason, historyLen: anthropicMessages.length });
      const fallback = stopReason === "max_tokens"
        ? "⚠️ Response was cut off (token limit reached). Try asking a more focused question."
        : "⚠️ The model returned an empty response. This sometimes happens after many tool calls — try rephrasing or starting a fresh conversation.";
      const msg = await saveMessage(conversationId, "assistant", { content: fallback });
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "token", content: fallback })}\n\n`)
      );
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "done", messageId: msg.id })}\n\n`)
      );
    }
  }
}
