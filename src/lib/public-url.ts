// Magic links and post-login redirects must use a host the browser can reach.
// APP_URL in .env.example is http://localhost:3001. Copied into Vercel, that
// value sends every sign-in link to the owner's laptop.

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i;

export function isLoopbackUrl(value: string): boolean {
  try {
    return LOOPBACK_HOST.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function configuredPublicAppUrl(): string | null {
  const raw = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (!raw || isLoopbackUrl(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return raw;
}

function forwardedOrigin(req: Request): string | null {
  // Only trust forwarded headers on Vercel, which overwrites them.
  if (process.env.VERCEL !== "1") return null;
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host || !/^[A-Za-z0-9.:-]+$/.test(host)) return null;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (proto !== "http" && proto !== "https") return null;
  return `${proto}://${host}`;
}

function hostWithScheme(host: string | undefined): string | null {
  const trimmed = host?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!trimmed || !/^[A-Za-z0-9.:-]+$/.test(trimmed)) return null;
  return `https://${trimmed}`;
}

function productionOrigin(): string | null {
  if (process.env.VERCEL_ENV !== "production") return null;
  return hostWithScheme(process.env.VERCEL_PROJECT_PRODUCTION_URL);
}

// Host the browser actually called, never an internal localhost the function sees.
export function requestPublicOrigin(req: Request): string {
  const forwarded = forwardedOrigin(req);
  if (forwarded && !isLoopbackUrl(forwarded)) return forwarded;

  const origin = new URL(req.url).origin;
  if (!isLoopbackUrl(origin)) return origin;

  const deployment = hostWithScheme(process.env.VERCEL_URL);
  if (deployment) return deployment;

  return productionOrigin() ?? configuredPublicAppUrl() ?? origin;
}

// URL written into the sign-in email.
export function magicLinkBase(req: Request): string {
  // Preview deployments have their own database branch. A link to APP_URL
  // (production) would look up the token in the wrong database.
  if (process.env.VERCEL_ENV === "preview") return requestPublicOrigin(req);
  // A stable public origin beats a per-deployment hostname in the email.
  // The redirect after the click still stays on whatever host opened the link.
  return configuredPublicAppUrl() ?? productionOrigin() ?? requestPublicOrigin(req);
}

// Redirects must stay on the host that received the request, or the session
// cookie is set for a different site than the one the browser lands on.
export function redirectBase(req: Request): string {
  return requestPublicOrigin(req);
}
