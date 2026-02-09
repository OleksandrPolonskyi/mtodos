import postgres, { type Sql } from "postgres";
import { assertDatabaseEnv, serverEnv } from "@/lib/env.server";

let sqlClient: Sql | null = null;

export const getSql = (): Sql => {
  assertDatabaseEnv();

  if (!sqlClient) {
    sqlClient = postgres(serverEnv.databaseUrl, {
      ssl: serverEnv.databaseSsl ? "require" : false,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 30
    });
  }

  return sqlClient;
};
