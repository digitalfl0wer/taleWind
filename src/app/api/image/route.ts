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
 * POST /api/image
 * Generates a scene illustration with FLUX 1.1 pro.
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
    console.error(
      "[api/image] Image generation failed.",
      err instanceof Error ? err.message : "Unknown error"
    );
    return Response.json(
      { imageUrl: null, error: "Image generation failed." } as ImageResponse,
      { status: 500 }
    );
  }
}
