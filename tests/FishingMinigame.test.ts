import { describe, expect, it, vi } from 'vitest';
import { FishingMinigame } from '../src/ui/FishingMinigame';

describe('FishingMinigame', () => {
  it('tracks active and holding states cleanly', () => {
    const fg = new FishingMinigame();
    expect(fg.isActive()).toBe(false);
    expect(fg.isHolding()).toBe(false);

    // Ignoring setHolding when inactive
    fg.setHolding(true);
    expect(fg.isHolding()).toBe(false);

    // Without DOM (#hud-root), start() finishes gracefully
    const onFinish = vi.fn();
    fg.start(onFinish, { fishName: 'Trout', behavior: 'erratic' });
    expect(onFinish).toHaveBeenCalledWith(true);
    expect(fg.isActive()).toBe(false);
    expect(fg.isHolding()).toBe(false);
  });
});
