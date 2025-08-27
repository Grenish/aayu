import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { NextRequest } from "next/server";
import SYSTEM_INSTRUCTION from "./instruction";

export const runtime = "edge";

const GEMINI_MODELS = {
  FLASH: "gemini-2.5-flash",
  FLASH_8B: "gemini-2.5-flash-8b",
  PRO: "gemini-2.5-pro",
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

    const {
      messages,
      prompt,
      system,
      model = GEMINI_MODELS.FLASH,
      temperature = 0.7,
    } = body;

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

    if (messages && messages.length > 0) {
      result = await streamText({
        model: geminiModel,
        messages,
        system,
        temperature,
        abortSignal: AbortSignal.timeout(30000),
      });
    } else if (prompt) {
      result = await streamText({
        model: geminiModel,
        prompt,
        system,
        temperature,
        abortSignal: AbortSignal.timeout(30000),
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
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Optional: Handle OPTIONS for CORS if needed
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
