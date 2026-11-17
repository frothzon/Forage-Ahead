import { describe, expect, it } from 'vitest';
import { SFX } from '../src/core/SoundFX';

describe('SoundFXManager', () => {
  it('clamps masterVolume between 0 and 1', () => {
    SFX.setVolume(1.5);
    expect(SFX.masterVolume).toBe(1);
    SFX.setVolume(-0.4);
    expect(SFX.masterVolume).toBe(0);
    SFX.setVolume(0.7);
    expect(SFX.masterVolume).toBe(0.7);
  });

  it('respects muted state and cooldown throttling in canPlay', () => {
    SFX.muted = false;
    SFX.setVolume(0.7);
    expect(SFX.canPlay('test_key_a', 50)).toBe(true);
    expect(SFX.canPlay('test_key_a', 50)).toBe(false);

    SFX.muted = true;
    expect(SFX.canPlay('test_key_b', 0)).toBe(false);
    SFX.muted = false;
  });

  it('safely invokes all SFX methods without throwing in headless environment', () => {
    SFX.setRoomSpace('overworld');
    SFX.setRoomSpace('dungeon');
    SFX.playChop();
    SFX.playMine();
    SFX.playBreakProp('box');
    SFX.playBreakProp('pot');
    SFX.playSwing();
    SFX.playBowShoot();
    SFX.playHit();
    SFX.playPlayerHurt();
    SFX.playEnemyDeath();
    SFX.playDash();
    SFX.playCast();
    SFX.playExplosion();
    SFX.playPickup();
    SFX.playCoin();
    SFX.playCraft();
    SFX.playSwitch();
    SFX.playGateUnlock();
    SFX.playChestOpen();
    SFX.playFishCast();
    SFX.playFishBite();
    SFX.playFishGo();
    SFX.playFishTick(0.6);
    SFX.playFishCatch();
    SFX.playFishFail();
    SFX.playUiClick();
    SFX.playLevelUp();
    SFX.playQuestComplete();
    SFX.playIslandUnlock();
    SFX.playBossDefeat();
    SFX.playBuildPlace();
    SFX.playBuildDemolish();
    SFX.playPlantSeed();
    SFX.playWaterSplash();
    SFX.playHarvestCrop();
    SFX.playEat();
    SFX.playDrinkPotion();
    SFX.playHotbarSelect();
    SFX.playEquipGear();
    SFX.playUiOpen();
    SFX.playUiClose();
    SFX.playUiError();
    SFX.playSkillUnlock();
    SFX.playMarketTrade();
    SFX.playPortalWarp();
    SFX.playBossEnrage();
    SFX.playDialogueBlip(1.1);
    SFX.playRevealGrow();
    SFX.playRevealBounce();
    SFX.playFootstep('grass');
  });
});
