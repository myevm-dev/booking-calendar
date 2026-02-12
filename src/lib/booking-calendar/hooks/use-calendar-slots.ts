// src/lib/booking-calendar/hooks/use-calendar-slots.ts

import { useState, useCallback } from "react";
import type { CalcomSlot } from "@/types/booking";
import {
  getLocalDateString,
  getSlotLocalDate,
} from "@/lib/booking-calendar/utils/date-utils";

export interface MonthSlots {
  [date: string]: { start: string; attendees?: number; bookingUid?: string }[];
}

export interface UseCalendarSlotsResult {
  monthSlots: MonthSlots;
  availableSlots: CalcomSlot[];
  loading: boolean;
  fetchMonthSlots: (currentDate: Date) => Promise<void>;
  fetchSlots: (date: Date) => Promise<void>;
}

// Helper function to convert Cal.com v2 slot to our CalcomSlot format
const convertCalcomSlot = (calcomSlot: {
  start: string;
  attendees?: number;
  bookingUid?: string;
}): CalcomSlot => {
  return {
    time: calcomSlot.start, // Cal.com v2 uses 'start', we need 'time'
    attendees: calcomSlot.attendees || 0,
    bookingUid: calcomSlot.bookingUid,
  };
};

export const useCalendarSlots = (
  eventTypeId: number,
  enabled: boolean = true
): UseCalendarSlotsResult => {
  const [monthSlots, setMonthSlots] = useState<MonthSlots>({});
  const [availableSlots, setAvailableSlots] = useState<CalcomSlot[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch available slots for the entire month
  const fetchMonthSlots = useCallback(
    async (currentDate: Date) => {
      if (!Number.isFinite(eventTypeId) || !enabled) return;

      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();

      // Get first and last day of the month
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      // Extend to cover the full calendar view (including prev/next month days)
      const startDate = new Date(firstDay);
      startDate.setDate(firstDay.getDate() - ((firstDay.getDay() + 6) % 7));

      const endDate = new Date(lastDay);
      endDate.setDate(lastDay.getDate() + (6 - ((lastDay.getDay() + 6) % 7)));

      try {
        const dateFrom = startDate.toISOString().split("T")[0];
        const dateTo = endDate.toISOString().split("T")[0];

        const response = await fetch(
          `/api/booking-calendar/slots?eventTypeId=${eventTypeId}&dateFrom=${dateFrom}&dateTo=${dateTo}`
        );

        if (response.ok) {
          const data = await response.json();

          // Cal.com v2 API returns slots directly: { "2025-06-17": [{ "start": "..." }] }
          if (data && typeof data === "object") {
            setMonthSlots(data);
          }
        } else {
          console.error("Failed to fetch month slots:", response.status);
          setMonthSlots({});
        }
      } catch (error) {
        console.error("Error fetching month slots:", error);
        setMonthSlots({});
      }
    },
    [eventTypeId, enabled]
  );

  // Fetch available slots for selected date
  const fetchSlots = useCallback(
    async (date: Date) => {
      if (!Number.isFinite(eventTypeId) || !enabled) return;

      setLoading(true);
      try {
        const selectedLocalDateStr = getLocalDateString(date);

        // Find all slots that fall on this local date
        const slotsForDate: CalcomSlot[] = [];

        Object.entries(monthSlots).forEach(([slotDate, slots]) => {
          if (slots && slots.length > 0) {
            slots.forEach((slot) => {
              const slotLocalDate = getSlotLocalDate(slot.start);
              if (slotLocalDate === selectedLocalDateStr) {
                slotsForDate.push(convertCalcomSlot(slot));
              }
            });
          }
        });

        if (slotsForDate.length > 0) {
          // Sort slots by time
          slotsForDate.sort(
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
          );
          setAvailableSlots(slotsForDate);
          setLoading(false);
          return;
        }

        // Fallback: fetch specific date range that covers this local date
        const dayBefore = new Date(date);
        dayBefore.setDate(date.getDate() - 1);
        const dayAfter = new Date(date);
        dayAfter.setDate(date.getDate() + 1);

        const dateFrom = dayBefore.toISOString().split("T")[0];
        const dateTo = dayAfter.toISOString().split("T")[0];

        const response = await fetch(
          `/api/booking-calendar/slots?eventTypeId=${eventTypeId}&dateFrom=${dateFrom}&dateTo=${dateTo}`
        );

        if (response.ok) {
          const data = await response.json();

          const slotsArray: CalcomSlot[] = [];
          if (data && typeof data === "object") {
            Object.entries(data).forEach(([slotDate, slots]) => {
              if (Array.isArray(slots)) {
                slots.forEach(
                  (slot: { start: string; attendees?: number; bookingUid?: string }) => {
                    const slotLocalDate = getSlotLocalDate(slot.start);
                    if (slotLocalDate === selectedLocalDateStr) {
                      slotsArray.push(convertCalcomSlot(slot));
                    }
                  }
                );
              }
            });
          }

          slotsArray.sort(
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
          );
          setAvailableSlots(slotsArray);
        } else {
          setAvailableSlots([]);
        }
      } catch (error) {
        console.error("Error fetching slots:", error);
        setAvailableSlots([]);
      } finally {
        setLoading(false);
      }
    },
    [eventTypeId, enabled, monthSlots]
  );

  return {
    monthSlots,
    availableSlots,
    loading,
    fetchMonthSlots,
    fetchSlots,
  };
};
