#!/usr/bin/env node
/**
 * Start Next.js in production, ensuring we listen on PORT and 0.0.0.0 for Railway etc.
 * Uses the Next binary directly and explicit cwd so it works in Nixpacks/Railway.
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const port = String(process.env.PORT || "3000");
const host = process.env.HOSTNAME || "0.0.0.0";

console.log(`[start-server] cwd=${appRoot} host=${host} port=${port} (PORT env: ${process.env.PORT ?? "not set"})`);

const nextBin = join(appRoot, "node_modules/next/dist/bin/next");
const child = spawn(
  process.execPath,
  [nextBin, "start", "-H", host, "-p", port],
  {
    cwd: appRoot,
    stdio: "inherit",
    env: { ...process.env, PORT: port },
    shell: false,
  }
);

child.on("error", (err) => {
  console.error("[start-server] failed to spawn Next:", err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
