/**
 * SERVER-ONLY Discord role machinery: reads a wallet's total PEA on-chain
 * and grants/revokes community roles through the bot. Consumed by the
 * /api/discord/* routes and the role-refresh cron.
 *
 * Total PEA = liquid balance + staked balance + staking pending yield +
 * both pending mining-reward buckets, all read server-side against the
 * chain RPC so the client can't fake any of it.
 *
 * Thresholds are env-tunable (PEA_HOLDER_MIN / PEA_WHALE_MIN, in PEA;
 * defaults 0.1 and 25, user 2026-07-18). Role env: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID,
 * DISCORD_HOLDER_ROLE_ID, DISCORD_WHALE_ROLE_ID. The bot needs Manage
 * Roles AND its own role positioned ABOVE Holder/Whale, or Discord
 * silently refuses.
 */

import { createPublicClient, erc20Abi, http } from "viem";
import { gridMiningAbi } from "@/lib/abi/gridMining";
import { stakingAbi } from "@/lib/abi/staking";
import { CHAIN, CONTRACTS, RPC_URL } from "@/lib/contracts";
import { fromWei } from "@/lib/format";
import type { Address } from "@/lib/types";

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const HOLDER_ROLE = process.env.DISCORD_HOLDER_ROLE_ID;
const WHALE_ROLE = process.env.DISCORD_WHALE_ROLE_ID;

export function discordEnvReady(): boolean {
  return Boolean(BOT_TOKEN && GUILD_ID && HOLDER_ROLE && WHALE_ROLE);
}

/** Whole-PEA thresholds; env-tunable without a redeploy of copy. */
export function thresholds(): { holder: number; whale: number } {
  return {
    holder: Number(process.env.PEA_HOLDER_MIN ?? "0.1"),
    whale: Number(process.env.PEA_WHALE_MIN ?? "25"),
  };
}

/** Pure role decision — unit-tested. */
export function rolesFor(totalPea: number): { holder: boolean; whale: boolean } {
  const t = thresholds();
  return { holder: totalPea >= t.holder, whale: totalPea >= t.whale };
}

/**
 * Wallet's total PEA across the token, the staking pool (balance + pending
 * yield) and both pending mining-reward buckets.
 */
export async function readTotalPea(address: Address): Promise<number> {
  const client = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });
  const [liquid, stakeInfo, pending] = await Promise.all([
    client.readContract({
      address: CONTRACTS.peaToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
    client.readContract({
      address: CONTRACTS.staking,
      abi: stakingAbi,
      functionName: "getStakeInfo",
      args: [address],
    }),
    client.readContract({
      address: CONTRACTS.gridMining,
      abi: gridMiningAbi,
      functionName: "getTotalPendingRewards",
      args: [address],
    }),
  ]);
  // Positional tuples: getStakeInfo = [balance, pendingRewards, ...];
  // getTotalPendingRewards = [pendingEth, unharvested, harvested, round].
  const staked = stakeInfo[0] as bigint;
  const stakingYield = stakeInfo[1] as bigint;
  const unharvested = pending[1] as bigint;
  const harvested = pending[2] as bigint;
  return fromWei(
    (liquid + staked + stakingYield + unharvested + harvested).toString(),
  );
}

const API = "https://discord.com/api/v10";

async function setRole(
  discordId: string,
  roleId: string,
  grant: boolean,
): Promise<void> {
  const res = await fetch(
    `${API}/guilds/${GUILD_ID}/members/${discordId}/roles/${roleId}`,
    {
      method: grant ? "PUT" : "DELETE",
      headers: { authorization: `Bot ${BOT_TOKEN}` },
    },
  );
  if (res.ok) return;
  // Discord answers 404 for several distinct problems; name each one,
  // because they need different fixes.
  if (res.status === 404) {
    const body = (await res.json().catch(() => null)) as { code?: number } | null;
    if (body?.code === 10011) {
      throw new Error(
        `role id ${roleId} does not exist in this server (re-copy the role ids)`,
      );
    }
    if (body?.code === 10004) {
      throw new Error("guild id is wrong (re-copy the SERVER id)");
    }
    if (body?.code === 10007) {
      // Member not in the guild. Benign when REVOKING (they left; nothing
      // to strip) but a real, nameable condition when GRANTING.
      if (grant) {
        throw new Error(
          "the linked Discord account is not a member of the server",
        );
      }
      return;
    }
    throw new Error(`discord 404 (code ${body?.code ?? "unknown"})`);
  }
  throw new Error(`discord role ${grant ? "grant" : "revoke"} ${res.status}`);
}

/** Bring the member's Holder/Whale roles in line with their holdings. */
export async function syncRoles(
  discordId: string,
  totalPea: number,
): Promise<{ holder: boolean; whale: boolean }> {
  const want = rolesFor(totalPea);
  await setRole(discordId, HOLDER_ROLE as string, want.holder);
  await setRole(discordId, WHALE_ROLE as string, want.whale);
  return want;
}

/** Strip both roles (disconnect path — revoke BEFORE forgetting the id). */
export async function revokeAllRoles(discordId: string): Promise<void> {
  await setRole(discordId, HOLDER_ROLE as string, false);
  await setRole(discordId, WHALE_ROLE as string, false);
}
