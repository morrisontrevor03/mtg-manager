import { handle, ok, badRequest } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { MissingApiKeyError } from "@/lib/claude";
import { BuildParamsSchema } from "@/lib/deckParams";
import { BuildInProgressError, createJob, dispatchJob } from "@/lib/deckBuildJobs";

export const runtime = "nodejs";

/**
 * Queue a deck build. Returns 202 with a job id at once; the build itself runs
 * in a worker and the page polls GET /api/decks/build/{id}. See deckBuildJobs.ts.
 */
export function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUser(req);
    const params = BuildParamsSchema.parse(await req.json());

    // Fail now rather than after the user has waited for a worker to find out.
    if (!process.env.ANTHROPIC_API_KEY) return badRequest(new MissingApiKeyError().message);

    let job: { id: string };
    try {
      job = await createJob(userId, params);
    } catch (err) {
      if (err instanceof BuildInProgressError) {
        return Response.json({ error: err.message, jobId: err.jobId }, { status: 409 });
      }
      throw err;
    }

    await dispatchJob(job.id);
    return ok({ jobId: job.id, status: "queued" }, { status: 202 });
  });
}
