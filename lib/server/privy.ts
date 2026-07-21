/**
 * Shared, memoized Privy server client.
 *
 * The API routes previously did `new PrivyClient(...)` on every request,
 * which throws away the JWKS verification-key cache each time — so every
 * call, including a flood of garbage tokens, re-fetched keys and hit
 * Privy's servers. A serverless instance stays warm across many requests,
 * so caching the client per instance is a real reduction in work and
 * cost. Constructed lazily (the env vars are absent at module load in
 * builds without the wallet), after the caller has checked they exist.
 */
import { PrivyClient } from "@privy-io/server-auth";

let client: PrivyClient | null = null;

export function getPrivyClient(appId: string, appSecret: string): PrivyClient {
  if (!client) client = new PrivyClient(appId, appSecret);
  return client;
}
