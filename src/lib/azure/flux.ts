/**
 * /src/lib/azure/flux.ts
 *
 * FLUX 1.1 pro image generation helper via Azure AI Foundry.
 * Used by the Story Agent to generate one scene illustration per scene.
 *
 * Rules enforced here:
 * - Child-appropriate illustrated style enforced in every prompt via prefix
 * - 30-second timeout on every call
 * - try/catch on every call — never throws to callers
 * - Never logs child personal data
 * - Never exposes the endpoint or key in return values
 */

import type { ImageGenerationRequest, ImageGenerationResult } from "@/types/Story";

// ── Style enforcement prefix ──────────────────────────────────────────────────

/**
 * Mandatory style prefix prepended to every FLUX prompt.
 * Enforces child-appropriate illustrated aesthetic regardless of scene content.
 */
const CHILD_SAFE_STYLE_PREFIX =
  "Children's illustrated storybook art style, soft warm colors, gentle and friendly, " +
  "flat illustration, age 5-7 appropriate, no scary elements, no realistic violence, " +
  "whimsical and cozy: ";

// ── FLUX call ─────────────────────────────────────────────────────────────────

/**
 * Generates a scene illustration using FLUX 1.1 pro via Azure AI Foundry.
 * Prepends the child-safe style prefix to the provided scene prompt.
 * Returns a URL to the generated image.
 *
 * @param request - The scene image prompt and child name (name used for logging only).
 * @returns ImageGenerationResult with the image URL on success.
 * @throws Error on failure — callers must handle this.
 */
export async function generateSceneImage(
  request: ImageGenerationRequest
): Promise<ImageGenerationResult> {
  const endpoint = process.env.AZURE_FLUX_ENDPOINT?.trim();
  const apiKey = process.env.AZURE_FLUX_KEY?.trim();
  const deployment =
    process.env.AZURE_FLUX_DEPLOYMENT?.trim() ??
    process.env.AZURE_OPENAI_DEPLOYMENT_2?.trim() ??
    "FLUX-1.1-pro";

  if (!endpoint || !apiKey) {
    throw new Error(
      "[azure/flux] Missing AZURE_FLUX_ENDPOINT or AZURE_FLUX_KEY environment variables."
    );
  }

  // Prepend style enforcement to ensure child-appropriate output
  const safePrompt = `${CHILD_SAFE_STYLE_PREFIX}${request.prompt}`;

  const requestBody = {
    prompt: safePrompt,
    n: 1,
    size: "1024x1024",
  };

  const timeoutMs = 30_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // FLUX 1.1 pro on Azure Foundry exposes an OpenAI-compatible images endpoint
    const response = await fetch(
      `${endpoint.replace(/\/$/, "")}/deployments/${deployment}/images/generations?api-version=2024-02-01`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[azure/flux] Image generation failed (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as {
      data?: Array<{ url?: string }>;
    };

    const url = data?.data?.[0]?.url;

    if (!url) {
      throw new Error(
        "[azure/flux] Image generation succeeded but returned no URL."
      );
    }

    return { url };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `[azure/flux] Image generation timed out after ${timeoutMs}ms.`
      );
    }

    // Never log the child name or prompt content — log context only
    console.error(
      "[azure/flux] generateSceneImage error:",
      err instanceof Error ? err.message : "Unknown error"
    );

    throw err instanceof Error
      ? err
      : new Error("[azure/flux] Unknown image generation error.");
  }
}
