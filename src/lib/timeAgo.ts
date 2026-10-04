/**
 * Compact relative time for activity lists: "just now", "4 min ago",
 * "3 h ago", "yesterday", "5 days ago", then a short date. Pure (takes `now`)
 * so it can be tested without faking the clock.
 */
export function timeAgo(iso: string | Date, now: Date = new Date()): string {
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);

  if (!Number.isFinite(seconds)) return "";
  if (seconds < 45) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  // Calendar days rather than 24-hour blocks, so last night reads "yesterday".
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(then)) / 86_400_000);
  if (days <= 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  return then.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(then.getFullYear() !== now.getFullYear() && { year: "numeric" }),
  });
}
