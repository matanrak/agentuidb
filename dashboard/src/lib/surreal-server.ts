import Surreal from "surrealdb";

let instance: Surreal | null = null;
let connecting: Promise<Surreal> | null = null;

function getConfig() {
  return {
    url: process.env.SURREALDB_URL ?? "http://127.0.0.1:8000",
    username: process.env.SURREALDB_USER ?? "root",
    password: process.env.SURREALDB_PASS ?? "root",
    namespace: process.env.SURREALDB_NS ?? "agentuidb",
    database: process.env.SURREALDB_DB ?? "default",
  };
}

export async function getServerSurreal(): Promise<Surreal> {
  if (instance) return instance;
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      const cfg = getConfig();
      const db = new Surreal();
      await db.connect(`${cfg.url}/rpc`);
      await db.use({ namespace: cfg.namespace, database: cfg.database });
      await db.signin({ username: cfg.username, password: cfg.password });
      instance = db;
      return db;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

export function resetServerSurreal() {
  if (instance) {
    instance.close().catch(() => {});
    instance = null;
  }
  connecting = null;
}
