"use client";

import { useState } from "react";
import BookingWidget from "@/components/booking-calendar/booking-widget";
import ConnectWalletButton from "@/components/ConnectWalletButton";

export default function Home() {
  const [showBooking, setShowBooking] = useState(false);

  const eventTypeId = Number(process.env.NEXT_PUBLIC_CALCOM_EVENT_TYPE_ID);

  if (!Number.isFinite(eventTypeId)) {
    throw new Error("NEXT_PUBLIC_CALCOM_EVENT_TYPE_ID must be a number");
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      
      {/* NAVBAR */}
      <nav className="flex justify-between items-center px-6 py-4 border-b border-neutral-800">
        <div className="font-semibold text-lg">
          x402 Scheduler
        </div>
        <ConnectWalletButton />
      </nav>

      {/* HERO SECTION */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-4xl font-bold mb-4">
          Programmable Meetings
        </h1>
        <p className="text-neutral-400 max-w-xl mb-8">
          A simple crypto-native booking experience powered by Base and USDC.
        </p>

        <button
          onClick={() => setShowBooking(true)}
          className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 transition text-lg"
        >
          Book a Meeting
        </button>
      </div>

      {/* MODAL BOOKING WIDGET */}
      {showBooking && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-3xl">
            
            {/* Close Button */}
            <button
              onClick={() => setShowBooking(false)}
              className="absolute -top-10 right-0 text-neutral-400 hover:text-white"
            >
              Close ✕
            </button>

            <BookingWidget
              eventTypeId={eventTypeId}
              eventLength={30}
              title="Schedule a meeting"
              description="Choose a time that works best for you."
              showHeader={true}
            />
          </div>
        </div>
      )}
    </div>
  );
}
