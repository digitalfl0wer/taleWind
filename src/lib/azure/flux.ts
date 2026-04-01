/**
 * /src/lib/azure/flux.ts
 *
 * FLUX image generation via the BFL provider-specific API on Microsoft Foundry.
 * Endpoint format: https://<resource>.api.cognitive.microsoft.com/providers/blackforestlabs/v1/<model-path>?api-version=preview
 *
 * Rules enforced here:
 * - Child-appropriate illustrated style enforced in every prompt via prefix
 * - 30-second timeout on every call
 * - Throws on failure — callers must wrap in try/catch
 * - Never logs child personal data or prompts
 * - Never exposes the endpoint or key in return values
 *
 * Required env vars:
 *   AZURE_FLUX_ENDPOINT    — BFL provider base URL, e.g.
 *                            https://proj-talewind-resource.api.cognitive.microsoft.com
 *   AZURE_FLUX_KEY         — api-key from the resource (Keys and Endpoint in Azure portal)
 *   AZURE_FLUX_DEPLOYMENT  — model ID matching a deployed FLUX model (default: FLUX.2-pro)
 *                            Valid values: FLUX.2-pro | FLUX.2-flex | FLUX.1-Kontext-pro | FLUX-1.1-pro
 */

import type { ImageGenerationRequest, ImageGenerationResult } from "@/types/Story";

// ── Style enforcement prefix ──────────────────────────────────────────────────

const CHILD_SAFE_STYLE_PREFIX =
  "Children's illustrated storybook art style, soft warm colors, gentle and friendly, " +
  "flat illustration, age 5-7 appropriate, no scary elements, no realistic violence, " +
  "whimsical and cozy: ";

// ── BFL model ID → URL path segment mapping ───────────────────────────────────
// Source: https://learn.microsoft.com/azure/ai-foundry/how-to/deploy-use-flux
// The model ID (used in request body) and the URL path segment are NOT identical.

const BFL_MODEL_PATHS: Readonly<Record<string, string>> = {
  "FLUX.2-pro": "flux-2-pro",
  "FLUX.2-flex": "flux-2-flex",
  "FLUX.1-Kontext-pro": "flux-kontext-pro",
  "FLUX-1.1-pro": "flux-pro-1.1",
};

// ── FLUX call ─────────────────────────────────────────────────────────────────

/**
 * Generates a scene illustration using FLUX via the BFL provider API on Microsoft Foundry.
 * Prepends the child-safe style prefix to the provided scene prompt.
 * Returns a data URL or remote URL to the generated image.
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
  const deployment = process.env.AZURE_FLUX_DEPLOYMENT?.trim() ?? "FLUX.2-pro";

  if (!endpoint || !apiKey) {
    throw new Error(
      "[azure/flux] Missing AZURE_FLUX_ENDPOINT or AZURE_FLUX_KEY environment variables."
    );
  }

  const modelPath = BFL_MODEL_PATHS[deployment];
  if (!modelPath) {
    throw new Error(
      `[azure/flux] Unknown AZURE_FLUX_DEPLOYMENT "${deployment}". ` +
        `Valid values: ${Object.keys(BFL_MODEL_PATHS).join(", ")}`
    );
  }

  const base = endpoint.replace(/\/$/, "");
  const url = `${base}/providers/blackforestlabs/v1/${modelPath}?api-version=preview`;

  // BFL provider API uses Authorization: Bearer (not api-key header).
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // BFL API uses width/height (not size) and num_images (not n).
  const body = {
    model: deployment,
    prompt: `${CHILD_SAFE_STYLE_PREFIX}${request.prompt}`,
    width: 1024,
    height: 1024,
    output_format: "png",
    num_images: 1,
  };

  const timeoutMs = 30_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Log endpoint family only — never the full URL or key.
  console.info(`[azure/flux] Requesting ${deployment} via BFL provider API`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const statusLine = `${response.status} ${response.statusText}`;

    if (!response.ok) {
      const errorText = await response.text();
      const snippet = errorText.slice(0, 300).replace(/\s+/g, " ");
      console.error(`[azure/flux] BFL provider API -> ${statusLine} | ${snippet}`);
      throw new Error(`[azure/flux] Image generation failed (${statusLine}): ${snippet}`);
    }

    console.info(`[azure/flux] BFL provider API -> ${statusLine}`);

    // BFL via Azure returns images in `images[]`; handle `data[]` as fallback
    // in case the Azure wrapper normalises the shape in a future API version.
    type BflResponse = {
      images?: Array<{ url?: string; b64_json?: string }>;
      data?: Array<{ url?: string; b64_json?: string }>;
    };
    const data = (await response.json()) as BflResponse;

    const item = data?.images?.[0] ?? data?.data?.[0];

    if (item?.b64_json) {
      clearTimeout(timeoutId);
      return { url: `data:image/png;base64,${item.b64_json}` };
    }

    if (item?.url) {
      clearTimeout(timeoutId);
      return { url: item.url };
    }

    throw new Error(
      `[azure/flux] 200 response contained no image payload. ` +
        `Response top-level keys: ${Object.keys(data ?? {}).join(", ")}`
    );
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`[azure/flux] Image generation timed out after ${timeoutMs}ms.`);
    }

    // Never log child name or prompt content — log context only.
    console.error(
      "[azure/flux] generateSceneImage error:",
      err instanceof Error ? err.message : "Unknown error"
    );

    throw err instanceof Error
      ? err
      : new Error("[azure/flux] Unknown image generation error.");
  }
}
