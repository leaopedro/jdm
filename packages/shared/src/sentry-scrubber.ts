// ---------------------------------------------------------------------------
// Sentry PII scrubber — strips sensitive data from Sentry events before
// they leave the client.  Zero runtime deps; no Sentry SDK import needed.
// ---------------------------------------------------------------------------

/* ---- Minimal Sentry-compatible types ----------------------------------- */

export interface SentryEvent {
  request?: {
    headers?: Record<string, string>;
    cookies?: Record<string, string> | string;
    data?: unknown;
    query_string?: string;
  };
  user?: {
    email?: string;
    [key: string]: unknown;
  };
  breadcrumbs?: Array<{
    message?: string;
    data?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

/* ---- Constants --------------------------------------------------------- */

const SAFE_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'content-length',
  'content-type',
  'host',
  'origin',
  'referer',
  'user-agent',
  'x-request-id',
]);

const MAX_BREADCRUMB_LENGTH = 200;

/* ---- Helpers ----------------------------------------------------------- */

/**
 * FNV-1a 32-bit hash. Returns hex string padded to 8 chars.
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5; // offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply by FNV prime 0x01000193.
    // Math.imul keeps us in 32-bit integer space.
    hash = Math.imul(hash, 0x01000193);
  }
  // Coerce to unsigned 32-bit, then hex-pad.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Hash an email into a non-reversible, stable token.
 * Output: `redacted-<8-hex-chars>`
 */
export function hashEmail(email: string): string {
  return `redacted-${fnv1a(email.trim().toLowerCase())}`;
}

/* ---- Scrub helpers ----------------------------------------------------- */

function scrubHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(headers)) {
    if (SAFE_HEADERS.has(key.toLowerCase())) {
      out[key] = headers[key]!;
    }
  }
  return out;
}

function scrubBreadcrumbs(
  breadcrumbs: NonNullable<SentryEvent['breadcrumbs']>,
): NonNullable<SentryEvent['breadcrumbs']> {
  return breadcrumbs.map((bc) => {
    const clean = { ...bc };

    if (typeof clean.message === 'string' && clean.message.length > MAX_BREADCRUMB_LENGTH) {
      clean.message = clean.message.slice(0, MAX_BREADCRUMB_LENGTH) + '…[truncated]';
    }

    delete clean.data;
    return clean;
  });
}

/* ---- Main export ------------------------------------------------------- */

/**
 * Deep-scrub a Sentry event of PII. Returns a new object; the original is
 * never mutated.
 */
export function scrubSentryEvent<T extends SentryEvent>(event: T): T {
  // Structural clone to avoid mutating the caller's object.
  const e = JSON.parse(JSON.stringify(event)) as T;

  // -- request -----------------------------------------------------------
  if (e.request) {
    delete e.request.cookies;
    delete e.request.data;
    delete e.request.query_string;

    if (e.request.headers) {
      e.request.headers = scrubHeaders(e.request.headers);
    }
  }

  // -- user --------------------------------------------------------------
  if (e.user?.email) {
    e.user.email = hashEmail(e.user.email);
  }

  // -- breadcrumbs -------------------------------------------------------
  if (e.breadcrumbs) {
    e.breadcrumbs = scrubBreadcrumbs(e.breadcrumbs);
  }

  return e;
}
