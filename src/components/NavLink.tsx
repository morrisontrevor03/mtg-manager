"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Nav item that marks itself active so the underline can animate in. */
export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link href={href} className="nav-link text-sm" data-active={active}>
      {label}
    </Link>
  );
}
