import {
  DEFAULT_GROQ_MODEL,
  DEFAULT_GROQ_VISION_MODEL,
  DEFAULT_GROQ_WHISPER_MODEL,
} from "@/app/crm/_lib/ai-models";
import { AI_TOOL_DECLARATIONS } from "./ai-tools";

export class AiApiError extends Error {
  status: number | null;
  statusText: string | null;

  constructor(
    message: string,
    status?: number | null,
    statusText?: string | null,
  ) {
    const statusPrefix =
      status != null
        ? `AI ${status}${statusText ? ` ${statusText}` : ""}: `
        : "AI: ";
    super(`${statusPrefix}${message}`);
    this.name = "AiApiError";
    this.status = status ?? null;
    this.statusText = statusText ?? null;
  }
}

export type AiContentPart =
  | { text: string }
  | {
      inlineData: {
        mimeType: string;
        data: string;
      };
    }
  | {
      functionCall: {
        name: string;
        args?: Record<string, unknown>;
        id?: string;
      };
    }
  | {
      functionResponse: {
        name: string;
        response: Record<string, unknown>;
        id?: string;
      };
    };

export type AiContent = {
  role: "user" | "model";
  parts: AiContentPart[];
};

export type AiFunctionCall = {
  name: string;
  args: Record<string, unknown>;
  id: string;
};

export type AiGenerateResult = {
  text: string;
  raw: unknown;
  functionCalls: AiFunctionCall[];
  modelContent: AiContent | null;
};

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null | Array<Record<string, unknown>>;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  name?: string;
};

const LOG_PREFIX = "[AI_AGENT]";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TRANSCRIBE_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions";
const DEFAULT_MODEL = DEFAULT_GROQ_MODEL;

export const getAiApiKey = () => {
  const key = process.env.GROQ_API_KEY?.trim() || "";
  return key || null;
};

export const getGroqApiKey = getAiApiKey;

const toOpenAiTools = (allowedToolNames?: string[] | null) => {
  const declarations =
    allowedToolNames && allowedToolNames.length
      ? AI_TOOL_DECLARATIONS.filter((tool) =>
          allowedToolNames.includes(tool.name),
        )
      : AI_TOOL_DECLARATIONS;

  return declarations.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
};

const parseToolArgs = (raw: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return {};
};

const contentsToOpenAiMessages = (
  systemPrompt: string,
  contents: AiContent[],
): OpenAiMessage[] => {
  const messages: OpenAiMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  let pendingToolCallIds: string[] = [];

  for (const content of contents) {
    const functionCalls = content.parts.filter(
      (part): part is Extract<AiContentPart, { functionCall: unknown }> =>
        "functionCall" in part && Boolean(part.functionCall),
    );
    const functionResponses = content.parts.filter(
      (
        part,
      ): part is Extract<AiContentPart, { functionResponse: unknown }> =>
        "functionResponse" in part && Boolean(part.functionResponse),
    );
    const textParts = content.parts
      .filter(
        (part): part is Extract<AiContentPart, { text: string }> =>
          "text" in part && typeof part.text === "string",
      )
      .map((part) => part.text.trim())
      .filter(Boolean);

    if (functionCalls.length) {
      const toolCalls: OpenAiToolCall[] = functionCalls.map((part, index) => {
        const id =
          part.functionCall.id ||
          pendingToolCallIds[index] ||
          `call_${content.role}_${index}_${part.functionCall.name}`;
        return {
          id,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        };
      });
      pendingToolCallIds = toolCalls.map((call) => call.id);
      messages.push({
        role: "assistant",
        content: textParts.join("\n") || null,
        tool_calls: toolCalls,
      });
      continue;
    }

    if (functionResponses.length) {
      for (let index = 0; index < functionResponses.length; index += 1) {
        const part = functionResponses[index];
        const id =
          part.functionResponse.id ||
          pendingToolCallIds[index] ||
          `call_tool_${index}_${part.functionResponse.name}`;
        messages.push({
          role: "tool",
          tool_call_id: id,
          name: part.functionResponse.name,
          content: JSON.stringify(part.functionResponse.response || {}),
        });
      }
      pendingToolCallIds = [];
      continue;
    }

    const text = textParts.join("\n").trim();
    if (!text) continue;

    messages.push({
      role: content.role === "model" ? "assistant" : "user",
      content: text,
    });
  }

  return messages;
};

export const generateAiWithTools = async (input: {
  systemPrompt: string;
  contents: AiContent[];
  model?: string;
  timeoutMs?: number;
  enableTools?: boolean;
  allowedToolNames?: string[] | null;
}): Promise<AiGenerateResult> => {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    console.error(`${LOG_PREFIX} missing_api_key`, {
      hint: "Configura GROQ_API_KEY en .env / Vercel y redeploy",
    });
    throw new Error("API key de IA no está configurada en el servidor");
  }

  const model = (input.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? 25000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const enableTools = input.enableTools ?? true;
  const tools = enableTools ? toOpenAiTools(input.allowedToolNames) : [];
  const messages = contentsToOpenAiMessages(input.systemPrompt, input.contents);

  console.log(`${LOG_PREFIX} request_started`, {
    model,
    messagesCount: messages.length,
    timeoutMs,
    enableTools,
    toolsCount: tools.length,
    apiKeyPresent: true,
    apiKeyPrefix: `${apiKey.slice(0, 6)}...`,
  });

  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: 0.4,
      max_tokens: 4096,
    };

    if (tools.length) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const response = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    const raw = await response.json();
    const choice = (
      raw as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: OpenAiToolCall[];
          };
          finish_reason?: string | null;
        }>;
        error?: { message?: string; type?: string; code?: string };
      }
    )?.choices?.[0];

    const message = choice?.message;
    const text = String(message?.content || "").trim();
    const toolCalls = Array.isArray(message?.tool_calls)
      ? message.tool_calls
      : [];

    const functionCalls: AiFunctionCall[] = toolCalls
      .filter((call) => call?.type === "function" && call.function?.name)
      .map((call) => ({
        id: String(call.id || crypto.randomUUID()),
        name: String(call.function.name).trim(),
        args: parseToolArgs(String(call.function.arguments || "{}")),
      }));

    const modelContent: AiContent | null = functionCalls.length
      ? {
          role: "model",
          parts: [
            ...(text ? [{ text }] : []),
            ...functionCalls.map((call) => ({
              functionCall: {
                id: call.id,
                name: call.name,
                args: call.args,
              },
            })),
          ],
        }
      : text
        ? { role: "model", parts: [{ text }] }
        : null;

    console.log(`${LOG_PREFIX} raw_response`, {
      model,
      ok: response.ok,
      status: response.status,
      functionCallCount: functionCalls.length,
      hasText: Boolean(text),
      finishReason: choice?.finish_reason ?? null,
    });

    if (!response.ok) {
      const errMessage =
        raw?.error?.message ||
        `El proveedor de IA respondió con estado ${response.status}`;
      const statusText =
        typeof raw?.error?.type === "string"
          ? raw.error.type
          : typeof raw?.error?.code === "string"
            ? raw.error.code
            : null;
      console.error(`${LOG_PREFIX} api_error`, {
        model,
        status: response.status,
        statusText,
        message: errMessage,
      });
      throw new AiApiError(errMessage, response.status, statusText);
    }

    if (!functionCalls.length && !text) {
      console.error(`${LOG_PREFIX} empty_response`, {
        model,
        finishReason: choice?.finish_reason ?? null,
        raw,
      });
      throw new Error("La IA no devolvió texto ni tool calls");
    }

    return { text, raw, functionCalls, modelContent };
  } catch (error) {
    const isAbort =
      error instanceof Error &&
      (error.name === "AbortError" ||
        error.message.toLowerCase().includes("abort"));

    console.error(`${LOG_PREFIX} request_failed`, {
      model,
      isTimeout: isAbort,
      timeoutMs,
      error: error instanceof Error ? error.message : "unknown_error",
      name: error instanceof Error ? error.name : typeof error,
    });

    if (isAbort) {
      throw new Error(
        `AI timeout: no respondió en ${timeoutMs}ms (modelo ${model})`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const generateAiText = async (input: {
  systemPrompt: string;
  contents: AiContent[];
  model?: string;
  timeoutMs?: number;
}): Promise<{ text: string; raw: unknown }> => {
  const result = await generateAiWithTools({
    ...input,
    enableTools: false,
    timeoutMs: input.timeoutMs ?? 15000,
  });

  if (!result.text) {
    throw new Error("La IA no devolvió texto útil");
  }

  return { text: result.text, raw: result.raw };
};

export const transcribeAudioWithGroq = async (input: {
  bytes: Buffer;
  mimeType: string;
  fileName?: string;
  timeoutMs?: number;
}): Promise<string | null> => {
  const apiKey = getGroqApiKey();
  if (!apiKey) return null;

  const model =
    process.env.GROQ_WHISPER_MODEL?.trim() || DEFAULT_GROQ_WHISPER_MODEL;
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? 30000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(input.bytes)], {
      type: input.mimeType,
    });
    form.append(
      "file",
      blob,
      input.fileName || `audio.${input.mimeType.split("/")[1] || "ogg"}`,
    );
    form.append("model", model);
    form.append("language", "es");
    form.append("response_format", "json");

    const response = await fetch(GROQ_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: form,
    });

    const raw = await response.json();
    if (!response.ok) {
      console.warn(`${LOG_PREFIX} whisper_failed`, {
        status: response.status,
        message: raw?.error?.message || null,
      });
      return null;
    }

    const text = String(raw?.text || "").trim();
    return text || null;
  } catch (error) {
    console.warn(`${LOG_PREFIX} whisper_error`, {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export const describeImageWithGroq = async (input: {
  base64: string;
  mimeType: string;
  caption?: string | null;
  timeoutMs?: number;
}): Promise<string | null> => {
  const apiKey = getGroqApiKey();
  if (!apiKey) return null;

  const model =
    process.env.GROQ_VISION_MODEL?.trim() || DEFAULT_GROQ_VISION_MODEL;
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? 25000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const dataUrl = `data:${input.mimeType};base64,${input.base64}`;
    const caption = input.caption?.trim();
    const response = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content:
              "Eres un extractor visual para un ISP. Describe en español, breve y factual. Si es comprobante de pago, extrae amount, transaction_code (referencia) y bank si son legibles. Si es cédula/RIF, extrae solo los dígitos. No inventes datos ilegibles.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: caption
                  ? `Caption del cliente: ${caption}\nAnaliza la imagen.`
                  : "Analiza la imagen adjunta.",
              },
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
      }),
    });

    const raw = await response.json();
    if (!response.ok) {
      console.warn(`${LOG_PREFIX} vision_failed`, {
        status: response.status,
        model,
        message: raw?.error?.message || null,
      });
      return null;
    }

    const text = String(raw?.choices?.[0]?.message?.content || "").trim();
    return text || null;
  } catch (error) {
    console.warn(`${LOG_PREFIX} vision_error`, {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export type AiReplyDecision = {
  action: "reply" | "handoff";
  message: string;
  reason?: string;
};

export const parseAiReplyDecision = (
  rawText: string,
): AiReplyDecision => {
  const trimmed = rawText.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch?.[0] || trimmed;

  try {
    const parsed = JSON.parse(candidate) as {
      action?: string;
      message?: string;
      reason?: string;
    };

    const action = parsed.action === "handoff" ? "handoff" : "reply";
    const message = String(parsed.message || "").trim();

    if (!message && action === "reply") {
      throw new Error("Respuesta vacía");
    }

    return {
      action,
      message:
        message ||
        "Un asesor de nuestro equipo continuará contigo en breve.",
      reason: parsed.reason ? String(parsed.reason) : undefined,
    };
  } catch (parseError) {
    console.warn(`${LOG_PREFIX} decision_parse_fallback`, {
      parseError:
        parseError instanceof Error ? parseError.message : "parse_failed",
      rawTextPreview: trimmed.slice(0, 280),
    });

    const lower = trimmed.toLowerCase();
    const wantsHandoff =
      lower.includes("asesor") &&
      (lower.includes("humano") ||
        lower.includes("transfer") ||
        lower.includes("deriv"));

    return {
      action: wantsHandoff ? "handoff" : "reply",
      message:
        trimmed ||
        "Un asesor de nuestro equipo continuará contigo en breve.",
    };
  }
};
