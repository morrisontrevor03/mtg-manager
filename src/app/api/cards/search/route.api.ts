import { autocomplete } from "@/lib/scryfall";
import { handle, ok } from "@/lib/http";

export const runtime = "nodejs";

export function GET(req: Request) {
  return handle(async () => {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    const names = await autocomplete(q);
    return ok({ names });
  });
}
