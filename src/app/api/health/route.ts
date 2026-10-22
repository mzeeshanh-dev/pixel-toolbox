import { connection } from "next/server";

/** Basic liveness probe. Intentionally exposes no versions, secrets or environment details. */
export async function GET() {
  await connection();
  return Response.json(
    { status: "ok", timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
