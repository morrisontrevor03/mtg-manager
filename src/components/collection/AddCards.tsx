"use client";

import { FileTextIcon, PencilLineIcon, PlusIcon } from "lucide-react";
import { AddCardForm } from "@/components/collection/AddCardForm";
import { ImportPanel } from "@/components/collection/ImportPanel";
import { WaveformIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AddMode = "manual" | "import" | "voice";

/**
 * The one way into data entry on the Collection page. Entry tools live behind
 * this menu so the page itself stays about the cards. Manual and import open
 * dialogs; voice is a row the page shows above the card list, so cards can be
 * seen landing in the collection as they are read out.
 *
 * `mode` is controlled by the page so other places (the dashboard's Voice
 * entry button, the empty state) can open a specific tool.
 */
export function AddCardsMenu({
  mode,
  onModeChange,
  onChanged,
}: {
  mode: AddMode | null;
  onModeChange: (mode: AddMode | null) => void;
  onChanged: () => void;
}) {
  const close = () => onModeChange(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <PlusIcon />
            Add cards
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onSelect={() => onModeChange("manual")}>
            <PencilLineIcon />
            <MenuText title="Add manually" hint="Search by name, set quantity and foil" />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onModeChange("import")}>
            <FileTextIcon />
            <MenuText title="Import list" hint="Paste a list or upload a CSV" />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onModeChange("voice")}>
            <WaveformIcon size={16} className="text-primary" />
            <MenuText title="Voice entry" hint="Read cards out, hands free" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mode === "manual"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a card</DialogTitle>
            <DialogDescription>
              Set, price and artwork are filled in from Scryfall. The dialog stays open so you
              can add several in a row.
            </DialogDescription>
          </DialogHeader>
          <AddCardForm onChanged={onChanged} />
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "import"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Import a list</DialogTitle>
            <DialogDescription>
              One card per line. Quantities like <code className="font-mono">4</code> or{" "}
              <code className="font-mono">4x</code> and trailing set codes are understood.
            </DialogDescription>
          </DialogHeader>
          <ImportPanel onChanged={onChanged} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function MenuText({ title, hint }: { title: string; hint: string }) {
  return (
    <span className="flex flex-col">
      <span>{title}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </span>
  );
}
