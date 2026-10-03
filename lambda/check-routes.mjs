// Fails if the route list in lambda/src/routeKeys.ts and the one in
// infra/apigateway.tf have drifted apart.
//
// The two have to agree: a route in the code but not in Terraform is a 404 from
// API Gateway, and a route in Terraform but not in the code is a 404 from the
// handler. Both are the kind of mistake that only shows up in a deployed
// environment, so this check belongs in the build.
//
//   node lambda/check-routes.mjs

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/** Pull the quoted entries out of a bracketed list in a source file. */
function extractList(source, startMarker) {
  const from = source.indexOf(startMarker);
  if (from === -1) throw new Error(`Could not find ${startMarker}`);
  const open = source.indexOf("[", from);
  const close = source.indexOf("]", open);
  if (open === -1 || close === -1) throw new Error(`Malformed list after ${startMarker}`);
  return [...source.slice(open, close).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const codeRoutes = extractList(
  readFileSync(join(root, "lambda", "src", "routeKeys.ts"), "utf8"),
  "export const ROUTE_KEYS",
);

const tfSource = readFileSync(join(root, "infra", "apigateway.tf"), "utf8");
const tfRoutes = extractList(tfSource, "api_routes =");

const onlyInCode = codeRoutes.filter((r) => !tfRoutes.includes(r));
const onlyInTerraform = tfRoutes.filter((r) => !codeRoutes.includes(r));

if (onlyInCode.length || onlyInTerraform.length) {
  console.error("Route lists have drifted:\n");
  for (const r of onlyInCode) {
    console.error(`  in routeKeys.ts but not in apigateway.tf:  ${r}`);
  }
  for (const r of onlyInTerraform) {
    console.error(`  in apigateway.tf but not in routeKeys.ts:  ${r}`);
  }
  console.error("\nUpdate both lists so they match.");
  process.exit(1);
}

// The health route is served by the handler directly, so it is intentionally
// absent from ROUTE_KEYS — but it still has to be declared in Terraform.
if (!tfSource.includes('health_route = "GET /api/health"')) {
  console.error("infra/apigateway.tf no longer declares the GET /api/health route.");
  process.exit(1);
}

console.log(`Routes in sync: ${codeRoutes.length} application routes + /api/health.`);
