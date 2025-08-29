import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { NextRequest } from "next/server";
import SYSTEM_INSTRUCTION from "./instruction";

export const runtime = "edge";

const GEMINI_MODELS = {
  PRO_25: "gemini-2.5-pro",
  FLASH_25: "gemini-2.5-flash",
  FLASH_25_LITE: "gemini-2.5-flash-lite",
  FLASH_20: "gemini-2.0-flash",
  FLASH_20_LITE: "gemini-2.0-flash-lite",
  GEMMA_NANO_2B: "gemma-3n-e2b-it",
  GEMMA_NANO_4B: "gemma-3n-e4b-it",
  GEMMA_12B: "gemma-3-12b-it",
} as const;

type GeminiModel = (typeof GEMINI_MODELS)[keyof typeof GEMINI_MODELS];

interface ChatRequestBody {
  messages?: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  prompt?: string;
  system?: typeof SYSTEM_INSTRUCTION;
  model?: GeminiModel;
  temperature?: number;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "Server configuration error",
          details: "Missing API key configuration",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let body: ChatRequestBody;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          error: "Invalid request",
          details: "Request body must be valid JSON",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { messages, prompt, system, model = GEMINI_MODELS.FLASH_25, temperature = 0.7 } = body;

    const finalSystem = system && system.trim().length > 0 ? system : SYSTEM_INSTRUCTION;
    const appliedSystem = model === GEMINI_MODELS.PRO_25
      ? `${finalSystem}\n\nIMPORTANT: You must structure your response as follows:
<thinking>
Your reasoning process here (be concise)
</thinking>

<final>
Your actual response to the user here
</final>

Never mention these tags to the user. The thinking section is for reasoning only.`
      : finalSystem;

    if (!messages?.length && !prompt) {
      return new Response(
        JSON.stringify({
          error: "Invalid request",
          details: "Either 'messages' array or 'prompt' string is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate temperature range
    if (temperature < 0 || temperature > 2) {
      return new Response(
        JSON.stringify({
          error: "Invalid parameter",
          details: "Temperature must be between 0 and 2",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const geminiModel = google(model);

    let result;

    // Provide a 30s timeout
    const timeoutSignal: AbortSignal =
      (AbortSignal as any).timeout
        ? (AbortSignal as any).timeout(30000)
        : (() => {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), 30000);
            return ctrl.signal;
          })();

    if (messages && messages.length > 0) {
      result = await streamText({
        model: geminiModel,
        messages,
        system: appliedSystem,
        temperature,
        abortSignal: timeoutSignal,
      });
    } else if (prompt) {
      result = await streamText({
        model: geminiModel,
        prompt,
        system: appliedSystem,
        temperature,
        abortSignal: timeoutSignal,
      });
    } else {
      throw new Error("No messages or prompt provided");
    }

    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("[Chat API Error]:", error);

    // Handle model overload / service unavailable explicitly
    const isOverloaded =
      error?.statusCode === 503 ||
      error?.data?.error?.code === 503 ||
      /overloaded|unavailable/i.test(error?.message || "");
    if (isOverloaded) {
      return new Response(
        JSON.stringify({
          error: "Model overloaded",
          details:
            "The selected model is temporarily unavailable (overloaded). Please retry in a moment or switch to a faster variant.",
          transient: true,
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (error?.message?.includes("API key")) {
      return new Response(
        JSON.stringify({
          error: "Authentication error",
          details: "Invalid or missing API key",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (error?.message?.includes("quota")) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          details: "API quota exceeded. Please try again later.",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (error?.message?.includes("model")) {
      return new Response(
        JSON.stringify({
          error: "Invalid model",
          details: "The specified model is not available",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (error?.name === "AbortError") {
      return new Response(
        JSON.stringify({
          error: "Request timeout",
          details: "The request took too long to complete",
        }),
        {
          status: 408,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details:
          process.env.NODE_ENV === "development"
            ? error?.message
            : "An unexpected error occurred",
        transient: false,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}