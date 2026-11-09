import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const children = [
  spawn(process.execPath, ["dev-server.js"], {
    cwd: path.join(projectDirectory, "Front-end"),
    env: process.env,
    stdio: "inherit",
  }),
  spawn(process.execPath, ["--watch", "server.js"], {
    cwd: path.join(projectDirectory, "backend"),
    env: process.env,
    stdio: "inherit",
  }),
];

let isShuttingDown = false;

function stopChildren(exitCode, signal = "SIGTERM") {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }
}

for (const child of children) {
  child.on("error", (error) => {
    console.error("Could not start a development server:", error);
    stopChildren(1);
  });
  child.on("exit", (code) => {
    if (!isShuttingDown) {
      stopChildren(code === 0 ? 1 : code ?? 1);
    }
  });
}

process.on("SIGINT", () => stopChildren(0, "SIGINT"));
process.on("SIGTERM", () => stopChildren(0));
