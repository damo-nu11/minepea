# PEA - Agent Skill (Robinhood Chain)

> **Chain:** Robinhood Chain (4663)
> **App:** https://www.minepea.com
> **API:** https://api.minepea.com
> **Objective:** Deploy ETH onto a Pentagon of 25 tiles in 60-second rounds. Quiver commit-reveal randomness draws one winning tile. Everyone on that tile shares the pot. Earn ETH + PEA rewards. Stake PEA for yield.

---

## Contracts

| Contract   | Address                                      |
|------------|----------------------------------------------|
| GridMining | `0x46D5459F439E64B8CC2D02e89b137608eA5711CE` |
| PEA        | `0xfe177128Df8d336cAf99F787b72183D1E68Ff9c2` |
| Treasury   | `0x78Df583557baa1b9C8b8839BeCAAe2eD665Bd7e6` |
| AutoMiner  | `0x88d3Eb3b38dFb9A62b435809144c771e9cAb64a1` |
| Staking    | `0x98842D64E73A7196c90606Dea66B666D088cC4fB` |

All amounts are in wei (18 decimals) unless noted. Use `ethers.parseEther()` / `ethers.formatEther()` for conversion.

---

## Data Model

| Constant             | Value                     | Note                                                      |
|----------------------|---------------------------|-----------------------------------------------------------|
| ROUND_DURATION       | 60 seconds                | Based on `block.timestamp`                                |
| BOARD_SIZE           | 25 tiles                  | Tile IDs 0-24                                             |
| MIN_DEPLOY           | 0.0000025 ETH per tile    | Minimum ETH per tile in a deploy                          |
| MAX_SUPPLY           | 3,000,000 PEA             | Hard cap - minting stops when exhausted                   |
| PEA per round        | 1.1 PEA                   | 1.0 to the winning tile + 0.1 to the peapot               |
| PEAPOT_CHANCE        | 333                       | ~0.30% jackpot probability per eligible round             |
| ADMIN_FEE_BPS        | 100 (1%)                  | Admin fee on the round's whole deployed ETH → feeCollector |
| VAULT_FEE_BPS        | 1000 (10%)                | Vault fee on the *losers' pool* (after admin) → Treasury  |
| HARVEST_FEE_BPS      | 1000 (10%)                | On mined PEA harvests only - bonus PEA is untaxed         |
| Deploys per round    | 1 per user                | Second deploy reverts `AlreadyDeployedThisRound`          |

---

## How the Game Works

### Round Lifecycle

```
GameStarted -> 60s timer (block.timestamp) -> reset() -> Quiver randomness -> RoundSettled -> next GameStarted
```

1. A round starts. You have ~60 seconds to deploy.
2. Call `deploy(blockIds)` with ETH - it is split equally across your chosen tiles.
3. After the timer expires, `reset()` is called (automated by the backend). It requests randomness from the Quiver commit-reveal protocol.
4. Quiver returns a random value, expanded into three words:
   - **Winning tile** (`% 25`, uniform random - no tile has better odds)
   - **Split/single PEA winner** (`% 2`) + weighted random seed
   - **Peapot trigger** (`% 333`)
5. Round settles. Winners are every miner who deployed to the winning tile.
6. Next round starts immediately.

> **Randomness note:** Robinhood Chain has no Chainlink or Pyth VRF, so PEA uses a **custom Quiver commit-reveal** protocol. A provider (keeper) commits to a hash chain in advance and reveals a preimage per round; the coordinator verifies it and delivers the random words to GridMining. From the player's side it is a fair, uniform draw - the mechanics below are unchanged.

**Empty rounds** (zero deployments): settle instantly, no randomness request, no PEA minted, no peapot growth.

**No-winner rounds** (deployments exist but nobody covered the winning tile): the round's deployed ETH (minus the 1% admin fee) vaults to the treasury and funds buybacks. No PEA minted. The peapot does NOT grow. Because the draw is uniform across all 25 tiles, a tile nobody covered can be drawn.

### ETH Rewards

Two fees are taken at settlement:

- **Admin fee: 1%** of the round's total deployed ETH (`ADMIN_FEE_BPS = 100`) → `feeCollector`.
- **Vault fee: 10%** of the **losers' pool** after the admin cut (`VAULT_FEE_BPS = 1000`) → Treasury (funds buybacks). The losers' pool is the ETH deployed to tiles *other* than the winning one.

Everything left is the **claimable pool**, split proportionally among the winning tile's miners - and it **includes their returned stake**:

```
adminFee      = totalDeployed x 1%                    (whole round → feeCollector)
losersPool    = totalDeployed - stakeOnWinningTile
vaultAmount   = (losersPool - losersPool x 1%) x 10%  (→ Treasury)
claimablePool = totalDeployed - adminFee - vaultAmount

yourReward    = claimablePool x (yourStakeOnWinningTile / totalStakeOnWinningTile)
```

**Key insight:** winners get their **own ETH back** (net of a small fee) *plus* a proportional share of the losers' pool. The effective house edge is **not** a flat 10% - it ranges from ~1% (when the winning tile holds most of the round) up to ~11% (when the winning tile holds almost none), because the 10% vault fee applies only to the losers' pool. If you are the only miner on the drawn tile and there are no losers, you get back ~99% (just the 1% admin fee).

### PEA Rewards (1 PEA per round)

Two possible distribution modes, decided 50/50 by the same randomness:

- **Split:** 1 PEA divided proportionally among all winners, based on ETH deployed to the winning tile.
- **Single winner:** one miner takes all 1 PEA via weighted random - more ETH on the winning tile means higher probability.

### Peapot (Jackpot)

- **Accumulates** 0.1 PEA per round (only when the winning tile has miners).
- **Trigger:** random `% 333 == 0` (~0.30% per eligible round). Requires an existing pool > 0.
- **Payout:** the entire accumulated pool is split proportionally among the winning tile's miners. The pool resets, and that round's 0.1 PEA starts a fresh one.
- **No hit:** 0.1 PEA is added to the existing pool, which grows over time.
- Peapot value is visible via the API (`peapotPool` field) and on-chain.

### Harvest Fee (PEA Harvests)

When you harvest PEA:
- **10% fee on mined PEA only.** The bonus you have accrued from other people's harvests is NOT taxed.
- The fee is redistributed to everyone holding unharvested PEA.
- Holding unharvested PEA earns passive income from other miners' harvest fees.
- If you are the last unharvested holder, the fee is burned instead.

**Checkpoint:** rewards are auto-checkpointed when you `deploy()`, `claimETH()`, or `claimPEA()`. No manual checkpoint needed.

### Fee Flow Summary

```
Total ETH in round
├── 1% admin fee (whole round)              → feeCollector
├── 10% vault fee (on the losers' pool)     → Treasury
│   └── Buyback: vaulted ETH buys PEA
│       ├── 95% burned
│       └── 5% to stakers as yield
└── Remainder (claimablePool)               → winning tile's miners (proportional; includes their returned stake)

PEA minted: 1.0 → winning tile   |   0.1 → peapot pool
Peapot: 1/333 chance to pay the entire accumulated pool to the winning tile

PEA harvests: 10% fee on mined PEA → redistributed to unharvested holders
              Bonus PEA: untaxed
```

---

## REST API

Base URL: `https://api.minepea.com`

### Round State

```
GET /api/round/current                  Full board state (served from memory)
GET /api/round/current?user=0xADDR      Same + your deployment amount
GET /api/round/{id}                     Historical round data
GET /api/round/{id}/miners              Per-miner reward breakdown (settled rounds)
GET /api/round/{id}/deploys             Every deploy in a round (tiles covered, amounts)
GET /api/rounds?page=1&limit=50         Paginated round history
GET /api/rounds?peapot=true             Only rounds where the peapot fired
```

**`GET /api/round/current`** response:
```json
{
  "roundId": "150",
  "startTime": 1709300000,
  "endTime": 1709300060,
  "totalDeployed": "500000000000000000",
  "totalDeployedFormatted": "0.5",
  "peapotPool": "45000000000000000000",
  "peapotPoolFormatted": "45.0",
  "settled": false,
  "blocks": [
    { "id": 0, "deployed": "20000000000000000", "deployedFormatted": "0.02", "minerCount": 1 },
    { "id": 1, "deployed": "0", "deployedFormatted": "0.0", "minerCount": 0 }
  ],
  "userDeployed": "50000000000000000",
  "userDeployedFormatted": "0.05"
}
```

Note: the JSON calls the tiles `blocks`, and the contract parameter is `blockIds`. Same 25 positions the app shows as tiles.

### Stats & Price

```
GET /api/stats                          Supply, emissions, burns, peapot pool, PEA price
GET /api/price                          PEA price from the DEX (cached)
GET /api/treasury/stats                 Vaulted ETH, total burned, amount to stakers, buyback count
GET /api/treasury/buybacks?page=1       Paginated buyback history
GET /api/analytics/{tab}                Time series: mining | token | staking | buybacks | miners
```

**`GET /api/price`** response:
```json
{
  "pea": {
    "priceUsd": "376.64",
    "priceNative": "0.19",
    "volume24h": "1559055.58",
    "liquidity": "290725.26",
    "priceChange24h": "-2.34",
    "fdv": "3924000"
  },
  "fetchedAt": "2026-07-22T12:00:00.000Z"
}
```

### User Data

```
GET /api/user/{address}                 Balances + lifetime stats (roundsPlayed, wins, totalDeployed)
GET /api/user/{address}/rewards         Pending ETH + PEA breakdown
GET /api/user/{address}/history         Deploy/claim history (?type=deploy for PNL per round)
```

**`GET /api/user/{address}/rewards`** response:
```json
{
  "pendingETH": "50000000000000000",
  "pendingETHFormatted": "0.05",
  "pendingPEA": {
    "unroasted": "1000000000000000000",
    "unroastedFormatted": "1.0",
    "roasted": "200000000000000000",
    "roastedFormatted": "0.2",
    "gross": "1200000000000000000",
    "grossFormatted": "1.2",
    "fee": "100000000000000000",
    "feeFormatted": "0.1",
    "net": "1100000000000000000",
    "netFormatted": "1.1"
  },
  "uncheckpointedRound": "0"
}
```

The `unroasted` / `roasted` keys are legacy names in the REST payload. Read `unroasted` as your unharvested mined PEA (the part the 10% fee applies to) and `roasted` as the untaxed bonus accrued from other miners' harvest fees. `net` is what you actually receive. The contract exposes the same two values as `pendingUnharvestedPEA` and `pendingHarvestedPEA`.

### Staking

```
GET /api/staking/stats                  Total staked, TVL (USD), APR (already %, e.g. "7.52")
GET /api/staking/{address}              Your stake, pending yield, compound fee reserve
```

### AutoMiner

```
GET /api/automine/{address}             Config, cost/round, rounds remaining, refundable amount
```

### Leaderboard

```
GET /api/leaderboard/miners?period=24h  Top deployers (?period=24h|7d|30d|all&limit=20)
GET /api/leaderboard/earners            Top unharvested PEA holders (?page=1&limit=20)
GET /api/leaderboard/stakers            Top stakers (?page=1&limit=20)
```

---

## SSE Streams (Real-Time)

```
GET /api/events/rounds                  Global stream (all events)
GET /api/user/{address}/events          Per-user stream (your rewards, claims)
```

Wire format is standard Server-Sent Events: the event name is on the `event:` line and the JSON payload is on the `data:` line **directly** - there is no `{ "type", "data" }` envelope. With `EventSource`, do `es.addEventListener('deployed', e => JSON.parse(e.data))` and you get the payload object shown below.

### Global Events

**`deployed`** - someone deployed. Full board snapshot, no client-side decoding needed:
```
event: deployed
data:
{
  "roundId": "150", "user": "0x...", "totalAmount": "50000000000000000",
  "isAutoMine": false,
  "totalDeployed": "500000000000000000", "totalDeployedFormatted": "0.5",
  "userDeployed": "100000000000000000", "userDeployedFormatted": "0.1",
  "blocks": [
    { "id": 0, "deployed": "...", "deployedFormatted": "...", "minerCount": 2 }
  ]
}
```
(During a webhook outage the backend may emit poll-derived `deployed` events where `user` is `null` - the `blocks` snapshot is still authoritative; skip per-deploy attribution on those.)

**`roundTransition`** - round ended and a new one begins:
```
event: roundTransition
data:
{
  "settled": {
    "roundId": "149", "winningBlock": 14, "topMiner": "0x...",
    "totalWinnings": "...", "topMinerReward": "...", "peapotAmount": "0",
    "isSplit": false, "peaWinner": "0x...", "winnerCount": 1
  },
  "newRound": {
    "roundId": "150", "startTime": 1709300000, "endTime": 1709300060,
    "peapotPool": "45000000000000000000", "peapotPoolFormatted": "45.0"
  }
}
```
`settled` is `null` for empty rounds. `peapotAmount` is `"0"` when the jackpot did not trigger. Winner display: if `winnerCount === 1`, show `peaWinner` as the winner even when `isSplit` is `true`.

**`heartbeat`** - every 30 seconds: `{ "timestamp": "..." }`

### Per-User Events

| Event               | Key Fields                                          |
|---------------------|-----------------------------------------------------|
| `checkpointed`      | `roundId`, `ethReward`, `peaReward`                 |
| `claimedETH`        | `amount`, `txHash`                                  |
| `claimedPEA`        | `minedPea`, `roastedPea`, `fee`, `net`              |
| `stakeDeposited`    | `amount`, `newBalance`                              |
| `stakeWithdrawn`    | `amount`, `newBalance`                              |
| `yieldClaimed`      | `amount`                                            |
| `yieldCompounded`   | `amount`, `fee`                                     |
| `autoMineExecuted`  | `roundId`, `blocks`, `totalDeployed`, `fee`, `roundsExecuted` |
| `configDeactivated` | `roundsCompleted`                                   |
| `stopped`           | `refundAmount`, `roundsCompleted`                   |

A `checkpointed` event fires whether or not you won. Read `ethReward` and `peaReward`: both are `"0"` when the round produced nothing for you.

---

## Contract Functions

### GridMining - Gameplay

**Write (state-changing):**

| Function | Payable | Description |
|----------|---------|-------------|
| `deploy(uint8[] calldata blockIds)` | YES | Deploy ETH to selected tiles (0-24). ETH split equally: `amountPerTile = msg.value / blockIds.length` (must be ≥ MIN_DEPLOY per tile) |
| `claimETH()` | No | Claim accumulated ETH rewards |
| `claimPEA()` | No | Claim accumulated PEA (10% fee on the mined portion, bonus untaxed) |

**Read (view):**

| Function | Returns |
|----------|---------|
| `getCurrentRoundInfo()` | `(roundId, startTime, endTime, totalDeployed, timeRemaining, isActive)` |
| `getTotalPendingRewards(address)` | `(pendingETH, pendingUnharvestedPEA, pendingHarvestedPEA, uncheckpointedRound)` |
| `getRoundDeployed(uint64 roundId)` | `uint256[25]` - ETH per tile |
| `getMinerInfo(uint64 roundId, address)` | `(deployedMask, amountPerBlock, checkpointed)` |
| `currentRoundId()` | `uint64` |

Naming note: the contract calls these `pendingUnharvestedPEA` and `pendingHarvestedPEA`, while the REST payload still calls the same two values `unroasted` and `roasted`. They are the same numbers.

### PEA Token (ERC20)

| Function | Description |
|----------|-------------|
| `approve(address spender, uint256 amount)` | Required before staking. Approve the Staking contract address. |
| `transfer(address to, uint256 amount)` | Transfer PEA tokens |
| `balanceOf(address)` | Your PEA balance |

### Staking - Yield from Buybacks

| Function | Payable | Description |
|----------|---------|-------------|
| `deposit(uint256 amount)` | Yes (send 0 ETH) | Stake PEA (requires prior `approve`). No lock, no penalty. The function is `payable` but takes no ETH - send `value: 0`. |
| `withdraw(uint256 amount)` | No | Unstake PEA. Instant. |
| `claimYield()` | No | Claim all accumulated staking yield |
| `compound()` | No | Compound yield back into stake (no fee, no cooldown for self) |
| `depositCompoundFee()` | YES | Pre-deposit ETH so bots can auto-compound for you |

**Read:**

| Function | Returns |
|----------|---------|
| `getStakeInfo(address)` | `(balance, pendingRewards, compoundFeeReserve, lastClaimAt, lastDepositAt, lastWithdrawAt, canCompound)` |
| `getPendingRewards(address)` | `uint256` - pending yield |
| `getGlobalStats()` | `(totalStaked, totalYieldDistributed, accYieldPerShare)` |

### AutoMiner - Automated Play

| Function | Payable | Description |
|----------|---------|-------------|
| `setConfig(uint8 strategyId, uint256 numRounds, uint8 numBlocks, uint32 blockMask)` | YES | Set up auto-mining with an ETH deposit for N rounds. Fee: `max(flatFee, percentageFee)` per round. |
| `stop()` | No | Stop auto-mining and refund remaining rounds |

**Strategies:**
- `0` (Random): the executor picks `numBlocks` random tiles each round
- `1` (All): deploy to all 25 tiles every round
- `2` (Select): you specify exact tiles via `blockMask` (uint32 bitmask, bits 0-24). Tiles 0, 5, 10 → `(1<<0) | (1<<5) | (1<<10)` = `1057`

**Read:**

| Function | Returns |
|----------|---------|
| `configs(address)` | Full config struct (strategy, tiles, rounds, deposit, fees) |
| `getUserState(address)` | Config + progress + costPerRound + refundable |
| `getConfigProgress(address)` | `(active, numRounds, roundsExecuted, roundsRemaining, percentComplete)` |

---

## Strategy

### Expected Value (EV)

The ETH side is a redistribution among players minus fees - roughly negative-sum by the fee take (1% admin on the whole round + 10% vault on the losers' pool, so an **effective ~1-11%** depending on how crowded the winning tile is). The **positive-EV driver is the PEA you mint by winning**, plus the peapot.

```
PEA value  = 1 PEA x priceNative                       (mining reward if you land the winning tile)
Peapot EV  = (1/333) x peapotPool x priceNative        (pot-level trigger EV per eligible round, pool > 0)
```

Whether a round is worth playing depends on your probability of hitting the winning tile (≈ `tilesYouCover / 25`), your resulting share, and the PEA price. A higher PEA price and a fatter peapot make rounds more profitable. Use `/api/price` for `priceNative` (PEA in ETH) and `/api/round/current` for `peapotPool`.

> Note: because winners get their own stake back, your *ETH* loss when you win is only the small fee share; your ETH loss when you *lose* (not on the winning tile) is your whole deploy. The PEA reward is what turns a round net-positive.

### Tile Selection

All 25 tiles have an **equal 1/25 chance** of being drawn. The draw is uniform: deploying more ETH on a tile raises what you are paid if it is drawn, never the chance that it is drawn. Strategy is about share, not odds.

- **Fewer tiles** (1-3): higher variance, larger reward per tile when you hit.
- **More tiles** (10-25): more frequent wins, smaller reward each. Covering all 25 guarantees a win every round, but you are then paying the fees for a proportional share of your own money.
- **Read the board:** watch SSE `deployed` events. Deploying to less crowded tiles gives a bigger proportional share if the draw picks yours.
- **Empty tiles:** if you are the only miner on a tile and it is drawn, you take the entire claimable pool.

### Timing

Rounds are 60 seconds, measured with `block.timestamp`.

- **Deploy early:** others see your position via SSE and may counter.
- **Deploy late:** less time for others to react, but you risk missing the round if your transaction does not confirm in time.
- **Reactive:** watch SSE for 40-50 seconds, then deploy to the least crowded tiles.

### Bet Sizing

- **Minimum:** `0.0000025 ETH x numTiles`
- **Bankroll:** do not risk more than a small percentage per round. Variance is high at 1/25 per tile.
- **Pool context:** check `totalDeployed` on `/api/round/current`. Your share of the winning tile determines the reward size.

### PEA Management

1. **Hold unharvested PEA:** earn a passive bonus, since 10% of every other miner's harvest is redistributed to unharvested holders.
2. **Stake PEA:** earn yield from treasury buybacks. Check APR via `/api/staking/stats` (already a percentage, e.g. `"7.52"` = 7.52%).
3. **Self-compound:** call `compound()` - no fee, no cooldown.
4. **Track price:** use `/api/price` for the PEA/ETH rate.

### AutoMiner vs Manual

| | Manual | AutoMiner |
|---|---|---|
| Control | Full (choose tiles, amount, timing each round) | Strategy preset (random/all/select) |
| Cost | Gas per deploy | Executor fee: max(flatFee, %) per round + upfront deposit |
| Upside | React to board state in real time | Hands-off, runs N rounds automatically |
| Best for | Active play, reactive strategy | Passive play, guaranteed participation |

---

## Agent Workflow

```
1. INITIALISE
   GET /api/stats                       → global stats, PEA price
   GET /api/price                       → detailed price data (priceNative for EV calc)
   GET /api/round/current?user=ADDR     → current board + peapot + your position
   GET /api/user/ADDR/rewards           → pending ETH + PEA rewards
   GET /api/staking/ADDR                → staking position
   Connect SSE: /api/events/rounds      → real-time updates

2. EACH ROUND (~60 seconds)
   a. Observe: SSE 'deployed' events show real-time board state
   b. Analyse: weigh PEA reward (price x 1) + peapot EV against your ETH at risk
   c. Evaluate: which tiles are least crowded? what is your bankroll?
   d. Decide: choose tiles + ETH amount (or skip this round)
   e. Execute: GridMining.deploy(blockIds) with ETH
   f. Wait: SSE 'roundTransition' event → see if you won

3. CLAIM REWARDS (periodically, when gas-efficient)
   - Check /api/user/ADDR/rewards
   - claimETH() when pendingETH is meaningful
   - claimPEA() - weigh harvesting now against holding for the bonus
   - Consider the PEA price trend before harvesting

4. MANAGE PEA
   - If staking APR is attractive: approve() → deposit()
   - Compound yield regularly: compound()
   - Track performance: /api/user/ADDR/history?type=deploy (PNL per round)
   - Rebalance: withdraw stake if better opportunities arise

5. RECONNECT
   - On SSE drop: GET /api/round/current + reconnect SSE
```

---

## Critical Rules

1. **One deploy per round** - a second attempt reverts `AlreadyDeployedThisRound`.
2. **Minimum deploy:** 0.0000025 ETH per tile. The transaction reverts below this.
3. **Approve before staking:** call `PEA.approve(stakingAddress, amount)` before `Staking.deposit()`.
4. **The draw is uniform.** Every tile has the same 1-in-25 chance regardless of the ETH on it. More ETH changes your payout, never your odds.
5. **A tile nobody covered can win.** When that happens the round has no winners and its deployed ETH (minus the 1% admin fee) vaults to the treasury.
6. **Two fees, not one:** 1% admin on the whole round + 10% vault on the losers' pool. Winners get their own stake back plus a share of the losers' pool - the effective take is ~1-11%, not a flat 10%.
7. **Harvest fee:** 10% on mined PEA only. The bonus accrued from other miners' fees is untaxed.
8. **Block timestamps:** round timing uses `block.timestamp`, not wall clock.
9. **Peapot conditions:** it only accumulates and can only trigger when the winning tile has at least one miner.
10. **Empty rounds:** zero deployments means an instant settle, no randomness request, no PEA, no peapot growth.
11. **Checkpoint auto-trigger:** `deploy()`, `claimETH()` and `claimPEA()` all checkpoint your previous round automatically.
12. **AutoMiner fees:** hybrid `max(flatFee, percentageFee)` per round, frozen at config creation. Check via `/api/automine/ADDR`.
13. **Rate limits:** 60 req/min by default, 5 req/min on RPC-heavy endpoints (user balances, rewards, staking, automine - these share one pool).
