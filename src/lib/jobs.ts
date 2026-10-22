import { jobHistoryLimits } from "@/config/limits";
import { getDb, newId, type JobRecord } from "@/lib/db";

/**
 * Recent-job history. Retention policy: metadata only (no file contents), newest
 * `jobHistoryLimits.maxEntries` kept, cleared on demand. Failures to record history
 * never break the actual processing flow.
 */
export async function recordJob(job: Omit<JobRecord, "id" | "createdAt">): Promise<void> {
  try {
    const db = getDb();
    await db.transaction("rw", db.jobs, async () => {
      await db.jobs.add({ ...job, id: newId(), createdAt: Date.now() });
      const count = await db.jobs.count();
      if (count > jobHistoryLimits.maxEntries) {
        const stale = await db.jobs
          .orderBy("createdAt")
          .limit(count - jobHistoryLimits.maxEntries)
          .primaryKeys();
        await db.jobs.bulkDelete(stale);
      }
    });
  } catch {
    // History is best-effort (storage may be blocked or full).
  }
}

export async function clearJobs(tool?: JobRecord["tool"] | JobRecord["tool"][]): Promise<void> {
  const db = getDb();
  if (!tool) {
    await db.jobs.clear();
    return;
  }
  const tools = Array.isArray(tool) ? tool : [tool];
  await db.jobs.where("tool").anyOf(tools).delete();
}
