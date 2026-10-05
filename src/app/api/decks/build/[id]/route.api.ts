import { handle, ok, notFound } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getJob } from "@/lib/deckBuildJobs";

export const runtime = "nodejs";

/** Status of a deck build job. Another user's job reads as not found. */
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUser(req);
    const { id } = await ctx.params;
    const job = await getJob(userId, id);
    if (!job) return notFound("Build not found");
    return ok(job, { headers: { "cache-control": "no-store" } });
  });
}
