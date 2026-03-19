import type { OnboardingStepId } from './steps';

export type OnboardingStatus = 'idle' | 'active' | 'completed' | 'dismissed';

export type OnboardingEntryPath = 'quick_start' | 'scratch' | 'import' | null;

export interface OnboardingState {
  version: 1;
  status: OnboardingStatus;
  seenAt: string;
  completedAt: string | null;
  dismissed: boolean;
  currentStep: OnboardingStepId;
  entryPath: OnboardingEntryPath;
}

export const ONBOARDING_STORAGE_VERSION = 1;
