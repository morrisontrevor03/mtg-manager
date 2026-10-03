import { autocomplete } from "@/lib/scryfall";
import { handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export function GET(req: Request) {
  return handle(async () => {
    await requireUser(req);
    const q = new URL(req.url).searchParams.get("q") ?? "";
    const names = await autocomplete(q);
    return ok({ names });
  });
}
