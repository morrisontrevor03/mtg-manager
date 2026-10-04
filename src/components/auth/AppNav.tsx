"use client";

import { useRouter } from "next/navigation";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/collection", label: "Collection" },
  { href: "/decks", label: "Decks" },
];

/** Header navigation and account controls; nothing to navigate to until signed in. */
export function AppNav() {
  const { status, email, signOut } = useAuth();
  const router = useRouter();

  if (status !== "signedIn") return null;

  return (
    <>
      <nav className="order-last flex w-full gap-5 sm:order-none sm:w-auto">
        {NAV.map((n) => (
          <NavLink key={n.href} {...n} />
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        {email && (
          <span className="hidden max-w-[16rem] truncate text-xs text-muted-foreground sm:inline" title={email}>
            {email}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
        >
          Sign out
        </Button>
      </div>
    </>
  );
}
