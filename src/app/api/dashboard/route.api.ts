import { getDashboardData } from "@/lib/aggregate";
import { handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export function GET(req: Request) {
  return handle(async () => ok(await getDashboardData(await requireUser(req))));
}
