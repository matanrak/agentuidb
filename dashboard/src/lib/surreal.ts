import Surreal from "surrealdb";

let instance: Surreal | null = null;

export interface SurrealConnectOpts {
  url: string;
  namespace: string;
  database: string;
  username: string;
  password: string;
}

export async function connectSurreal(opts: SurrealConnectOpts): Promise<Surreal> {
  if (instance) {
    await instance.close().catch(() => {});
    instance = null;
  }

  instance = new Surreal();
  await instance.connect(opts.url, {
    auth: { username: opts.username, password: opts.password },
    namespace: opts.namespace,
    database: opts.database,
  });
  return instance;
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
