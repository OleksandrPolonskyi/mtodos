import "server-only";

const defaultSecretPath = "moddyland-canvas-7f3k2p";

// Temporary fallback for environments where Vercel runtime env vars are unavailable.
const fallbackDatabaseUrl =
  "postgresql://postgres.hjgmdhuccmudonquutmp:GMRRXXwdzdyY8xGGtIatAa1!@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.toLowerCase().trim();

  return normalized === "true" || normalized === "1" || normalized === "yes";
};

export const serverEnv = {
  databaseUrl:
    process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? fallbackDatabaseUrl,
  databaseSsl: parseBoolean(process.env.DATABASE_SSL, true),
  appSecretPath: process.env.APP_SECRET_PATH ?? defaultSecretPath,
  appTimezone: process.env.APP_TIMEZONE ?? "Europe/Kyiv",
  jobsSecret: process.env.JOBS_SECRET ?? process.env.CRON_SECRET ?? ""
};

export const assertDatabaseEnv = (): void => {
  if (!serverEnv.databaseUrl) {
    throw new Error("DATABASE_URL (or SUPABASE_DB_URL) is required");
  }
};
