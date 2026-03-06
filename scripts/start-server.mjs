#!/usr/bin/env node
/**
 * Start Next.js in production, ensuring we listen on PORT and 0.0.0.0 for Railway etc.
 * Avoids reliance on shell expansion of ${PORT} in package.json.
 */
import { spawn } from "child_process";

const port = process.env.PORT || "3000";
const host = process.env.HOSTNAME || "0.0.0.0";

console.log(`Starting Next.js on ${host}:${port} (PORT=${process.env.PORT ?? "not set"})`);

const child = spawn(
  "npx",
  ["next", "start", "-H", host, "-p", port],
  {
    stdio: "inherit",
    env: { ...process.env, PORT: port },
    shell: false,
  }
);

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
