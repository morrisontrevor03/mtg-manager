import Link from "next/link";
import { VoiceEntry } from "@/components/collection/VoiceEntry";
import { PageHeader } from "@/components/ui";

export const metadata = {
  title: "Voice entry · MTG Manager",
};

export default function VoiceEntryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Voice entry"
        lead="Announce each card. It gets matched, enriched from Scryfall, and added to your collection — hands free."
        actions={
          <Link href="/collection" className="text-sm text-muted hover:text-foreground">
            ← Collection
          </Link>
        }
      />

      <VoiceEntry />
    </div>
  );
}
