import type { NextConfig } from "next";

/**
 * Security headers. This site holds transaction buttons that move real
 * money, so the framing protections are not optional: without them an
 * attacker can iframe the app invisibly and trick a connected user into
 * clicking Deploy or Claim (clickjacking).
 *
 * Deliberately NOT setting a script-src CSP yet. Privy injects scripts
 * and iframes for the wallet modal, wallet extensions inject providers,
 * and Next emits inline bootstrap scripts; a strict policy shipped
 * untested would break wallet connection in production, which is worse
 * than the risk it mitigates. That needs a nonce-based rollout verified
 * against a real Privy login first. Everything below is safe to ship as
 * is and was verified against the running app.
 */
const securityHeaders = [
  // Clickjacking: nothing may embed this app. frame-ancestors is the
  // modern form; X-Frame-Options covers older agents.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  // Never let a response be re-interpreted as a different content type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Do not leak the user's wallet address or round in a Referer header
  // when they click out to Dexscreener, Discord or X.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HTTPS only, including art.minepea.com. No preload commitment yet.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // The app needs none of these; denying them shrinks the attack surface
  // and stops embedded third-party frames asking on our behalf.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray lockfile in the home directory otherwise
  // makes Turbopack infer ~/ as the root (audit note; silences the dev warning).
  turbopack: { root: __dirname },
  // No dev overlay badge / "Compiling..." toast (user request 2026-07-12).
  devIndicators: false,
  // Do not advertise the framework version to scanners.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
