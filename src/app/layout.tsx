import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// The display face. `opsz` keeps large headings elegant; `SOFT`/`WONK` are what
// give it personality without tipping into novelty.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "MTG Manager",
  description: "Collection dashboard and LLM deck builder for Magic: The Gathering.",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/collection", label: "Collection" },
  { href: "/decks", label: "Decks" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-[color:var(--surface)]/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center gap-7 px-6 py-3.5">
            <Link href="/" className="group flex items-baseline gap-2">
              <span className="display text-lg font-semibold tracking-tight">
                MTG Manager
              </span>
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-accent transition-transform duration-300 group-hover:scale-150"
              />
            </Link>
            <nav className="flex gap-5">
              {NAV.map((n) => (
                <NavLink key={n.href} {...n} />
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>

        <footer className="border-t border-border/60 px-6 py-6">
          <p className="mx-auto max-w-6xl text-xs text-muted-dim">
            Card data and imagery courtesy of{" "}
            <a
              href="https://scryfall.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-muted"
            >
              Scryfall
            </a>
            . Not affiliated with Wizards of the Coast.
          </p>
        </footer>
      </body>
    </html>
  );
}
