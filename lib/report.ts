/**
 * Error reporting seam.
 *
 * The app previously had two console.error calls and 35 catch blocks that
 * bound nothing, on a product that moves real money. That made a reverted
 * deploy or a misconfigured backend completely invisible in production:
 * the first signal would have been a user in Discord.
 *
 * This is deliberately dependency-free so it can ship today. When a
 * vendor (Sentry et al) is added, wire it HERE and every call site is
 * already instrumented.
 */
export function report(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  // Structured so it is greppable in Vercel logs and readable in a browser
  // console. Never throws: reporting must not break the path it observes.
  try {
    const detail =
      err instanceof Error
        ? { name: err.name, message: err.message }
        : { value: String(err) };
    console.error(`[pea:${scope}]`, { ...detail, ...context });
  } catch {
    // Nothing sensible left to do.
  }
}
