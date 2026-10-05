-- Async deck builds: the build request records a job and a worker Lambda runs it,
-- because a build outlasts API Gateway's 29-second integration timeout.

-- CreateTable
CREATE TABLE "DeckBuildJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "params" JSONB NOT NULL,
    "deckId" TEXT,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeckBuildJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeckBuildJob_userId_createdAt_idx" ON "DeckBuildJob"("userId", "createdAt");

