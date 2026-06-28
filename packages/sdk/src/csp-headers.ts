/**
 * csp-headers.ts — Content Security Policy headers for qti-launch-site
 *
 * Add these headers via vercel.json or next.config.ts headers().
 * Blocks inline scripts, restricts connect-src to trusted RPC origins only.
 *
 * RP-DEASI-JUP-2026-0619-001
 */

export const ALLOWED_RPC_ORIGINS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.g.alchemy.com",
  "https://rpc.ankr.com",
];

export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",                         // no inline scripts
  "style-src 'self' 'unsafe-inline'",          // allow CSS-in-JS frameworks
  `connect-src 'self' ${ALLOWED_RPC_ORIGINS.join(" ")} https://quote-api.jup.ag https://price.jup.ag https://birdeye-proxy.jup.ag`,
  "img-src 'self' data: https: blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "frame-ancestors 'none'",                    // clickjacking prevention
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * getSecurityHeaders: Returns a headers array compatible with
 * vercel.json `headers` config or Next.js `headers()` function.
 */
export function getSecurityHeaders(): Array<{ key: string; value: string }> {
  return [
    { key: "Content-Security-Policy",        value: CSP_DIRECTIVES },
    { key: "X-Frame-Options",                value: "DENY" },
    { key: "X-Content-Type-Options",         value: "nosniff" },
    { key: "Referrer-Policy",                value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy",             value: "camera=(), microphone=(), geolocation=()" },
    { key: "Strict-Transport-Security",      value: "max-age=63072000; includeSubDomains; preload" },
    { key: "Cross-Origin-Opener-Policy",     value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy",   value: "same-origin" },
  ];
}
