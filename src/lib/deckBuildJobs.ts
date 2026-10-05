import { db } from "@/lib/db";
import { buildAndSaveDeck } from "@/lib/deckBuilder";
import { BuildParamsSchema, type BuildParams } from "@/lib/deckParams";

/**
 * Asynchronous deck builds.
 *
 * A build is one or two large model calls plus Scryfall lookups, which can run
 * for minutes; API Gateway cuts every request at 29 seconds. So the request
 * only records a job and hands it to a worker, and the page polls for status:
 *
 *   POST /api/decks/build      -> createJob + dispatchJob -> 202 { jobId }
 *   worker                     -> runJob: queued -> running -> succeeded | failed
 *   GET  /api/decks/build/{id} -> getJob
 *
 * On AWS the worker is a separate Lambda (`DECK_WORKER_FUNCTION`), invoked
 * asynchronously. Under `next dev` that variable is unset and the build runs in
 * the background of the dev server's own long-lived process.
 */

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

/**
 * A job still queued or running after this long is treated as dead: the worker
 * timed out or crashed before it could record the outcome. Keep it above the
 * worker Lambda's timeout (`deck_worker_timeout_seconds` in infra/).
 */
export const STALE_AFTER_MS = 12 * 60 * 1000;

export interface JobView {
  id: string;
  status: JobStatus;
  deckId: string | null;
  /** Rule violations, unresolved cards and shortfalls. The deck was still saved. */
  warnings: string[];
  error: string;
  createdAt: string;
}

/** The user already has a build in flight. Carries that job's id. */
export class BuildInProgressError extends Error {
  constructor(readonly jobId: string) {
    super("A deck is already being built. Wait for it to finish before starting another.");
    this.name = "BuildInProgressError";
  }
}

function activeSince(): Date {
  return new Date(Date.now() - STALE_AFTER_MS);
}

export async function createJob(userId: string, params: BuildParams): Promise<{ id: string }> {
  // One build at a time per user: each costs a couple of large model calls,
  // and there is no credit system yet to meter them.
  const active = await db.deckBuildJob.findFirst({
    where: { userId, status: { in: ["queued", "running"] }, createdAt: { gt: activeSince() } },
    select: { id: true },
  });
  if (active) throw new BuildInProgressError(active.id);

  return db.deckBuildJob.create({ data: { userId, params }, select: { id: true } });
}

/** Start the worker for a queued job. Marks the job failed if that is impossible. */
export async function dispatchJob(jobId: string): Promise<void> {
  const fn = process.env.DECK_WORKER_FUNCTION;

  if (!fn) {
    // `next dev`: the process outlives the request, so just run it here.
    // runJob records its own failures, but never let a rejection go unhandled.
    void runJob(jobId).catch((err) => console.error(`deck build job ${jobId} crashed`, err));
    return;
  }

  try {
    // Imported lazily so local development never loads the AWS SDK.
    const { LambdaClient, InvokeCommand } = await import("@aws-sdk/client-lambda");
    // The VPC has no NAT: egress is IPv6-only, and only the dual-stack
    // endpoint (lambda.<region>.api.aws) publishes AAAA records.
    const client = new LambdaClient({ useDualstackEndpoint: true });
    await client.send(
      new InvokeCommand({
        FunctionName: fn,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify({ jobId })),
      }),
    );
  } catch (err) {
    await finish(jobId, { status: "failed", error: "Could not start the deck builder. Try again." });
    throw err;
  }
}

/** Run one job to completion. Safe to call twice: only the first call claims it. */
export async function runJob(jobId: string): Promise<void> {
  const claimed = await db.deckBuildJob.updateMany({
    where: { id: jobId, status: "queued" },
    data: { status: "running", startedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const job = await db.deckBuildJob.findUniqueOrThrow({ where: { id: jobId } });

  try {
    // Re-parsed rather than cast: the row is JSON, and the transforms are idempotent.
    const params = BuildParamsSchema.parse(job.params);
    const result = await buildAndSaveDeck({ userId: job.userId, ...params });
    await finish(jobId, {
      status: "succeeded",
      deckId: result.deckId,
      warnings: [
        ...result.violations,
        ...result.unresolved.map((n) => `Unresolved card: ${n}`),
        ...result.shortfalls,
      ],
    });
  } catch (err) {
    console.error(`deck build job ${jobId} failed`, err);
    await finish(jobId, {
      status: "failed",
      error: err instanceof Error ? err.message : "Deck build failed.",
    });
  }
}

function finish(
  jobId: string,
  data: { status: "succeeded" | "failed"; deckId?: string; warnings?: string[]; error?: string },
) {
  return db.deckBuildJob.update({ where: { id: jobId }, data: { ...data, finishedAt: new Date() } });
}

/** A user's job, or null if it does not exist or belongs to someone else. */
export async function getJob(userId: string, jobId: string): Promise<JobView | null> {
  const job = await db.deckBuildJob.findFirst({ where: { id: jobId, userId } });
  if (!job) return null;

  let status = job.status as JobStatus;
  let error = job.error;
  if ((status === "queued" || status === "running") && job.createdAt < activeSince()) {
    status = "failed";
    error = "The deck builder stopped responding. Try again.";
  }

  return {
    id: job.id,
    status,
    deckId: job.deckId,
    warnings: (job.warnings as string[] | null) ?? [],
    error,
    createdAt: job.createdAt.toISOString(),
  };
}
