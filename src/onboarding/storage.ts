import { ONBOARDING_STORAGE_VERSION, type OnboardingEntryPath, type OnboardingState } from './types';
import { isOnboardingStepId } from './steps';

const ONBOARDING_STORAGE_KEY = 'doc-builder-onboarding-v1';

function createDefaultState(): OnboardingState {
  return {
    version: ONBOARDING_STORAGE_VERSION,
    status: 'idle',
    seenAt: new Date().toISOString(),
    completedAt: null,
    dismissed: false,
    currentStep: 'choose-entry',
    entryPath: null
  };
}

export function loadOnboardingState(): OnboardingState {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return createDefaultState();

    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    const parsedStep = typeof parsed.currentStep === 'string' ? parsed.currentStep : '';
    return {
      version: ONBOARDING_STORAGE_VERSION,
      status: parsed.status ?? 'idle',
      seenAt: parsed.seenAt ?? new Date().toISOString(),
      completedAt: parsed.completedAt ?? null,
      dismissed: parsed.dismissed ?? false,
      currentStep: isOnboardingStepId(parsedStep) ? parsedStep : 'choose-entry',
      entryPath: parsed.entryPath ?? null
    };
  } catch {
    return createDefaultState();
  }
}

export function saveOnboardingState(state: OnboardingState): void {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
}

export function markOnboardingStarted(entryPath: OnboardingEntryPath): OnboardingState {
  const next: OnboardingState = {
    version: ONBOARDING_STORAGE_VERSION,
    status: 'active',
    seenAt: new Date().toISOString(),
    completedAt: null,
    dismissed: false,
    currentStep: 'choose-entry',
    entryPath
  };
  saveOnboardingState(next);
  return next;
}

export function markOnboardingDismissed(): OnboardingState {
  const current = loadOnboardingState();
  const next: OnboardingState = {
    ...current,
    status: 'dismissed',
    dismissed: true,
    entryPath: current.entryPath ?? null
  };
  saveOnboardingState(next);
  return next;
}

export function markOnboardingCompleted(): OnboardingState {
  const current = loadOnboardingState();
  const next: OnboardingState = {
    ...current,
    status: 'completed',
    currentStep: 'complete',
    completedAt: new Date().toISOString(),
    dismissed: true
  };
  saveOnboardingState(next);
  return next;
}
