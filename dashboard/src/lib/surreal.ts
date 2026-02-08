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
  await instance.connect(opts.url);
  await instance.signin({ username: opts.username, password: opts.password });
  await instance.use({ namespace: opts.namespace, database: opts.database });
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
