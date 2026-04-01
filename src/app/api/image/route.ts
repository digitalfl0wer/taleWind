import { generateSceneImage } from "@/lib/azure/flux";
import type { ImageRequest, ImageResponse } from "@/types/Api";

/**
 * Sanitizes raw input before use.
 *
 * @param raw - Raw input string.
 * @param maxLen - Maximum length.
 * @returns Sanitized string.
 */
function sanitizeInput(raw: string | undefined, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, maxLen).replace(/[^\x20-\x7E]/g, "");
}

/**
 * Builds a small SVG fallback illustration as a data URL.
 * Used in development only when FLUX is unavailable.
 * Contains no text to match the no-letters/no-words image guardrail.
 *
 * @returns Data URL for an SVG placeholder image.
 */
function buildFallbackImageDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#dbeafe"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="260" cy="280" r="120" fill="#bfdbfe"/>
  <circle cx="760" cy="700" r="160" fill="#fde68a"/>
  <circle cx="512" cy="512" r="180" fill="#ffffff" opacity="0.72"/>
  <circle cx="512" cy="512" r="110" fill="#a7f3d0" opacity="0.92"/>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * POST /api/image
 * Generates a scene illustration with FLUX via Azure AI Foundry.
 *
 * Production: returns 502 with safe error message on failure.
 * Development: returns SVG fallback with 200 so story flow is not blocked.
 */
export async function POST(request: Request): Promise<Response> {
  let payload: ImageRequest;
  try {
    payload = (await request.json()) as ImageRequest;
  } catch {
    return Response.json(
      { imageUrl: null, error: "Invalid JSON body." } as ImageResponse,
      { status: 400 }
    );
  }

  const prompt = sanitizeInput(payload.prompt, 1000);
  const childName = sanitizeInput(payload.childName, 64) || "child";

  if (!prompt) {
    return Response.json(
      { imageUrl: null, error: "Missing prompt." } as ImageResponse,
      { status: 400 }
    );
  }

  try {
    const result = await generateSceneImage({ prompt, childName });
    return Response.json({ imageUrl: result.url } as ImageResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/image] Image generation failed.", message);

    if (process.env.NODE_ENV !== "production") {
      // Development: return SVG fallback so story flow continues during local work.
      return Response.json({
        imageUrl: buildFallbackImageDataUrl(),
        error: "Image generation unavailable. Returned fallback illustration.",
      } as ImageResponse);
    }

    // Production: surface the failure with a safe, non-leaking message.
    return Response.json(
      {
        imageUrl: null,
        error: "Image generation service unavailable. Please try again.",
      } as ImageResponse,
      { status: 502 }
    );
  }
}
