/**
 * Wire → view-model mapping for the Stockpot (Convention 2). The precision
 * ladder lives HERE, one precision per data class, so no component ever
 * chooses digits ad hoc:
 *
 * - STAT CARD USD (pot total, deployed, paid out): fmtUsdCard — whole
 *   dollars to $99,999 (bank statement, not pitch deck), 4-sig compact
 *   above; never more than 7 characters, the phone-card width contract
 *   (cents on a lifetime flow are table detail, not card detail)
 * - secondary USD (cost, pending): fmtUsd (2dp)
 * - per-share prices: fmtUsd (2dp)
 * - shares: fmtToken (4dp, trimmed); pending shares use fmtTokenSmart so
 *   a genuinely tiny early-session slice never renders as "0"
 *
 * Every null stays null and formats as the dash placeholder: a loading or
 * paused feed must never print a confident zero.
 */

import {
  fmtToken,
  fmtTokenSmart,
  fmtUsd,
  fmtUsdCard,
  fromWei,
} from "@/lib/format";
import { ASSET_BY_TOKEN, STOCKPOT_ASSETS } from "@/lib/stockpot/registry";
import {
  avgCostPerShare,
  buyCostUsd,
  paidOutSharesByToken,
  pendingEthUsdValue,
  pendingPotUsd,
  pendingSharesByToken,
  positionsFromFlows,
  potTotalUsd,
  price8ToUsd,
} from "@/lib/stockpot/math";
import type {
  StockpotPayoutEventVM,
  StockpotPayoutVM,
  StockpotPendingWire,
  StockpotPurchaseVM,
  StockpotStockVM,
  StockpotVM,
  StockpotWire,
} from "@/lib/stockpot/types";

const DASH = "—";

/** Payout legs within this window belong to the same peapot hit. */
export const PAYOUT_EVENT_WINDOW_MS = 10 * 60_000;

export function toStockpotVM(
  wire: StockpotWire,
  pendingCtx?: { pending: StockpotPendingWire; ethUsd: number },
): StockpotVM {
  const positions = positionsFromFlows(wire.purchases, wire.payouts);

  // Allowlist law: prices for unknown tokens are dropped; a paused feed
  // reads as "no price" (corporate action in progress); and a NON-POSITIVE
  // answer is a failed or broken feed, equally unknown — a zero price
  // passing as real painted value $0.00 and a fake total-loss P&L while
  // understating the headline (audit 2026-07-28, found three times over).
  const priceByToken = new Map<string, number | null>();
  for (const p of wire.snapshot.prices) {
    const key = p.token.toLowerCase();
    if (!ASSET_BY_TOKEN.has(key)) continue;
    const price = price8ToUsd(p.priceUsd8);
    priceByToken.set(key, p.paused || price <= 0 ? null : price);
  }

  const totalUsd = potTotalUsd(positions, priceByToken);

  // THE POT headline prefers the backend's live pending state when fresh:
  // held stocks awaiting the sweep plus ETH accruing toward the next buy
  // (the number that breathes intraday). Stale or absent pending falls
  // back to the flow-derived value.
  const pendingFresh = pendingCtx !== undefined && !pendingCtx.pending.stale;
  const potUsd = pendingFresh
    ? pendingPotUsd(pendingCtx.pending, priceByToken, pendingCtx.ethUsd)
    : totalUsd;
  const marketOpen = pendingFresh ? pendingCtx.pending.marketOpen : null;

  // Per-stock pending, the user's formula (2026-07-28): the ETH sitting in
  // the pot splits EVENLY across the registry stocks (the buy batches take
  // each equally), and each slice converts to shares at the live feed
  // price; anything the pot already holds awaiting its sweep counts on
  // top. All figures need the fresh feed: without it pending is unknown,
  // never zero.
  const heldByToken = pendingFresh
    ? pendingSharesByToken(pendingCtx.pending)
    : null;
  const ethAllUsd = pendingFresh
    ? pendingEthUsdValue(pendingCtx.pending, pendingCtx.ethUsd)
    : null;
  const ethSliceUsd =
    ethAllUsd === null ? null : ethAllUsd / STOCKPOT_ASSETS.length;
  const paidByToken = paidOutSharesByToken(wire.payouts);

  const stocks: StockpotStockVM[] = STOCKPOT_ASSETS.map((asset) => {
    const key = asset.token.toLowerCase();
    const pos = positions.get(key) ?? {
      shares: 0,
      costUsd: 0,
      buyCount: 0,
      unpricedBuys: 0,
    };
    const priceUsd = priceByToken.get(key) ?? null;
    const paused =
      wire.snapshot.prices.find((p) => p.token.toLowerCase() === key)
        ?.paused ?? false;
    // One unpriced buy poisons the fold's cost story, so the chart's avg
    // reference dashes rather than dilutes (the all-or-nothing law).
    const avg = pos.unpricedBuys === 0 ? avgCostPerShare(pos) : null;

    const held = heldByToken?.get(key) ?? 0;
    // The held component needs the stock's price only when something is
    // actually held; the ETH slice's USD value never does.
    const heldUsd = held > 0 ? (priceUsd !== null ? held * priceUsd : null) : 0;
    const pendingUsd =
      heldUsd !== null && ethSliceUsd !== null ? heldUsd + ethSliceUsd : null;
    const pendingShares =
      pendingUsd !== null && priceUsd !== null
        ? held + ethSliceUsd! / priceUsd
        : null;

    const paidOutShares = paidByToken.get(key) ?? 0;
    const paidOutUsd =
      paidOutShares === 0
        ? 0
        : priceUsd !== null
          ? paidOutShares * priceUsd
          : null;

    return {
      ticker: asset.ticker,
      name: asset.name,
      token: asset.token,
      chartable: asset.chartable,
      icon: asset.icon,
      priceUsd,
      priceFormatted: priceUsd === null ? DASH : fmtUsd(priceUsd),
      paused,
      avgCostPerShare: avg,
      pendingUsd,
      pendingUsdFormatted: pendingUsd === null ? DASH : fmtUsd(pendingUsd),
      pendingShares,
      pendingSharesFormatted:
        pendingShares === null ? DASH : fmtTokenSmart(pendingShares, 4),
      paidOutShares,
      paidOutSharesFormatted: fmtToken(paidOutShares, 4),
      paidOutUsd,
      paidOutUsdFormatted: paidOutUsd === null ? DASH : fmtUsd(paidOutUsd),
    };
    // Every registry asset stays visible: the pot drains on every peapot
    // hit, so a small or zero row is the honest state between hits, not an
    // absence (user 2026-07-28: "there is a total of 5").
  }).sort((a, b) => (b.paidOutUsd ?? -1) - (a.paidOutUsd ?? -1));

  const purchases: StockpotPurchaseVM[] = wire.purchases
    .filter((p) => ASSET_BY_TOKEN.has(p.token.toLowerCase()))
    .map((p) => {
      const shares = fromWei(p.sharesWei);
      const priceAtBuy = price8ToUsd(p.dayCloseUsd8);
      const costUsd = buyCostUsd(p);
      return {
        ...p,
        ticker: ASSET_BY_TOKEN.get(p.token.toLowerCase())!.ticker,
        shares,
        sharesFormatted: fmtToken(shares, 4),
        costUsd,
        costUsdFormatted: priceAtBuy > 0 ? fmtUsd(costUsd) : DASH,
        priceAtBuy,
        priceAtBuyFormatted: priceAtBuy > 0 ? fmtUsd(priceAtBuy) : DASH,
      };
    });

  const payouts: StockpotPayoutVM[] = wire.payouts
    .filter((p) => ASSET_BY_TOKEN.has(p.token.toLowerCase()))
    .map((p) => ({
      ...p,
      ticker: ASSET_BY_TOKEN.get(p.token.toLowerCase())!.ticker,
      shares: fromWei(p.sharesWei),
      sharesFormatted: fmtToken(fromWei(p.sharesWei), 4),
    }));

  // All-or-nothing, same as the headline: one unpriced buy makes the
  // lifetime figure a dash, never a silent understatement.
  const deployedUsd = purchases.some((p) => p.priceAtBuy <= 0)
    ? null
    : purchases.reduce((a, p) => a + p.costUsd, 0);
  const paidOutUsd = payouts.reduce<number | null>((acc, p) => {
    if (acc === null) return null;
    const price = priceByToken.get(p.token.toLowerCase());
    return price == null ? null : acc + p.shares * price;
  }, 0);

  // Payout EVENTS: one row per peapot HIT. The disperser sends each stock
  // in its OWN transaction seconds apart (verified live), so legs cluster
  // by time: a leg joins the current event while it sits within the window
  // of the previous leg. Legs arrive newest-first; events come out newest
  // first too.
  const eventLegs: StockpotPayoutVM[][] = [];
  for (const p of payouts) {
    const current = eventLegs[eventLegs.length - 1];
    if (
      current &&
      current[current.length - 1].atMs - p.atMs <= PAYOUT_EVENT_WINDOW_MS
    ) {
      current.push(p);
    } else {
      eventLegs.push([p]);
    }
  }
  const payoutEvents: StockpotPayoutEventVM[] = eventLegs.map((legs) => {
    const perTicker = new Map<string, number>();
    for (const l of legs)
      perTicker.set(l.ticker, (perTicker.get(l.ticker) ?? 0) + l.shares);
    const stocks = [...perTicker.entries()]
      .map(([ticker, shares]) => ({
        ticker,
        shares,
        sharesFormatted: fmtToken(shares, 4),
      }))
      .sort((a, b) => b.shares - a.shares);
    const valueUsd = legs.reduce<number | null>((acc, l) => {
      if (acc === null) return null;
      const price = priceByToken.get(l.token.toLowerCase());
      return price == null ? null : acc + l.shares * price;
    }, 0);
    return {
      txHash: legs[0].txHash,
      txCount: new Set(legs.map((l) => l.txHash)).size,
      atMs: legs[0].atMs,
      recipients: new Set(legs.map((l) => l.winner.toLowerCase())).size,
      stocks,
      valueUsd,
      valueUsdFormatted: valueUsd === null ? DASH : fmtUsd(valueUsd),
    };
  });

  return {
    asOfMs: wire.snapshot.asOfMs,
    totalUsd: potUsd,
    totalUsdFormatted: potUsd === null ? DASH : fmtUsdCard(potUsd),
    marketOpen,
    deployedUsd,
    deployedUsdFormatted: deployedUsd === null ? DASH : fmtUsdCard(deployedUsd),
    paidOutUsd,
    paidOutUsdFormatted: paidOutUsd === null ? DASH : fmtUsdCard(paidOutUsd),
    buyCount: purchases.length,
    stocks,
    purchases,
    payouts,
    payoutEvents,
  };
}
