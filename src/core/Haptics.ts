type ImpactStyle = 'LIGHT' | 'MEDIUM' | 'HEAVY';

interface CapacitorHapticsPlugin {
  impact?: (opts: { style: ImpactStyle }) => Promise<void>;
  notification?: (opts: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }) => Promise<void>;
}

const PREFS_KEY = 'forage_ahead_haptics_v1';

class HapticsManager {
  public enabled = true;

  constructor() {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (raw !== null) {
          this.enabled = raw !== 'false';
        }
      } catch {
        // Ignore storage errors
      }
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(PREFS_KEY, String(enabled));
      } catch {
        // Ignore storage errors
      }
    }
  }

  private getPlugin(): CapacitorHapticsPlugin | null {
    if (typeof window === 'undefined') return null;
    const cap = (window as unknown as { Capacitor?: { Plugins?: { Haptics?: CapacitorHapticsPlugin } } }).Capacitor;
    return cap?.Plugins?.Haptics ?? null;
  }

  public impactLight(): void {
    this.impact('LIGHT', 10);
  }

  public impactMedium(): void {
    this.impact('MEDIUM', 20);
  }

  public impactHeavy(): void {
    this.impact('HEAVY', 36);
  }

  public notifySuccess(): void {
    if (!this.enabled) return;
    const plugin = this.getPlugin();
    if (plugin?.notification) {
      plugin.notification({ type: 'SUCCESS' }).catch(() => {});
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([14, 30, 18]);
      } catch {
        // Silent no-op on unsupported browsers
      }
    }
  }

  private impact(style: ImpactStyle, fallbackMs: number): void {
    if (!this.enabled) return;
    const plugin = this.getPlugin();
    if (plugin?.impact) {
      plugin.impact({ style }).catch(() => {});
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(fallbackMs);
      } catch {
        // Silent no-op on desktop web
      }
    }
  }
}

export const Haptics = new HapticsManager();
