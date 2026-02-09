import Surreal from "surrealdb";

let instance: Surreal | null = null;
let connectingPromise: Promise<Surreal> | null = null;

export interface SurrealConnectOpts {
  url: string;
  namespace: string;
  database: string;
  username: string;
  password: string;
}

export async function connectSurreal(opts: SurrealConnectOpts): Promise<Surreal> {
  if (connectingPromise) {
    return connectingPromise;
  }

  const doConnect = async (): Promise<Surreal> => {
    if (instance) {
      await instance.close().catch(() => {});
      instance = null;
    }

    const db = new Surreal();
    await db.connect(opts.url);
    await db.signin({ username: opts.username, password: opts.password });
    await db.use({ namespace: opts.namespace, database: opts.database });
    instance = db;
    return db;
  };

  connectingPromise = doConnect().finally(() => {
    connectingPromise = null;
  });

  return connectingPromise;
}

export function getSurreal(): Surreal | null {
  return instance;
}

export async function closeSurreal(): Promise<void> {
  if (instance) {
    await instance.close().catch(() => {});
    instance = null;
  }
}
