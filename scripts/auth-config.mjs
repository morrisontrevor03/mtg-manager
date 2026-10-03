// Writes public/auth-config.json for local development.
//
//   npm run auth:config
//
// The deployed site gets this file from Terraform (infra/auth.tf). Locally,
// `next dev` serves it from public/, and the API routes read the same file to
// verify access tokens. It holds only public identifiers, but it is gitignored
// because it describes one particular deployment.

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const result = spawnSync("terraform", ["-chdir=infra", "output", "-raw", "auth_config_json"], {
  cwd: root,
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  console.error(
    "\nCould not read the auth_config_json output. Run `terraform init` in infra/ " +
      "(see docs/ci-cd.md) and make sure the stack has been applied.",
  );
  process.exit(1);
}

const config = JSON.parse(result.stdout);
const out = join(root, "public", "auth-config.json");
writeFileSync(out, JSON.stringify(config, null, 2) + "\n");
console.log(`Wrote ${out}`);
console.log(`User pool ${config.userPoolId}, Google sign-in ${config.googleEnabled ? "on" : "off"}.`);
