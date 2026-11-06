// Starts the real FastAPI backend for the browser suite on an isolated, freshly created
// SQLite database with a random per-run secret. Only the E2E database file it created
// itself is replaced; nothing else is deleted. Set E2E_DATABASE_URL to run against a
// PostgreSQL test database instead (created beforehand with `alembic upgrade head`).
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = join(root, "backend");
const runDir = resolve(process.env.E2E_DIR || join(root, "..", "test-results", "e2e-run"));
const port = process.env.E2E_API_PORT || "8010";
const appOrigin = `http://127.0.0.1:${process.env.E2E_APP_PORT || "3010"}`;
const python = process.env.E2E_PYTHON
  || [join(backend, ".venv", "Scripts", "python.exe"), join(backend, ".venv", "bin", "python")].find(existsSync)
  || "python";

let databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) {
  mkdirSync(runDir, { recursive: true });
  const dbFile = join(runDir, "bagla_e2e.db");
  for (const f of [dbFile, `${dbFile}-journal`, `${dbFile}-wal`, `${dbFile}-shm`]) rmSync(f, { force: true });
  databaseUrl = `sqlite+aiosqlite:///${dbFile.replace(/\\/g, "/")}`;
  const made = spawnSync(python, [join(backend, "scripts", "create_sqlite_schema.py"), databaseUrl], { stdio: "inherit" });
  if (made.status !== 0) process.exit(made.status ?? 1);
}

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  JWT_SECRET: randomBytes(48).toString("base64url"), // synthetic, per run, never stored
  ENVIRONMENT: "development",
  CORS_ORIGINS: appOrigin,
  AUTH_RATE_LIMIT: "1000", // many synthetic sign-ins from one IP; refused in staging/production
  // The suite serves http://127.0.0.1; WebKit (Safari) won't store Secure cookies over plain http
  // there, unlike Chromium/Firefox. Production keeps Secure (refused otherwise; see config tests).
  REFRESH_COOKIE_SECURE: "false",
  PYTHONIOENCODING: "utf-8",
};
const child = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", port],
  { cwd: backend, env, stdio: "inherit" });
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", code => process.exit(code ?? 0));
