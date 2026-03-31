/**
 * /src/lib/azure/openai.ts
 *
 * Typed wrapper for GPT-4o mini via the Azure AI Foundry endpoint.
 * All story, quiz, safety-check, and derived-memory GPT calls must go through
 * this helper — never instantiate AzureOpenAI inline in API routes.
 *
 * Rules enforced here:
 * - 30-second timeout on every call
 * - try/catch on every call — never throws an unhandled AI error to callers
 * - Never logs child personal data
 * - Never exposes the model name, endpoint, or key in return values
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single message in a GPT conversation. */
export type ChatMessage = ChatCompletionMessageParam;

/** Options for a GPT-4o mini call. */
export interface OpenAIChatOptions {
  /** System prompt — defines the agent role and safety constraints. */
  systemPrompt: string;
  /** The user message or JSON payload to send. */
  userMessage: string;
  /**
   * Maximum tokens to generate. Defaults to 1024.
   * Keep low for safety checks; higher for full story generation.
   */
  maxTokens?: number;
  /**
   * Temperature 0–1. Defaults to 0.7.
   * Use 0.2 for safety checks; 0.7–0.9 for creative story output.
   */
  temperature?: number;
  /**
   * Optional timeout override in milliseconds. Defaults to 30000 (30s).
   * Must never be set to Infinity or 0.
   */
  timeoutMs?: number;
}

/** The structured result returned by callGpt. */
export interface OpenAIChatResult {
  /** The model's text response. */
  content: string;
  /** Whether the call succeeded. */
  success: boolean;
  /** Error message if success is false. Safe to log — no personal data. */
  errorMessage: string | null;
}

// ── Client factory ────────────────────────────────────────────────────────────

// ⚠️  DO NOT replace OpenAI with AzureOpenAI here.
// AZURE_OPENAI_ENDPOINT is an Azure AI Foundry /openai/v1/ URL.
// AzureOpenAI is the legacy client for /openai/deployments/<name>/ endpoints
// and will return 404 against a Foundry endpoint.
// The base OpenAI client with baseURL is correct for Foundry (2025 Azure docs).

/**
 * Creates and returns a configured OpenAI client pointed at the
 * Azure AI Foundry /openai/v1/ endpoint via baseURL.
 * Reads credentials from environment variables — never from arguments.
 *
 * @returns Configured OpenAI instance.
 * @throws If required environment variables are missing.
 */
function getOpenAIClient(): OpenAI {
  const baseURL = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const apiKey = process.env.AZURE_OPENAI_KEY?.trim();

  if (!baseURL || !apiKey) {
    throw new Error(
      "[azure/openai] Missing one or more required environment variables: " +
        "AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY"
    );
  }

  return new OpenAI({ baseURL, apiKey });
}

// ── Main call helper ──────────────────────────────────────────────────────────

/**
 * Calls GPT-4o mini with a system prompt and a user message.
 * Enforces a 30-second timeout and wraps all errors.
 * Never throws — always returns an OpenAIChatResult.
 *
 * @param options - System prompt, user message, and optional tuning params.
 * @returns OpenAIChatResult with content or an error message.
 */
export async function callGpt(
  options: OpenAIChatOptions
): Promise<OpenAIChatResult> {
  const {
    systemPrompt,
    userMessage,
    maxTokens = 1024,
    temperature = 0.7,
    timeoutMs = 30_000,
  } = options;


  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  

  // Wrap the call in a timeout race
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`GPT call timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
  );

  const client = getOpenAIClient();
  const requestParams = {
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  const MAX_RETRIES = 3;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await Promise.race([
        client.chat.completions.create(requestParams),
        timeoutPromise,
      ]);

      const content = response.choices[0]?.message?.content ?? "";

      if (!content) {
        return {
          content: "",
          success: false,
          errorMessage: "GPT returned an empty response.",
        };
      }

      return { content, success: true, errorMessage: null };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error calling GPT-4o mini";
      lastError = message;

      // Only retry on 429 rate limit errors
      const is429 =
        (err instanceof Error && err.message.includes("429")) ||
        (typeof (err as { status?: number }).status === "number" &&
          (err as { status: number }).status === 429);

      if (!is429 || attempt === MAX_RETRIES - 1) {
        console.error("[azure/openai] callGpt error:", message);
        return { content: "", success: false, errorMessage: message };
      }

      // Exponential backoff: 1s, 2s, 4s
      const backoffMs = 1000 * Math.pow(2, attempt);
      console.warn(
        `[azure/openai] 429 rate limit — retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  return { content: "", success: false, errorMessage: lastError };
}

/**
 * Calls GPT-4o mini and parses the response as JSON.
 * The system prompt MUST instruct the model to return valid JSON only.
 * Returns null if parsing fails or the call errors.
 *
 * @param options - Same as callGpt options.
 * @returns Parsed JSON object of type T, or null on failure.
 */
export async function callGptJson<T>(
  options: OpenAIChatOptions
): Promise<T | null> {
  const result = await callGpt(options);

  if (!result.success || !result.content) {
    return null;
  }

  try {
    // Strip markdown code fences if the model wraps the JSON
    const cleaned = result.content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    return JSON.parse(cleaned) as T;
  } catch (parseErr) {
    console.error(
      "[azure/openai] callGptJson parse error:",
      parseErr instanceof Error ? parseErr.message : "JSON parse failed"
    );
    return null;
  }
}
