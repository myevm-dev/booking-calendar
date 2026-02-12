// src/lib/booking-calendar/x402/verifyPayment.ts
import { createPublicClient, http, getAddress, parseEventLogs } from "viem";
import { base } from "viem/chains";

const ERC20_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: true, name: "value", type: "uint256" },
    ],
  },
] as const;

export type VerifyPaymentArgs = {
  txHash: `0x${string}`;
  expectedTo: `0x${string}`;
  expectedToken: `0x${string}`;
  expectedAmount: number; // human units (USDC)
  expectedFrom?: `0x${string}`;
};

export async function verifyErc20TransferOnBase({
  txHash,
  expectedTo,
  expectedToken,
  expectedAmount,
  expectedFrom,
}: VerifyPaymentArgs): Promise<{ ok: boolean; reason?: string }> {
  const rpc = process.env.BASE_RPC_URL;
  if (!rpc) return { ok: false, reason: "Missing BASE_RPC_URL" };

  const client = createPublicClient({ chain: base, transport: http(rpc) });

  const receipt = await client
    .getTransactionReceipt({ hash: txHash })
    .catch(() => null);

  if (!receipt) return { ok: false, reason: "Transaction not found" };
  if (receipt.status !== "success")
    return { ok: false, reason: "Transaction failed" };

  const token = getAddress(expectedToken);
  const to = getAddress(expectedTo);
  const from = expectedFrom ? getAddress(expectedFrom) : undefined;

  // USDC = 6 decimals
  const min = BigInt(Math.round(expectedAmount * 1_000_000));

  const tokenLogs = receipt.logs.filter(
    (l) => l.address.toLowerCase() === token.toLowerCase()
  );

  const transfers = parseEventLogs({
    abi: ERC20_ABI,
    logs: tokenLogs,
  })
    .filter((e) => e.eventName === "Transfer")
    .map((e) => e.args);

  const match = transfers.find((t) => {
    if (t.to.toLowerCase() !== to.toLowerCase()) return false;
    if (from && t.from.toLowerCase() !== from.toLowerCase()) return false;
    return t.value >= min;
  });

  if (!match) return { ok: false, reason: "No matching USDC Transfer found" };
  return { ok: true };
}
