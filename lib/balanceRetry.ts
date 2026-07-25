/**
 * Backoff schedule for the wallet-balance read.
 *
 * A failed balance read used to be terminal: nothing re-triggered it except
 * completing a transaction, and the CTA that starts a transaction is disabled
 * until the balance is known, so one blocked read locked the account screen
 * for good. The read now retries on this schedule until it succeeds.
 *
 * Doubling from 2s and capping at 30s: quick enough that a transient
 * challenge clears within seconds, slow enough at the cap that a user whose
 * network genuinely cannot reach any RPC host costs two requests a minute,
 * indefinitely, which is negligible.
 */
export function balanceRetryDelayMs(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.min(Math.max(attempt, 0), 8));
}
