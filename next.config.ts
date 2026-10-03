import type { NextConfig } from "next";

/**
 * `STATIC_EXPORT=1` switches on the build that ships to S3 + CloudFront.
 *
 * It is a separate mode rather than the default because `next dev` still serves
 * the `/api/*` route handlers locally, and those cannot be statically exported —
 * in production they run on Lambda, built straight from `src/app/api/**` by
 * `lambda/build.mjs`. Run it with `npm run build:static`.
 */
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(staticExport ? { output: "export" as const } : {}),

  // The API route handlers are named `route.api.ts`, so Next only treats them as
  // routes when "api.ts" is in this list. The export build leaves it out, which
  // makes them invisible to `next build` — they cannot be statically exported,
  // and in production they run on Lambda instead. Nothing is moved or deleted to
  // achieve that, so an interrupted build leaves the tree intact.
  pageExtensions: staticExport ? ["tsx", "ts"] : ["tsx", "ts", "api.ts"],

  images: {
    // Card art comes straight from Scryfall's CDN.
    remotePatterns: [{ protocol: "https", hostname: "cards.scryfall.io" }],
    // There is no server to optimise images in an export; serve them as-is.
    unoptimized: staticExport,
  },

  // S3 serves `/decks/index.html` for `/decks/`, so emit directory-style output
  // and let CloudFront append `index.html`. Without this, `/decks` would need a
  // rewrite rule to find its file.
  trailingSlash: staticExport,
};

export default nextConfig;
