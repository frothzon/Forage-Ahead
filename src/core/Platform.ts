import { Capacitor } from '@capacitor/core';

/**
 * Returns true when running on a native mobile platform or a touch-first coarse-pointer device.
 * Safe to call in headless/test environments where `window` may be undefined.
 */
export function isMobileTouchDevice(): boolean {
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    // Ignore in headless test environments
  }
  if (typeof window === 'undefined') return false;
  const isCoarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  return isCoarse || (hasTouch && window.innerWidth <= 1150);
}

/** Prefix a world/UI prompt with `[KEY] ` on desktop, or omit the key hint on mobile. */
export function fmtKeyPrompt(key: string, label: string): string {
  return isMobileTouchDevice() ? label : `[${key}] ${label}`;
}

/** Suffix a UI label with ` [KEY]` on desktop, or omit the key hint on mobile. */
export function fmtKeySuffix(label: string, key: string): string {
  return isMobileTouchDevice() ? label : `${label} [${key}]`;
}
