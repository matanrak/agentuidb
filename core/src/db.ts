import Surreal from "surrealdb";
import { surrealdbNodeEngines } from "@surrealdb/node";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const NAMESPACE = "agentuidb";
const DATABASE = "default";

let db: Surreal | null = null;
let connecting: Promise<Surreal> | null = null;

function getDataPath(): string {
  const dir = process.env.AGENTUIDB_DATA_DIR
    ?? resolve(homedir(), ".agentuidb");
  mkdirSync(dir, { recursive: true });
  return resolve(dir, "data.db");
}

export async function getDb(): Promise<Surreal> {
  if (db) return db;
  if (connecting) return connecting;

  connecting = (async () => {
    const instance = new Surreal({
      engines: surrealdbNodeEngines(),
    });
    try {
      await instance.connect(`surrealkv://${getDataPath()}`);
      await instance.use({ namespace: NAMESPACE, database: DATABASE });
    } catch (err) {
      connecting = null;
      throw err;
    }
    db = instance;
    connecting = null;
    return db;
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
