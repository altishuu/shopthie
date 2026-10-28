import { spawnSync } from "node:child_process";

// Route assertions alone can pass while SDK initialization raises a server prerender error.
const run = spawnSync(
  "npx",
  ["playwright", "test", "tests/e2e/identity.spec.ts", "--workers=2", ...process.argv.slice(2)],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);
const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
process.stdout.write(output);
if (
  /blocking-prerender-current-time|encountered the unstable value|uncached data was accessed outside/i.test(
    output,
  )
) {
  process.stderr.write(
    "Identity verification failed: request-time SDK work escaped into prerendering.\n",
  );
  process.exit(1);
}
process.exit(run.status ?? 1);
