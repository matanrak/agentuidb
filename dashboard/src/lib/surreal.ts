import Surreal from "surrealdb";

let instance: Surreal | null = null;

// Use window to bridge module copies (Turbopack may duplicate modules)
const getGlobal = (): Surreal | null => {
  if (typeof window !== "undefined" && (window as any).__surrealInstance) {
    return (window as any).__surrealInstance;
  }
  return instance;
};
const setGlobal = (db: Surreal | null) => {
  instance = db;
  if (typeof window !== "undefined") {
    (window as any).__surrealInstance = db;
  }
};

export interface SurrealConnectOpts {
  url: string;
  namespace: string;
  database: string;
  username: string;
  password: string;
}

export async function connectSurreal(opts: SurrealConnectOpts): Promise<Surreal> {
  const existing = getGlobal();
  if (existing) {
    await existing.close().catch(() => {});
    setGlobal(null);
  }

  const db = new Surreal();
  await db.connect(opts.url, {
    auth: { username: opts.username, password: opts.password },
    namespace: opts.namespace,
    database: opts.database,
  });
  setGlobal(db);
  return db;
}

export function getSurreal(): Surreal | null {
  return getGlobal();
}

export async function closeSurreal(): Promise<void> {
  const db = getGlobal();
  if (db) {
    await db.close().catch(() => {});
    setGlobal(null);
  }
}
