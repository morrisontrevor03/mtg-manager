// Stages the AWS Lambda deployment package for the MTG Manager backend.
//
//   node lambda/build.mjs [--arch=arm64|x86_64]
//
// Output: lambda/dist/package/ — a directory that `infra/` zips with Terraform's
// archive_file, so no platform-specific zip tooling is involved. All three Lambda
// functions (api, deck-worker and migrate) share this one package and differ
// only in handler.

import { build } from "esbuild";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = join(here, "dist", "package");

// Prisma ships one native query engine per platform; only the engine matching
// the Lambda's architecture is worth shipping (they are ~16MB each).
const ENGINES = {
  arm64: "libquery_engine-linux-arm64-openssl-3.0.x.so.node",
  x86_64: "libquery_engine-rhel-openssl-3.0.x.so.node",
};

const archArg = process.argv.find((a) => a.startsWith("--arch="));
const arch = archArg ? archArg.split("=")[1] : "arm64";
const engine = ENGINES[arch];
if (!engine) {
  console.error(`Unknown --arch=${arch}. Expected one of: ${Object.keys(ENGINES).join(", ")}`);
  process.exit(1);
}

rmSync(join(here, "dist"), { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// --- 1. Bundle the entry points --------------------------------------------
//
// Prisma is marked external and copied in as real files below: the generated
// client resolves its engine relative to its own directory on disk, which a
// bundler would break. The AWS SDK is bundled even though the runtime ships v3:
// the runtime copy is only reachable through NODE_PATH, which the `import()` in
// deckBuildJobs.ts does not consult, and bundling pins the version we tested.

await build({
  entryPoints: {
    index: join(here, "src", "handler.ts"),
    worker: join(here, "src", "worker.ts"),
    migrate: join(here, "src", "migrate.ts"),
  },
  outdir: outDir,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: true,
  // Readable stack traces in CloudWatch matter more here than a smaller zip.
  minify: false,
  legalComments: "none",
  external: ["@prisma/client", ".prisma/client"],
  alias: { "@": join(root, "src") },
  logLevel: "info",
});

// --- 2. Copy the Prisma client, keeping only the engine we need ------------

// Prisma's package ships every platform and every engine flavour. For a
// library-engine Postgres client on one architecture, most of it is dead weight,
// and Lambda caps an unzipped package at 250MB.
const prismaFilter = (src) => {
  const name = basename(src);

  // Native engines for other platforms.
  if (name.startsWith("libquery_engine") || name.startsWith("query_engine")) {
    if (name !== engine) return false;
  }
  // WASM query engine / compiler fallbacks (driver adapters, not used here).
  if (name.includes("_bg.") && (name.includes("wasm") || name.endsWith(".wasm"))) return false;
  // Types, sourcemaps, and the codegen half of the package.
  if (name.endsWith(".d.ts") || name.endsWith(".d.mts")) return false;
  if (name.endsWith(".map")) return false;
  if (src.includes(join("@prisma", "client", "generator-build"))) return false;
  if (src.includes(join("@prisma", "client", "scripts"))) return false;

  return true;
};

cpSync(join(root, "node_modules", ".prisma", "client"), join(outDir, "node_modules", ".prisma", "client"), {
  recursive: true,
  filter: prismaFilter,
});
cpSync(join(root, "node_modules", "@prisma", "client"), join(outDir, "node_modules", "@prisma", "client"), {
  recursive: true,
  filter: prismaFilter,
});

// --- 3. Copy the schema and migrations for the migrate function -----------

cpSync(join(root, "prisma", "schema.prisma"), join(outDir, "schema.prisma"));
cpSync(join(root, "prisma", "migrations"), join(outDir, "migrations"), { recursive: true });

// CommonJS output in a package whose nearest package.json might say otherwise.
writeFileSync(join(outDir, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2));

// --- 4. Report ------------------------------------------------------------

function totalSize(dir) {
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    bytes += entry.isDirectory() ? totalSize(path) : statSync(path).size;
  }
  return bytes;
}

const mb = (totalSize(outDir) / 1024 / 1024).toFixed(1);
console.log(`\nPackage staged at lambda/dist/package (${mb} MB unzipped, arch=${arch})`);
console.log(`Query engine: ${engine}`);
console.log("Next: cd infra && terraform apply");
