"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { CalcomBookingRequest, CalcomBookingResponse } from "@/types/booking";
import { calculateEndTime } from "@/lib/booking-calendar/utils/form-utils";
import { bookingSchema, BookingFormData } from "./schemas";
import { MeetingDetails } from "./meeting-details";
import { ContactSection } from "./contact-section";
import { ReferralSection } from "./referral-section";
import { GuestsSection } from "./guests-section";
import Link from "next/link";

// ✅ add this import (your existing file)
import { payUsdcOnBase } from "@/lib/booking-calendar/x402/payUsdc";

interface BookingFormProps {
  selectedSlot: string;
  eventTypeId: number;
  eventLength: number; // in minutes
  userTimezone: string; // User's selected timezone
  onSuccess: (booking: CalcomBookingResponse) => void;
  onBack: () => void;
}

export const BookingForm: React.FC<BookingFormProps> = ({
  selectedSlot,
  eventTypeId,
  eventLength,
  userTimezone,
  onSuccess,
  onBack,
}) => {
  const [loading, setLoading] = useState(false);
  const [guests, setGuests] = useState<string[]>([]);

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      name: "",
      email: "",
      notes: "",
      guests: [],
      referralSource: undefined,
    },
  });

  const handleSubmit = async (data: BookingFormData) => {
    setLoading(true);

    try {
      const endTime = calculateEndTime(selectedSlot, eventLength);

      const bookingData: CalcomBookingRequest = {
        eventTypeId,
        start: selectedSlot,
        end: endTime,
        attendee: {
          name: data.name,
          email: data.email,
          timeZone: userTimezone,
        },
        metadata: {
          ...(data.referralSource && { referralSource: data.referralSource }),
          ...(data.notes && { notes: data.notes }),
        },
        bookingFieldsResponses: {
          ...(data.referralSource && { referral_source: data.referralSource }),
          ...(data.notes && { notes: data.notes }),
        },
        guests: guests.length > 0 ? guests : undefined,
      };

      // =========================
      // ✅ 1) PAY FIRST (USDC on Base)
      // =========================
      const usdc = process.env.NEXT_PUBLIC_USDC_BASE as `0x${string}` | undefined;
      const to = process.env.NEXT_PUBLIC_PAYMENT_RECEIVER as
        | `0x${string}`
        | undefined;
      const price = Number(process.env.NEXT_PUBLIC_PRICE_USDC);

      if (!usdc || !to || !Number.isFinite(price) || price <= 0) {
        throw new Error(
          "Payment config missing. Set NEXT_PUBLIC_USDC_BASE, NEXT_PUBLIC_PAYMENT_RECEIVER, NEXT_PUBLIC_PRICE_USDC."
        );
      }

      const { hash } = await payUsdcOnBase({
        usdc,
        to,
        amount: price,
      });

      // =========================
      // ✅ 2) THEN BOOK (include paymentTxHash)
      // =========================
      const response = await fetch("/api/booking-calendar/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...bookingData,
          paymentTxHash: hash,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create booking");
      }

      const result = await response.json();
      const booking = result.data || result;
      onSuccess(booking);
    } catch (error) {
      console.error("Booking error:", error);
      form.setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "Failed to book meeting. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-neutral-900 overflow-hidden rounded-2xl border border-neutral-800 shadow p-6">
      <div className="mb-8">
        <MeetingDetails
          selectedSlot={selectedSlot}
          eventLength={eventLength}
          userTimezone={userTimezone}
        />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <ContactSection control={form.control} />
          <ReferralSection watch={form.watch} setValue={form.setValue} />
          <GuestsSection guests={guests} onGuestsChange={setGuests} />

          {form.formState.errors.root && (
            <Alert className="border-red-500/20 bg-red-500/10">
              <AlertDescription className="text-red-400">
                {form.formState.errors.root.message}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              type="button"
              onClick={onBack}
              className="flex-1 cursor-pointer h-12"
            >
              Back
            </Button>

            <Button
              disabled={loading}
              size="lg"
              type="submit"
              className="flex-1 cursor-pointer h-12"
            >
              {loading ? "Confirming..." : "Confirm"}
            </Button>
          </div>

          <p className="text-center text-sm text-neutral-400">
            By sending, you agree to our{" "}
            <Link
              href="/privacy-policy"
              className="font-medium text-neutral-200 underline hover:text-blue-400 transition-colors"
            >
              Privacy policy
            </Link>{" "}
            and the processing of your data.
          </p>
        </form>
      </Form>
    </div>
  );
};
