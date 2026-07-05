/**
 * Environment access with fail-loud semantics.
 *
 * A missing required secret must raise a clear error at the point of use, not
 * surface as a silent `undefined` that fails deep inside an API call. Reads
 * `process.env` lazily so the frontend (which never needs the Moralis key or a
 * writable DB) is not forced to have ingestion secrets set.
 */

export class MissingEnvError extends Error {
  constructor(key: string, hint: string) {
    super(`Missing required environment variable ${key}. ${hint}`);
    this.name = "MissingEnvError";
  }
}

export function requireEnv(key: string, hint: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new MissingEnvError(key, hint);
  }
  return value;
}

/** Moralis API key - needed only by ingestion scripts, not the web app. */
export function moralisApiKey(): string {
  return requireEnv(
    "MORALIS_API_KEY",
    "Get one at https://admin.moralis.com/web3apis (free tier).",
  );
}

/** Neon Postgres connection string. */
export function databaseUrl(): string {
  return requireEnv(
    "DATABASE_URL",
    "Set your Neon connection string (see .env.example).",
  );
}
