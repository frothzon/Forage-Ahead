import { beforeEach, describe, expect, it } from 'vitest';
import { gameState } from '../src/core/GameState';

describe('Button Milestone Alerts', () => {
  beforeEach(() => {
    gameState.reset('Beastmaster');
  });

  it('triggers menu alert on first skill point earned and clears on click', () => {
    expect(gameState.hasAlertForButton('menu')).toBe(false);

    // Earn enough XP to level up and gain first skill point
    const needed = gameState.getXpForNextLevel();
    const leveled = gameState.addXp(needed);
    expect(leveled).toBe(true);
    expect(gameState.skillPoints).toBe(1);
    expect(gameState.hasAlertForButton('menu')).toBe(true);

    // Clicking menu clears the alert
    gameState.clearButtonAlerts('menu');
    expect(gameState.hasAlertForButton('menu')).toBe(false);

    // Second level-up does not re-trigger the first_skill_point milestone
    const needed2 = gameState.getXpForNextLevel();
    gameState.addXp(needed2);
    expect(gameState.skillPoints).toBe(2);
    expect(gameState.hasAlertForButton('menu')).toBe(false);
  });

  it('supports triggering alerts for any custom button id', () => {
    expect(gameState.hasAlertForButton('skills')).toBe(false);
    gameState.triggerAlert('custom_event', 'skills');
    expect(gameState.hasAlertForButton('skills')).toBe(true);
    gameState.clearButtonAlerts('skills');
    expect(gameState.hasAlertForButton('skills')).toBe(false);
  });
});
