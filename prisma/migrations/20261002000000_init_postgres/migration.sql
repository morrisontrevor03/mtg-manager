-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "scryfallId" TEXT NOT NULL,
    "oracleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "setCode" TEXT NOT NULL,
    "collectorNumber" TEXT NOT NULL,
    "manaCost" TEXT NOT NULL DEFAULT '',
    "cmc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "typeLine" TEXT NOT NULL DEFAULT '',
    "oracleText" TEXT NOT NULL DEFAULT '',
    "colors" JSONB NOT NULL,
    "colorIdentity" JSONB NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT '',
    "layout" TEXT NOT NULL DEFAULT 'normal',
    "imageUri" TEXT NOT NULL DEFAULT '',
    "prices" JSONB NOT NULL,
    "legalities" JSONB NOT NULL,
    "scryfallUri" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogCache" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "foil" BOOLEAN NOT NULL DEFAULT false,
    "condition" TEXT NOT NULL DEFAULT 'NM',
    "acquiredPrice" DOUBLE PRECISION,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deck" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'standard',
    "description" TEXT NOT NULL DEFAULT '',
    "commanderCardId" TEXT,
    "colors" JSONB NOT NULL DEFAULT '[]',
    "llmModel" TEXT NOT NULL DEFAULT '',
    "llmPrompt" TEXT NOT NULL DEFAULT '',
    "llmRationale" TEXT NOT NULL DEFAULT '',
    "manaBaseNotes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckCard" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "role" TEXT NOT NULL DEFAULT 'mainboard',
    "owned" BOOLEAN NOT NULL DEFAULT false,
    "acquire" BOOLEAN NOT NULL DEFAULT false,
    "estPrice" DOUBLE PRECISION,

    CONSTRAINT "DeckCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Card_scryfallId_key" ON "Card"("scryfallId");

-- CreateIndex
CREATE INDEX "Card_oracleId_idx" ON "Card"("oracleId");

-- CreateIndex
CREATE INDEX "Card_name_idx" ON "Card"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogCache_key_key" ON "CatalogCache"("key");

-- CreateIndex
CREATE INDEX "CollectionItem_cardId_idx" ON "CollectionItem"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_cardId_foil_key" ON "CollectionItem"("cardId", "foil");

-- CreateIndex
CREATE INDEX "Deck_format_idx" ON "Deck"("format");

-- CreateIndex
CREATE INDEX "DeckCard_deckId_idx" ON "DeckCard"("deckId");

-- CreateIndex
CREATE INDEX "DeckCard_cardId_idx" ON "DeckCard"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "DeckCard_deckId_cardId_role_key" ON "DeckCard"("deckId", "cardId", "role");

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_commanderCardId_fkey" FOREIGN KEY ("commanderCardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckCard" ADD CONSTRAINT "DeckCard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckCard" ADD CONSTRAINT "DeckCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

