import { convertOptionsSchema } from "@/features/image/lib/schema";
import { errorResponse, imageResponse, parseUpload } from "@/server/image/http";
import { convertImage } from "@/server/image/sharp-service";

// Node.js runtime (the default) is required for Sharp. A longer duration does not
// raise the platform's 4.5 MB request/response limit; inputs are capped at 4 MB.
export const maxDuration = 30;

/** POST multipart/form-data: file=<image>, options=<JSON EncodeOptions>. */
export async function POST(request: Request) {
  try {
    const { file, fileName, options } = await parseUpload(request, convertOptionsSchema);
    const result = await convertImage(file, options);
    return imageResponse(result, fileName);
  } catch (error) {
    return errorResponse(error);
  }
}
