import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixtureDir = await mkdtemp(join(tmpdir(), "infinite-x-api-fixtures-"));
const port = 4329;
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), IX_DATA_DIR: fixtureDir },
  stdio: ["ignore", "pipe", "pipe"]
});
let serverOutput = "";
server.stdout.on("data", chunk => { serverOutput += chunk; });
server.stderr.on("data", chunk => { serverOutput += chunk; });

const waitForServer = async () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Isolated verification server did not start. ${serverOutput.trim()}`);
};

const run = command => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [command], {
    cwd: root,
    env: { ...process.env, IX_URL: `http://127.0.0.1:${port}` },
    stdio: "inherit"
  });
  child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Verification exited with ${code}`)));
});

try {
  await waitForServer();
  await run("scripts/verify-api.mjs");
  console.log(`Isolated API verification passed; fixtures used ${fixtureDir}.`);
} finally {
  server.kill();
  await new Promise(resolve => server.once("exit", resolve));
  await rm(fixtureDir, { recursive: true, force: true });
}
