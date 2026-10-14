import posthog from 'posthog-js';

const POSTHOG_PROJECT_TOKEN = 'phc_nXYGEubcNtuWzPPAPUzZMSRSvLKijPCGLiMr4WHgcfvN';
const POSTHOG_API_HOST = 'https://us.i.posthog.com';

function isAutomatedBrowser(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

// This project token is a public event-ingestion key, not a personal API key.
// Keep collection explicit: no autocapture, pageviews, or session recordings.
if (typeof window !== 'undefined' && !isAutomatedBrowser()) {
  posthog.init(POSTHOG_PROJECT_TOKEN, {
    api_host: POSTHOG_API_HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    person_profiles: 'identified_only',
    ip: false,
    persistence: 'localStorage',
  });
}

type ProductAnalyticsEvent =
  | 'product_area_viewed'
  | 'bounty_created'
  | 'contribution_submitted'
  | 'contribution_resubmitted'
  | 'contribution_reviewed';

type EventProperties = Record<string, string | number | boolean | undefined>;

export function captureProductEvent(event: ProductAnalyticsEvent, properties: EventProperties = {}): void {
  if (typeof window === 'undefined' || isAutomatedBrowser()) return;
  posthog.capture(event, properties);
}

export function identifyAnalyticsUser(userId: string): void {
  if (typeof window === 'undefined' || isAutomatedBrowser() || !userId) return;
  if (posthog.get_distinct_id() !== userId) {
    // Stable internal account ID only; no email or display name is sent.
    posthog.identify(userId);
  }
}

export function resetAnalyticsIdentity(): void {
  if (typeof window === 'undefined' || isAutomatedBrowser()) return;
  posthog.reset();
}
