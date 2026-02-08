import Surreal from "surrealdb";

const NAMESPACE = "agentuidb";
const DATABASE = "default";

let db: Surreal | null = null;

export async function getDb(): Promise<Surreal> {
  if (db) return db;

  const url = process.env.AGENTUIDB_URL;
  if (!url) {
    throw new Error(
      "AGENTUIDB_URL environment variable is required (e.g. http://127.0.0.1:8000)"
    );
  }

  // Pre-release TODO: remove root defaults, require explicit credentials.
  const username = process.env.AGENTUIDB_USER ?? "root";
  const password = process.env.AGENTUIDB_PASS ?? "root";

  db = new Surreal();
  await db.connect(url);
  await db.signin({ username, password });
  await db.use({ namespace: NAMESPACE, database: DATABASE });
  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
