import { NextRequest, NextResponse } from "next/server";
import { verifyErc20TransferOnBase } from "../../../../lib/booking-calendar/x402/verifyPayment";

export async function GET(req: NextRequest) {
  const receiver = process.env.PAYMENT_RECEIVER as `0x${string}` | undefined;
  const token = process.env.USDC_BASE as `0x${string}` | undefined;
  const price = Number(process.env.PRICE_USDC ?? "0.10");

  if (!receiver || !token) {
    return NextResponse.json({ error: "Missing PAYMENT_RECEIVER or USDC_BASE" }, { status: 500 });
  }

  const txHash = req.headers.get("x-payment-tx") as `0x${string}` | null;
  const from = req.headers.get("x-wallet") as `0x${string}` | null; // optional

  if (!txHash) {
    return NextResponse.json(
      {
        error: "Payment required",
        payment: {
          chainId: 8453,
          token,
          to: receiver,
          amount: price,
          decimals: 6,
          symbol: "USDC",
          // optional: include a memo/nonce to prevent reuse; see note below
        },
      },
      { status: 402 }
    );
  }

  const verified = await verifyErc20TransferOnBase({
    txHash,
    expectedTo: receiver,
    expectedToken: token,
    expectedAmount: price,
    expectedFrom: from ?? undefined, // optional strictness
  });

  if (!verified.ok) {
    return NextResponse.json(
      { error: "Payment not verified", reason: verified.reason },
      { status: 402 }
    );
  }

  // ✅ paid: return protected content
  return NextResponse.json({
    ok: true,
    data: {
      secret: "here is your protected response",
      // return AI output / data / whatever
    },
  });
}
