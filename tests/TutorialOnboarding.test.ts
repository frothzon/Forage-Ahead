import { describe, expect, it, beforeEach } from 'vitest';
import { ALL_MENU_TABS, GameState } from '../src/core/GameState';

describe('TutorialOnboarding', () => {
  let gs: GameState;

  beforeEach(() => {
    gs = new GameState();
    gs.debugMode = false;
  });

  it('starts a new tutorial run with locked menu tabs and berries in slot 5', () => {
    gs.startNewGameWithTutorial('Gladiator');
    expect(gs.tutorialCompleted).toBe(false);
    expect(gs.equipment.weapon).toBeNull();
    expect(gs.equipment.tool).toBeNull();
    expect(gs.hotbar[4]).toBe('berries');
    expect(gs.hotbar.filter((id) => id === 'berries')).toHaveLength(1);
    for (const tab of ALL_MENU_TABS) {
      expect(gs.isMenuTabUnlocked(tab)).toBe(tab === 'settings');
    }

    // Granting pickaxe never overwrites berries and never creates duplicates
    gs.grantStarterTool('pickaxe', 0, 'tool');
    gs.grantStarterTool('pickaxe', 0, 'tool');
    expect(gs.hotbar[0]).toBe('pickaxe');
    expect(gs.hotbar[4]).toBe('berries');
    expect(gs.inventory.pickaxe).toBe(1);
  });

  it('supports staggered menu tab unlocking and full unlock on tutorial completion', () => {
    gs.startNewGameWithTutorial('Sorcerer');
    gs.unlockMenuTab('inventory');
    expect(gs.isMenuTabUnlocked('inventory')).toBe(true);
    expect(gs.isMenuTabUnlocked('craft')).toBe(false);

    gs.unlockMenuTab('craft', 'skills');
    expect(gs.isMenuTabUnlocked('craft')).toBe(true);
    expect(gs.isMenuTabUnlocked('skills')).toBe(true);
    expect(gs.isMenuTabUnlocked('map')).toBe(false);

    gs.completeTutorial();
    expect(gs.tutorialCompleted).toBe(true);
    for (const tab of ALL_MENU_TABS) {
      expect(gs.isMenuTabUnlocked(tab)).toBe(true);
    }
  });

  it('keeps legacy reset() saves with all menu tabs unlocked', () => {
    gs.reset('Beastmaster');
    expect(gs.tutorialCompleted).toBe(true);
    for (const tab of ALL_MENU_TABS) {
      expect(gs.isMenuTabUnlocked(tab)).toBe(true);
    }
  });
});
