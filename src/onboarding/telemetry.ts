type OnboardingEventName =
  | 'onboarding_started'
  | 'onboarding_skipped'
  | 'onboarding_completed'
  | 'onboarding_step_changed'
  | 'first_export_done'
  | 'onboarding_step_jump'
  | 'onboarding_step_blocked';

interface OnboardingEventPayload {
  stepId?: string;
  source?: string;
  timestamp?: string;
}

export function emitOnboardingEvent(name: OnboardingEventName, payload: OnboardingEventPayload = {}): void {
  const event = {
    name,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    ...payload
  };

  // Temporary local adapter until analytics backend is connected.
  console.debug('[onboarding-event]', event);
}
