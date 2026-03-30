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

import { AzureOpenAI } from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";

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

/**
 * Creates and returns a configured AzureOpenAI client.
 * Reads credentials from environment variables — never from arguments.
 *
 * @returns Configured AzureOpenAI instance.
 * @throws If required environment variables are missing.
 */
function getOpenAIClient(): AzureOpenAI {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const apiKey = process.env.AZURE_OPENAI_KEY?.trim();
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT?.trim();
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION?.trim() ?? "2024-10-21";

  if (!endpoint || !apiKey || !deployment) {
    throw new Error(
      "[azure/openai] Missing one or more required environment variables: " +
        "AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT"
    );
  }

  return new AzureOpenAI({
    endpoint,
    apiKey,
    deployment,
    apiVersion,
  });
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

  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ?? "";

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const requestParams: ChatCompletionCreateParamsNonStreaming = {
    model: deployment,
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  // Wrap the call in a timeout race
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`GPT call timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
  );

  try {
    const client = getOpenAIClient();

    const response = (await Promise.race([
      client.chat.completions.create(requestParams),
      timeoutPromise,
    ])) as Awaited<ReturnType<typeof client.chat.completions.create>>;

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
    // Log the error with context but never include child personal data
    const message =
      err instanceof Error ? err.message : "Unknown error calling GPT-4o mini";
    console.error("[azure/openai] callGpt error:", message);

    return { content: "", success: false, errorMessage: message };
  }
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
