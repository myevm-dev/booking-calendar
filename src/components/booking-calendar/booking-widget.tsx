// /workspaces/booking-calendar/src/components/booking-calendar/booking-widget.tsx

'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { BookingForm } from './booking-form/booking-form';
import { BookingSuccess } from './booking-success';
import { Button } from '@/components/ui/button';
import type {
  CalcomBookingResponse,
  RescheduleRequest,
  CancelRequest,
} from '@/types/booking';
import { Calendar } from './calendar';
import { CancelConfirmationModal } from './modals/cancel-confirmation-modal';
import { RescheduleConfirmationModal } from './modals/reschedule-confirmation-modal';
import { ErrorModal } from './modals/error-modal';

type BookingStep = 'calendar' | 'form' | 'success' | 'reschedule' | 'cancelled';

interface BookingWidgetProps {
  eventTypeId: number;
  eventLength?: number; // in minutes, default 30
  title?: string;
  description?: string;
  showHeader?: boolean;
}

const BookingWidget: React.FC<BookingWidgetProps> = ({
  eventTypeId,
  eventLength = 30,
  title = 'Schedule a Meeting',
  description,
  showHeader = false,
}) => {
  const [currentStep, setCurrentStep] = useState<BookingStep>('calendar');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [booking, setBooking] = useState<CalcomBookingResponse | null>(null);

  // Hydration-safe timezone init:
  // - Render a stable placeholder on server/first paint
  // - Only render Calendar/Form once we know the user timezone
  const [userTimezone, setUserTimezone] = useState<string>('');
  const [isClientReady, setIsClientReady] = useState(false);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [cancelCountdown, setCancelCountdown] = useState(5);
  const [isRescheduled, setIsRescheduled] = useState(false);
  const [pendingRescheduleSlot, setPendingRescheduleSlot] = useState<
    string | null
  >(null);
  const [isConfirmingReschedule, setIsConfirmingReschedule] = useState(false);
  const [isCancellingMeeting, setIsCancellingMeeting] = useState(false);

  // Ref for scroll positioning
  const widgetRef = useRef<HTMLDivElement>(null);
  const hasUserInteracted = useRef(false);

  // Initialize user timezone on component mount (client-only)
  useEffect(() => {
    setIsClientReady(true);
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setUserTimezone(browserTimezone);
  }, []);

  // Auto-scroll to widget when step changes due to user interaction
  useEffect(() => {
    if (hasUserInteracted.current && widgetRef.current) {
      setTimeout(() => {
        if (widgetRef.current) {
          const headerHeight = 175; // Approximate header height
          const margin = 20; // Small margin from header
          const targetPosition =
            widgetRef.current.offsetTop - headerHeight - margin;

          window.scrollTo({
            top: Math.max(0, targetPosition),
            behavior: 'smooth',
          });
        }
      }, 100);
    }
  }, [currentStep]);

  // Auto-reset cancelled state after countdown
  useEffect(() => {
    if (currentStep === 'cancelled') {
      const interval = setInterval(() => {
        setCancelCountdown((prev) => {
          if (prev <= 1) {
            setCurrentStep('calendar');
            setBooking(null);
            setSelectedSlot(null);
            return 5;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setCancelCountdown(5);
    }
  }, [currentStep]);

  const handleSlotSelect = (slot: string) => {
    hasUserInteracted.current = true;
    setSelectedSlot(slot);
    setCurrentStep('form');
  };

  const handleBookingSuccess = (bookingData: CalcomBookingResponse) => {
    hasUserInteracted.current = true;
    setBooking(bookingData);
    setIsRescheduled(false);
    setCurrentStep('success');
  };

  const handleBackToCalendar = () => {
    hasUserInteracted.current = true;
    setSelectedSlot(null);
    setCurrentStep('calendar');
  };

  const handleNewBooking = () => {
    setSelectedSlot(null);
    setBooking(null);
    setIsRescheduled(false);
    setCurrentStep('calendar');
  };

  const handleReschedule = () => {
    hasUserInteracted.current = true;
    setCurrentStep('reschedule');
  };

  const handleCancel = () => {
    if (!booking?.uid) return;
    setShowCancelDialog(true);
  };

  const confirmCancel = async () => {
    if (!booking?.uid) return;

    setIsCancellingMeeting(true);

    try {
      const cancelData: CancelRequest = {
        bookingUid: booking.uid,
        cancellationReason: 'Cancelled by user',
      };

      const response = await fetch('/api/booking-calendar/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cancelData),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel booking');
      }

      hasUserInteracted.current = true;
      setShowCancelDialog(false);
      setCurrentStep('cancelled');
    } catch (error) {
      console.error('Cancel error:', error);
      setShowCancelDialog(false);
      setErrorMessage(
        'Failed to cancel the meeting. Please use the cancellation link in your booking confirmation email to cancel this meeting.'
      );
      setShowErrorDialog(true);
    } finally {
      setIsCancellingMeeting(false);
    }
  };

  const handleRescheduleSlotSelect = (slot: string) => {
    setPendingRescheduleSlot(slot);
    setShowRescheduleDialog(true);
  };

  const confirmReschedule = async () => {
    if (!booking?.uid || !pendingRescheduleSlot) return;

    setIsConfirmingReschedule(true);

    try {
      const rescheduleData: RescheduleRequest = {
        bookingUid: booking.uid,
        start: pendingRescheduleSlot,
        reschedulingReason: 'User requested reschedule',
      };

      const response = await fetch('/api/booking-calendar/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rescheduleData),
      });

      if (!response.ok) {
        throw new Error('Failed to reschedule booking');
      }

      const result = await response.json();
      const updatedBooking = result.data || result;

      hasUserInteracted.current = true;
      setBooking(updatedBooking);
      setIsRescheduled(true);
      setShowRescheduleDialog(false);
      setPendingRescheduleSlot(null);
      setCurrentStep('success');
    } catch (error) {
      console.error('Reschedule error:', error);
      setShowRescheduleDialog(false);
      setPendingRescheduleSlot(null);
      setErrorMessage(
        'Failed to reschedule the meeting. Please use the rescheduling link in your booking confirmation email to reschedule this meeting.'
      );
      setShowErrorDialog(true);
    } finally {
      setIsConfirmingReschedule(false);
    }
  };

  const tzReady = isClientReady && Boolean(userTimezone);

  return (
    <div ref={widgetRef} className="mx-auto w-full max-w-[760px]">
      {/* Hydration-safe placeholder while timezone initializes */}
      {currentStep === 'calendar' && !tzReady && (
        <div className="bg-neutral-900 rounded-2xl border border-neutral-700 shadow-xl">
          <div className="p-6">
            <div className="mb-4 h-6 w-48 rounded bg-neutral-800" />
            <div className="h-72 w-full rounded bg-neutral-800" />
          </div>
        </div>
      )}

      {currentStep === 'calendar' && tzReady && (
        <Calendar
          eventTypeId={eventTypeId}
          onSlotSelect={handleSlotSelect}
          title={title}
          description={description}
          showHeader={showHeader}
          userTimezone={userTimezone}
          onTimezoneChange={setUserTimezone}
        />
      )}

      {currentStep === 'form' && selectedSlot && tzReady && (
        <BookingForm
          selectedSlot={selectedSlot}
          eventTypeId={eventTypeId}
          eventLength={eventLength}
          userTimezone={userTimezone}
          onSuccess={handleBookingSuccess}
          onBack={handleBackToCalendar}
        />
      )}

      {currentStep === 'reschedule' && booking && tzReady && (
        <Calendar
          eventTypeId={eventTypeId}
          onSlotSelect={handleRescheduleSlotSelect}
          title="Reschedule Meeting"
          description="Please select a new time for your meeting."
          showHeader={true}
          userTimezone={userTimezone}
          onTimezoneChange={setUserTimezone}
        />
      )}

      {currentStep === 'success' && booking && tzReady && (
        <BookingSuccess
          booking={booking}
          userTimezone={userTimezone}
          onReschedule={handleReschedule}
          onCancel={handleCancel}
          onNewBooking={handleNewBooking}
          isRescheduled={isRescheduled}
        />
      )}

      {currentStep === 'cancelled' && (
        <div className="bg-neutral-900 rounded-2xl border border-neutral-700 shadow-xl">
          <div className="p-6 text-center">
            <div className="mb-6 flex justify-center">
              <div className="rounded-full bg-red-500/10 p-4">
                <X className="h-12 w-12 text-red-400" />
              </div>
            </div>
            <h2 className="mb-2 text-2xl font-bold text-neutral-100">
              Meeting Cancelled
            </h2>
            <p className="mb-6 text-neutral-400">
              Your meeting has been successfully cancelled.
            </p>
            <p className="mb-6 text-sm text-neutral-500">
              Returning to calendar in {cancelCountdown} seconds...
            </p>
            <Button onClick={handleNewBooking} className="w-full max-w-sm">
              Book Another Meeting
            </Button>

          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      <CancelConfirmationModal
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={confirmCancel}
        isLoading={isCancellingMeeting}
      />

      {/* Reschedule Confirmation Modal */}
      <RescheduleConfirmationModal
        isOpen={showRescheduleDialog}
        onClose={() => {
          setShowRescheduleDialog(false);
          setPendingRescheduleSlot(null);
        }}
        onConfirm={confirmReschedule}
        isLoading={isConfirmingReschedule}
        booking={booking}
        newSlot={pendingRescheduleSlot}
        userTimezone={userTimezone}
      />

      {/* Error Modal */}
      <ErrorModal
        isOpen={showErrorDialog}
        onClose={() => setShowErrorDialog(false)}
        errorMessage={errorMessage}
      />
    </div>
  );
};

export default BookingWidget;
