import { compressOptionsSchema } from "@/features/image/lib/schema";
import { errorResponse, imageResponse, parseUpload } from "@/server/image/http";
import { compressImage } from "@/server/image/sharp-service";

// Node.js runtime (the default) is required for Sharp. Target-size search encodes
// several times, so allow more time — this does not raise upload size limits.
export const maxDuration = 30;

/** POST multipart/form-data: file=<image>, options=<JSON CompressOptions>. */
export async function POST(request: Request) {
  try {
    const { file, fileName, options } = await parseUpload(request, compressOptionsSchema);
    const result = await compressImage(file, options, { signal: request.signal });
    return imageResponse(result, fileName, {
      attempts: result.attempts,
      targetMet: result.targetMet,
      largerThanOriginal: result.largerThanOriginal,
      explanation: result.explanation,
      suggestion: result.suggestion,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
