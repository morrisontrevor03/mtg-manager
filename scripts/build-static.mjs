// Builds the static frontend for S3 + CloudFront.
//
//   npm run build:static   ->  out/
//
// A script rather than an inline env var in package.json, because npm runs
// scripts through cmd.exe on Windows, where `STATIC_EXPORT=1 next build` is not
// valid syntax.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// A previous non-export build leaves route handlers in .next that confuse the
// export, and Windows/OneDrive sometimes refuses to unlink them mid-build.
for (const dir of [".next", "out"]) {
  rmSync(join(root, dir), { recursive: true, force: true });
}

const result = spawnSync("npx", ["next", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, STATIC_EXPORT: "1" },
});

if (result.status !== 0) process.exit(result.status ?? 1);

const out = join(root, "out");
if (!existsSync(join(out, "index.html"))) {
  console.error("\nBuild finished but out/index.html is missing — nothing to deploy.");
  process.exit(1);
}

function walk(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = walk(path);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

const { files, bytes } = walk(out);
console.log(`\nStatic frontend in out/ — ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
console.log("Next: cd infra && terraform apply   (uploads and invalidates CloudFront)");
