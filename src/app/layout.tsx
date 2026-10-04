import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { AppNav } from "@/components/auth/AppNav";
import { AuthGate, AuthProvider } from "@/components/auth/AuthProvider";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <header className="sticky top-0 z-20 border-b border-border bg-background">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2.5 px-4 py-3 sm:flex-nowrap sm:gap-7 sm:px-6 sm:py-3.5">
              <Link href="/" className="group flex items-baseline gap-2">
                <span className="display text-lg font-semibold tracking-tight">
                  MTG Manager
                </span>
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-primary transition-transform duration-300 group-hover:scale-150"
                />
              </Link>
              <AppNav />
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
            <AuthGate>{children}</AuthGate>
          </main>

          <footer className="border-t border-border/60 px-6 py-6">
            <p className="mx-auto max-w-6xl text-xs text-faint-foreground">
              Card data and imagery courtesy of{" "}
              <a
                href="https://scryfall.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-muted-foreground"
              >
                Scryfall
              </a>
              . Not affiliated with Wizards of the Coast.
            </p>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
