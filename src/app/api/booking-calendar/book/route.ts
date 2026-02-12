import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/booking-calendar/utils/rate-limiting";

import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  http,
  parseAbiItem,
} from "viem";
import { base } from "viem/chains";

interface BookingRequestV2 {
  start: string;
  attendee: {
    name: string;
    email: string;
    timeZone: string;
    language?: string;
  };
  eventTypeId: number;
  metadata?: Record<string, string | number | boolean>;
  guests?: string[];
  bookingFieldsResponses?: Record<string, string | string[]>;
}

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(request: NextRequest) {
  // Apply rate limiting (disabled in development)
  const rateLimitCheck = await applyRateLimit("cal-booking");
  if (!rateLimitCheck.allowed) {
    return (
      rateLimitCheck.response ||
      NextResponse.json(
        { error: "Too many booking requests. Please try again later." },
        { status: 429 }
      )
    );
  }

  if (!process.env.CALCOM_API_KEY) {
    return NextResponse.json(
      { error: "Cal.com API key not configured" },
      { status: 500 }
    );
  }

  if (!process.env.CALCOM_API_URL) {
    return NextResponse.json(
      { error: "Cal.com API URL not configured" },
      { status: 500 }
    );
  }

  // Read payment config from .env.local (server only)
  let BASE_RPC_URL = "";
  let PAYMENT_RECEIVER = "";
  let USDC_BASE = "";
  let PRICE_USDC = 0;

  try {
    BASE_RPC_URL = requireEnv("BASE_RPC_URL");
    PAYMENT_RECEIVER = requireEnv("PAYMENT_RECEIVER").toLowerCase();
    USDC_BASE = requireEnv("USDC_BASE").toLowerCase();
    PRICE_USDC = Number(requireEnv("PRICE_USDC"));

    if (!Number.isFinite(PRICE_USDC) || PRICE_USDC <= 0) {
      return NextResponse.json(
        { error: "PRICE_USDC must be a positive number" },
        { status: 500 }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Payment env misconfigured" },
      { status: 500 }
    );
  }

  const publicClient = createPublicClient({
    chain: base,
    transport: http(BASE_RPC_URL),
  });

  try {
    const bookingData = await request.json();

    // Validate required fields
    if (!bookingData.eventTypeId || !bookingData.start || !bookingData.attendee) {
      return NextResponse.json(
        { error: "Missing required booking data" },
        { status: 400 }
      );
    }

    // Require payment proof (x402-style gate)
    const paymentTxHash = bookingData.paymentTxHash as `0x${string}` | undefined;
    if (!paymentTxHash) {
      return NextResponse.json(
        { error: "Payment required", details: "Missing paymentTxHash" },
        { status: 402 }
      );
    }

    // Verify payment tx on Base
    const receipt = await publicClient.getTransactionReceipt({
      hash: paymentTxHash,
    });

    if (receipt.status !== "success") {
      return NextResponse.json(
        { error: "Payment required", details: "Payment transaction failed" },
        { status: 402 }
      );
    }

    // Look for USDC Transfer logs to PAYMENT_RECEIVER
    const usdcLogs = receipt.logs.filter(
      (l) => l.address.toLowerCase() === USDC_BASE
    );

    let paidUSDC = 0;

    for (const log of usdcLogs) {
      try {
        const decoded = decodeEventLog({
          abi: [transferEvent],
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName !== "Transfer") continue;

        const to = (decoded.args as any).to as string;
        const value = (decoded.args as any).value as bigint;

        if (to.toLowerCase() === PAYMENT_RECEIVER) {
          paidUSDC += Number(formatUnits(value, 6)); // USDC = 6 decimals
        }
      } catch {
        // ignore non-matching logs
      }
    }

    if (paidUSDC + 1e-9 < PRICE_USDC) {
      return NextResponse.json(
        {
          error: "Payment required",
          details: `Insufficient payment. Paid ${paidUSDC} USDC, need ${PRICE_USDC} USDC.`,
        },
        { status: 402 }
      );
    }

    // Validate and parse eventTypeId safely
    const eventTypeId = Number(bookingData.eventTypeId);
    if (!Number.isFinite(eventTypeId) || eventTypeId <= 0) {
      return NextResponse.json(
        { error: "Invalid eventTypeId: must be a valid positive number" },
        { status: 400 }
      );
    }

    // Ensure notes is always a string
    const notes = String(
      bookingData.metadata?.notes || "No additional notes provided"
    );

    // Build Cal.com payload (do NOT forward paymentTxHash)
    const calcomBookingData: BookingRequestV2 = {
      start: bookingData.start,
      attendee: {
        name: bookingData.attendee.name,
        email: bookingData.attendee.email,
        timeZone: bookingData.attendee.timeZone,
        language: "en",
      },
      eventTypeId,
      bookingFieldsResponses: {
        name: bookingData.attendee.name,
        email: bookingData.attendee.email,
        notes,
        "discovery-method": bookingData.metadata?.referralSource,
      },
      ...(bookingData.guests &&
        bookingData.guests.length > 0 && { guests: bookingData.guests }),
    };

    const apiUrl = `${process.env.CALCOM_API_URL}/bookings`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
        "cal-api-version": "2024-08-13",
      },
      body: JSON.stringify(calcomBookingData),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Cal.com booking error:", {
        status: response.status,
        statusText: response.statusText,
        errorData: errorData,
        requestData: calcomBookingData,
      });
      return NextResponse.json(
        {
          error: "Failed to create booking with Cal.com",
          details: errorData,
          status: response.status,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating Cal.com booking:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
