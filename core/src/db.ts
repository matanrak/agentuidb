import Surreal from "surrealdb";
import { homedir } from "node:os";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface Settings {
  url?: string | null;
  user?: string;
  pass?: string;
  namespace?: string;
  database?: string;
  dataDir?: string;
}

function getSettingsDir(): string {
  return resolve(homedir(), ".agentuidb");
}

function loadSettings(): Settings {
  try {
    const raw = readFileSync(resolve(getSettingsDir(), "settings.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getConfig() {
  const settings = loadSettings();
  return {
    url: process.env.AGENTUIDB_URL ?? settings.url ?? null,
    user: process.env.AGENTUIDB_USER ?? settings.user ?? "root",
    pass: process.env.AGENTUIDB_PASS ?? settings.pass ?? "root",
    namespace: process.env.AGENTUIDB_NS ?? settings.namespace ?? "agentuidb",
    database: process.env.AGENTUIDB_DB ?? settings.database ?? "default",
    dataDir: process.env.AGENTUIDB_DATA_DIR ?? settings.dataDir ?? getSettingsDir(),
  };
}

let db: Surreal | null = null;
let connecting: Promise<Surreal> | null = null;

async function connectEmbedded(cfg: ReturnType<typeof getConfig>): Promise<Surreal> {
  const { surrealdbNodeEngines } = await import("@surrealdb/node");
  mkdirSync(cfg.dataDir, { recursive: true });
  const dataPath = resolve(cfg.dataDir, "data.db");
  const instance = new Surreal({ engines: surrealdbNodeEngines() });
  await instance.connect(`surrealkv://${dataPath}`);
  await instance.use({ namespace: cfg.namespace, database: cfg.database });
  return instance;
}

async function connectHttp(cfg: ReturnType<typeof getConfig>): Promise<Surreal> {
  const instance = new Surreal();
  await instance.connect(`${cfg.url}/rpc`);
  await instance.use({ namespace: cfg.namespace, database: cfg.database });
  await instance.signin({ username: cfg.user, password: cfg.pass });
  return instance;
}

export async function getDb(): Promise<Surreal> {
  if (db) return db;
  if (connecting) return connecting;

  connecting = (async () => {
    const cfg = getConfig();
    try {
      const instance = cfg.url ? await connectHttp(cfg) : await connectEmbedded(cfg);
      db = instance;
      return db;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

export async function closeDb(): Promise<void> {
  connecting = null;
  if (db) {
    await db.close();
    db = null;
  }
}
