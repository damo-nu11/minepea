/**
 * AutoMiner deposit math — a BigInt replica of the contract's own
 * derivation, CONFIRMED against the Solidity source
 * (hardhat/contracts/AutoMiner.sol, `_calculateAmountPerBlock` +
 * `_calculateFee`, read 2026-07-16):
 *
 *   totalBlocks = numBlocks × numRounds
 *   // percentage path
 *   amountPerBlock = msg.value × 10000 / (totalBlocks × (10000 + feeBps))
 *   pctFeePerRound = amountPerBlock × numBlocks × feeBps / 10000
 *   // hybrid: the flat fee overrides when it exceeds the pct fee
 *   if (pctFeePerRound < flatFee)
 *     amountPerBlock = (msg.value − flatFee × numRounds) / totalBlocks
 *
 * The UI works the other way round: the user picks amount-per-tile, we
 * solve for the msg.value to send. Integer division makes a closed-form
 * inverse off-by-a-hair, so `depositFor` computes the candidate under both
 * branches and then verifies by running the contract's forward derivation,
 * bumping the deposit until derived amountPerBlock ≥ desired. Guarantees:
 * no InsufficientDeposit revert, and the effective per-tile amount is never
 * silently below what the UI displayed.
 */

const BPS = 10_000n;

/** The contract's forward derivation: deposit → amountPerBlock. */
export function derivedAmountPerBlock(
  deposit: bigint,
  numBlocks: bigint,
  numRounds: bigint,
  feeBps: bigint,
  flatFee: bigint,
): bigint {
  const totalBlocks = numBlocks * numRounds;
  if (totalBlocks === 0n) return 0n;
  let amountPerBlock = (deposit * BPS) / (totalBlocks * (BPS + feeBps));
  const pctFee = (amountPerBlock * numBlocks * feeBps) / BPS;
  if (pctFee < flatFee) {
    const totalFlatFees = flatFee * numRounds;
    if (deposit <= totalFlatFees) return 0n; // contract: InsufficientDeposit
    amountPerBlock = (deposit - totalFlatFees) / totalBlocks;
  }
  return amountPerBlock;
}

/** The contract's per-round fee for a given deploy size (hybrid max). */
export function feePerRound(
  amountPerBlock: bigint,
  numBlocks: bigint,
  feeBps: bigint,
  flatFee: bigint,
): bigint {
  const pctFee = (amountPerBlock * numBlocks * feeBps) / BPS;
  return pctFee > flatFee ? pctFee : flatFee;
}

export interface AutoMinerDeposit {
  /** msg.value for setConfig. */
  deposit: bigint;
  /** amountPerBlock the contract will derive from that deposit (≥ desired). */
  effectiveAmountPerBlock: bigint;
  /** Per-round executor fee at that size (hybrid pct/flat). */
  feePerRound: bigint;
  /** Per-round total cost: deploy + fee. */
  costPerRound: bigint;
}

/**
 * Solve for the setConfig msg.value that yields at least
 * `amountPerBlockWei` per tile per round.
 */
export function depositFor(
  amountPerBlockWei: bigint,
  numBlocks: number,
  numRounds: number,
  executorFeeBps: bigint,
  executorFlatFee: bigint,
): AutoMinerDeposit {
  const blocks = BigInt(numBlocks);
  const rounds = BigInt(numRounds);
  const totalBlocks = blocks * rounds;

  // Candidate under each branch of the hybrid fee; the real branch is
  // decided by the contract from the DERIVED amountPerBlock, so compute
  // both and take the larger candidate (the safe one), then verify.
  const pctCandidate =
    (amountPerBlockWei * totalBlocks * (BPS + executorFeeBps) + BPS - 1n) /
    BPS;
  const flatCandidate =
    amountPerBlockWei * totalBlocks + executorFlatFee * rounds;
  let deposit = pctCandidate > flatCandidate ? pctCandidate : flatCandidate;

  // Forward-verify against the contract's own math; integer truncation can
  // land one wei short, so bump until derived ≥ desired (bounded walk —
  // each step is worth at most totalBlocks wei of derived amount).
  let derived = derivedAmountPerBlock(
    deposit,
    blocks,
    rounds,
    executorFeeBps,
    executorFlatFee,
  );
  while (derived < amountPerBlockWei) {
    deposit += (amountPerBlockWei - derived) * totalBlocks + 1n;
    derived = derivedAmountPerBlock(
      deposit,
      blocks,
      rounds,
      executorFeeBps,
      executorFlatFee,
    );
  }

  const fee = feePerRound(derived, blocks, executorFeeBps, executorFlatFee);
  return {
    deposit,
    effectiveAmountPerBlock: derived,
    feePerRound: fee,
    costPerRound: derived * blocks + fee,
  };
}
