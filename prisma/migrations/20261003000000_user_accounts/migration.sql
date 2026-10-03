-- User accounts: collection items and decks now belong to a Cognito user.
--
-- Existing rows predate accounts and have no owner. They are deliberately
-- discarded rather than assigned to anyone, which is also what lets the new
-- NOT NULL columns be added without a default. The shared Scryfall cache
-- (Card, CatalogCache) is not user data and is kept.
DELETE FROM "DeckCard";
DELETE FROM "Deck";
DELETE FROM "CollectionItem";

-- DropIndex
DROP INDEX "CollectionItem_cardId_foil_key";

-- AlterTable
ALTER TABLE "CollectionItem" ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_userId_cardId_foil_key" ON "CollectionItem"("userId", "cardId", "foil");

-- CreateIndex
CREATE INDEX "Deck_userId_updatedAt_idx" ON "Deck"("userId", "updatedAt");
