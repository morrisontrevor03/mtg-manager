// AWS Lambda entry point for the deck-builder worker.
//
// The API's POST /api/decks/build records a job and invokes this function
// asynchronously with `{ jobId }`. It is not behind API Gateway, so it is free
// of the 29-second ceiling; its own timeout is `deck_worker_timeout_seconds`.
// All the logic lives in `src/lib/deckBuildJobs.ts`, shared with `next dev`.

import { runJob } from "@/lib/deckBuildJobs";

interface WorkerEvent {
  jobId?: unknown;
}

export async function handler(event: WorkerEvent): Promise<void> {
  if (typeof event?.jobId !== "string" || !event.jobId) {
    // Nothing to record against; an async invoke has no caller to tell.
    console.error("deck worker invoked without a jobId", JSON.stringify(event));
    return;
  }
  // runJob records failures on the job itself and never rethrows, so Lambda
  // never sees an error and never retries a build the user was already told about.
  await runJob(event.jobId);
}
