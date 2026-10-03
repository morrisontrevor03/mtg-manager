import { getDashboardData } from "@/lib/aggregate";
import { handle, ok } from "@/lib/http";

export const runtime = "nodejs";

export function GET() {
  return handle(async () => ok(await getDashboardData()));
}
