// Prisma only reads DATABASE_URL. The Supabase Vercel integration never sets
// that name — it sets POSTGRES_PRISMA_URL / POSTGRES_URL /
// POSTGRES_URL_NON_POOLING. A copied local .env also sets DATABASE_URL to
// file:./dev.db, which is read-only on Vercel and would hide the Postgres URL.

const RUNTIME_POSTGRES_VARS = [
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "DIRECT_URL",
] as const;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function isPostgresUrl(url: string): boolean {
  return /^(postgres(ql)?:\/\/|prisma:\/\/|prisma\+postgres:\/\/)/i.test(url);
}

export function isSqliteUrl(url: string): boolean {
  return url.startsWith("file:");
}

function isPooled(url: URL): boolean {
  // Supabase transaction mode is port 6543. Neon pooler hostnames contain "-pooler".
  // Session mode (Supabase port 5432) must not get pgbouncer=true.
  return url.port === "6543" || url.hostname.includes("-pooler.");
}

function needsSsl(hostname: string): boolean {
  return (
    hostname.endsWith(".supabase.co") ||
    hostname.endsWith(".supabase.com") ||
    hostname.endsWith(".neon.tech")
  );
}

// Only rewrite the URL when a required parameter is missing, so a working
// string (and its password encoding) is left untouched.
export function normalizePostgresUrl(url: string): string {
  if (!/^postgres(ql)?:\/\//i.test(url)) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  let changed = false;
  if (isPooled(parsed)) {
    if (!parsed.searchParams.has("pgbouncer")) {
      parsed.searchParams.set("pgbouncer", "true");
      changed = true;
    }
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", "1");
      changed = true;
    }
  }
  if (needsSsl(parsed.hostname) && !parsed.searchParams.has("sslmode")) {
    parsed.searchParams.set("sslmode", "require");
    changed = true;
  }
  return changed ? parsed.toString() : url;
}

function looksDirectSupabase(url: string): boolean {
  try {
    const parsed = new URL(url);
    // db.<ref>.supabase.co is IPv6-only. Vercel functions are IPv4-only, so this
    // host works on a home network and times out once deployed.
    return parsed.hostname.startsWith("db.") && parsed.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export function resolveDatabaseUrl(): string | undefined {
  const explicit = readEnv("DATABASE_URL");
  const onVercel = process.env.VERCEL === "1";

  if (onVercel && explicit && isPostgresUrl(explicit) && looksDirectSupabase(explicit)) {
    for (const name of ["POSTGRES_PRISMA_URL", "POSTGRES_URL"] as const) {
      const value = readEnv(name);
      if (value && isPostgresUrl(value)) return normalizePostgresUrl(value);
    }
    console.warn(
      "DATABASE_URL points at the direct Supabase host (db.*.supabase.co), which is IPv6-only. Vercel cannot reach it. Use the transaction pooler (port 6543) as DATABASE_URL or POSTGRES_PRISMA_URL.",
    );
  }

  if (explicit && isPostgresUrl(explicit)) return normalizePostgresUrl(explicit);

  for (const name of RUNTIME_POSTGRES_VARS) {
    const value = readEnv(name);
    if (value && isPostgresUrl(value)) return normalizePostgresUrl(value);
  }

  // file:./dev.db works on a laptop and is read-only in a Vercel function.
  // Drop it there so the caller can fall back to the seeded preview file
  // and report that writes are unavailable.
  if (explicit && !(onVercel && isSqliteUrl(explicit))) return explicit;
  return undefined;
}

export function usesReadOnlySqlite(url = process.env.DATABASE_URL ?? ""): boolean {
  return process.env.VERCEL === "1" && isSqliteUrl(url);
}
