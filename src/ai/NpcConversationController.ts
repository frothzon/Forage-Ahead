import {
  generateFalloutChoices,
  type ChoiceGenContext,
  type GeneratedChoice,
} from './DialogueChoiceGenerator';
import {
  npcBrainRuntime,
  type GiftReaction,
  type MoodLabel,
  type NpcBrainRuntime,
  type NpcTalkResult,
} from './NpcBrainRuntime';
import { gameState, type GameState } from '../core/GameState';
import { ITEMS } from '../data/items';
import {
  getMerchantDailyStock,
  getMerchantDiscountPct,
  purchaseMerchantOffer,
  type MerchantShopOffer,
} from '../data/merchantShop';
import {
  evaluateGiftReaction,
  type NpcSecretReward,
  type ProceduralNpcProfile,
} from '../data/proceduralNpcs';
import type { QuestDef } from '../data/quests';
import { dialogueBox, type DialogueChoice } from '../ui/DialogueBox';

export interface StartNpcConversationParams {
  profile: ProceduralNpcProfile;
  currentDay?: number;
  runtime?: NpcBrainRuntime;
  state?: GameState;
  greetingPrompt?: string;
  onAcceptQuest?: (quest: QuestDef) => void;
  onCompleteQuest?: (quest: QuestDef) => void;
  onGiftReaction?: (reaction: GiftReaction, itemId: string, itemName: string) => void;
  onSecretClaimed?: (reward: NpcSecretReward) => void;
  onHeartLevelUp?: (newHearts: number, unlockedQuestTitle?: string) => void;
  onMerchantPurchase?: (offer: MerchantShopOffer) => void;
  onOpenMerchantShop?: (ctx: {
    profile: ProceduralNpcProfile;
    currentDay: number;
    hearts: number;
    secretClaimed: boolean;
    onBackToChat: () => void;
    onCloseAll: () => void;
  }) => void;
  onConversationEnd?: () => void;
}

const MOOD_COLORS: Record<MoodLabel, string> = {
  Warm: '#2c7a47',
  Friendly: '#3b8558',
  Curious: '#2b618a',
  Neutral: '#6d5a47',
  Guarded: '#9a6324',
  Tense: '#b54c1e',
  Hostile: '#9e2a35',
};

export function getMoodColor(moodLabel: MoodLabel): string {
  return MOOD_COLORS[moodLabel] ?? '#5a7a42';
}

export function isGiftableItem(itemId: string): boolean {
  if (!itemId) return false;
  const def = ITEMS[itemId];
  if (!def) return false;
  if (def.equipSlot) return false;
  if (
    def.category === 'tool' ||
    def.category === 'weapon' ||
    def.category === 'armor' ||
    def.category === 'accessory' ||
    def.category === 'relic' ||
    def.category === 'gadget'
  ) {
    return false;
  }
  if (def.id.startsWith('bomb')) return false;
  return def.category === 'food' || def.category === 'material' || def.category === 'consumable';
}

const GIFT_REACTION_PRIORITY: Record<GiftReaction, number> = {
  loved: 0,
  liked: 1,
  disliked: 3,
};

export function resolveGiftCandidate(
  state: GameState,
  knownGifts?: Record<string, GiftReaction>,
): { itemId: string; itemName: string } | null {
  const selectedId = state.hotbar[state.selectedHotbarIndex];
  if (selectedId && isGiftableItem(selectedId) && state.getBagItemCount(selectedId) > 0) {
    return {
      itemId: selectedId,
      itemName: ITEMS[selectedId]?.name ?? selectedId,
    };
  }

  let best: { itemId: string; itemName: string; rank: number } | null = null;
  for (const slot of state.bagSlots) {
    if (!slot || slot.count <= 0) continue;
    if (!isGiftableItem(slot.itemId)) continue;
    const known = knownGifts?.[slot.itemId];
    const rank = known ? GIFT_REACTION_PRIORITY[known] : 2;
    if (!best || rank < best.rank) {
      best = {
        itemId: slot.itemId,
        itemName: ITEMS[slot.itemId]?.name ?? slot.itemId,
        rank,
      };
      if (rank === 0) break;
    }
  }

  return best ? { itemId: best.itemId, itemName: best.itemName } : null;
}

function buildNpcSubtitle(
  profile: ProceduralNpcProfile,
  state: GameState,
  currentHearts?: number,
): string {
  const base = profile.relationLabel
    ? `${profile.title} • ${profile.relationLabel}`
    : profile.title;
  const nextQuest = state.getNextQuestForNpc(profile.id, currentHearts);
  if (nextQuest && state.isQuestActive(nextQuest.id) && !state.isQuestReadyToTurnIn(nextQuest.id)) {
    const progress = nextQuest.objectives
      .map((obj) => `${obj.label} ${state.getObjectiveProgress(nextQuest.id, obj)}/${obj.count}`)
      .join(', ');
    return `${base} • ${nextQuest.title} (${progress})`;
  }
  return base;
}

function resolveQuestAction(
  profile: ProceduralNpcProfile,
  state: GameState,
  currentHearts?: number,
): { label: string; kind: 'offer' | 'complete'; quest: QuestDef } | null {
  const quest = state.getNextQuestForNpc(profile.id, currentHearts);
  if (!quest) return null;
  if (state.isQuestActive(quest.id)) {
    if (!state.isQuestReadyToTurnIn(quest.id)) return null;
    return {
      label: `Turn In: ${quest.title} (+${quest.rewards.coins}g)`,
      kind: 'complete',
      quest,
    };
  }
  return {
    label: `Quest: ${quest.title}`,
    kind: 'offer',
    quest,
  };
}

function recordExhaustedTopic(activeTopicsUsed: string[], choice: GeneratedChoice): void {
  activeTopicsUsed.push(choice.id, choice.label, choice.prompt);
  if (choice.id.startsWith('lore_')) {
    activeTopicsUsed.push(choice.id.slice(5));
  } else if (choice.id === 'ctx_answer_trade_choice') {
    activeTopicsUsed.push('item');
  } else if (choice.id === 'ctx_answer_rumor_choice') {
    activeTopicsUsed.push('rumor');
  } else if (choice.id === 'ctx_solve_crisis') {
    activeTopicsUsed.push('crisis_solution');
  } else if (choice.id === 'ctx_apology') {
    activeTopicsUsed.push('apology');
  }
}

function applySecretReward(state: GameState, reward: NpcSecretReward): void {
  if (reward.kind === 'coins') {
    const amount = Math.max(1, reward.amount ?? 50);
    state.coins = state.coins + amount;
  } else if (reward.kind === 'item' && reward.itemId) {
    state.addItem(reward.itemId, Math.max(1, reward.amount ?? 1));
  }
}

/**
 * Starts a live multi-turn Fallout-style 4-choice conversation backed by CogniWSP,
 * procedural villager lore, deterministic quests, daily gifts, and trust secrets.
 */
export function startNpcConversation(params: StartNpcConversationParams): NpcTalkResult {
  const { profile } = params;
  const runtime = params.runtime ?? npcBrainRuntime;
  const state = params.state ?? gameState;
  const currentDay = Math.max(1, Math.floor(params.currentDay ?? 1));

  runtime.ensureNpc({
    id: profile.id,
    personaKey: profile.personaKey,
    loreSlice: {
      id: profile.id,
      name: profile.name,
      label: `${profile.lore.home} (${profile.name})`,
      ...profile.lore,
    },
    baselineMood: profile.baselineMood,
    driveWeights: profile.driveWeights,
    seed: profile.seed,
  });

  const isMerchant = profile.category === 'merchant' || profile.personaKey === 'merchant';

  let turnIndex = 0;
  const activeTopicsUsed: string[] = [];
  let finished = false;

  const finishConversation = (): void => {
    if (finished) return;
    finished = true;
    state.setNpcBrainsSnapshot(runtime.serializeAll());
    params.onConversationEnd?.();
  };

  const notifyHeartLevelUpIfNeeded = (prevHearts: number, nextHearts: number): void => {
    if (nextHearts <= prevHearts) return;
    const prevQuest = state.getNextQuestForNpc(profile.id, prevHearts);
    const nextQuest = state.getNextQuestForNpc(profile.id, nextHearts);
    const newlyUnlocked =
      nextQuest && nextQuest.id !== prevQuest?.id && !state.isQuestActive(nextQuest.id)
        ? nextQuest
        : undefined;
    params.onHeartLevelUp?.(nextHearts, newlyUnlocked?.title);
  };

  let lastResult = runtime.talk(profile.id, params.greetingPrompt ?? 'Hello there');

  const showOrUpdateFalloutTurn = (
    res: NpcTalkResult,
    isInitial: boolean,
    customLines?: string[],
  ): void => {
    lastResult = res;
    const questInfo = resolveQuestAction(profile, state, res.hearts);
    const giftedToday = state.hasGiftedNpcToday(profile.id, currentDay);
    const knownGifts = state.getNpcKnownGifts?.(profile.id);
    const giftCandidate = giftedToday ? null : resolveGiftCandidate(state, knownGifts);
    const knownGiftReaction = giftCandidate ? (knownGifts?.[giftCandidate.itemId] ?? null) : null;
    const giftHintAvailable = Boolean(profile.giftHint && profile.giftHint.trim().length > 0);

    const ctx: ChoiceGenContext = {
      npcName: profile.name,
      role: profile.title,
      stance: res.stance,
      mood: res.mood,
      hearts: res.hearts,
      secretUnlocked: res.secretUnlocked,
      secretClaimed: state.hasClaimedNpcSecret(profile.id),
      turnIndex,
      lastConceptSeq: res.trace.conceptSeq,
      lastOpenQuestion: res.trace.openQuestion,
      activeTopicsUsed,
      loreTopics: {
        crisis: profile.lore.crisis,
        rival: profile.lore.rival,
        item: profile.lore.item,
        home: profile.lore.home,
        rumor: profile.lore.rumor,
      },
      questAction: questInfo ? { label: questInfo.label, kind: questInfo.kind } : null,
      giftCandidate,
      giftedToday,
      isMerchant,
      knownGiftReaction,
      giftHintAvailable,
    };

    const generated = generateFalloutChoices(ctx);
    const choices: DialogueChoice[] = generated.map((ch, idx) => ({
      label: ch.label,
      primary: ch.primary,
      tone: ch.tone,
      hotkey: String(idx + 1),
      onSelect: () => handleChoice(ch, questInfo?.quest),
    }));

    const cfg = {
      speaker: profile.name,
      portraitKey: profile.spriteKey,
      subtitle: buildNpcSubtitle(profile, state, res.hearts),
      voicePitch: profile.voicePitch,
      hearts: res.hearts,
      moodLabel: res.moodLabel,
      moodColor: getMoodColor(res.moodLabel),
      choiceLayout: 'fallout' as const,
      lines: customLines && customLines.length > 0 ? customLines : [res.text],
      choices,
      onClose: finishConversation,
    };

    if (isInitial) {
      dialogueBox.show(cfg);
    } else {
      dialogueBox.updateTurn(cfg);
    }
  };

  const openMerchantShop = (feedbackLine?: string): void => {
    const moodState = runtime.getNpcMoodState(profile.id);
    const secretClaimed = state.hasClaimedNpcSecret(profile.id);
    const discountPct = getMerchantDiscountPct(moodState.hearts, secretClaimed);
    const offers = getMerchantDailyStock({
      merchantId: profile.id,
      worldSeed: state.worldSeed ?? profile.seed,
      dayNumber: currentDay,
      hearts: moodState.hearts,
      secretClaimed,
    });

    const discountSuffix = discountPct > 0 ? ` • -${discountPct}% Discount` : '';
    const introLine =
      discountPct > 0
        ? `Welcome back, patron! Your {c:#7ef29d}-${discountPct}% discount{/c} is applied today. ({c:#ffe066}${state.coins}g{/c})`
        : `Take a look at today's traveling wares, friend. ({c:#ffe066}${state.coins}g{/c} on hand)`;

    const shopChoices: DialogueChoice[] = offers.map((offer, idx) => {
      const qtyName = offer.count > 1 ? `${offer.count}x ${offer.name}` : offer.name;
      const priceLabel =
        offer.discountPct > 0
          ? `${offer.finalPrice}g (-${offer.discountPct}%)`
          : `${offer.finalPrice}g`;
      return {
        label: `${qtyName} — ${priceLabel}`,
        tone: 'shop',
        hotkey: String(idx + 1),
        onSelect: () => {
          const result = purchaseMerchantOffer(state, offer);
          if (result.ok) {
            runtime.recordWorldEvent(
              `The hero bought ${offer.count}x ${offer.name} from ${profile.name} for ${offer.finalPrice}g.`,
            );
            state.setNpcBrainsSnapshot(runtime.serializeAll());
            params.onMerchantPurchase?.(offer);
            openMerchantShop(
              `Purchased {c:#7ef29d}${qtyName}{/c} for {c:#ffe066}${offer.finalPrice}g{/c}! Coins remaining: {c:#ffe066}${state.coins}g{/c}.`,
            );
          } else if (result.reason === 'bag_full') {
            openMerchantShop(
              `{c:#ff8fab}Your bag is full!{/c} Make space before buying ${offer.name}. ({c:#ffe066}${state.coins}g{/c})`,
            );
          } else {
            openMerchantShop(
              `{c:#ff8fab}Not enough coins{/c} for ${qtyName} — need {c:#ffe066}${offer.finalPrice}g{/c}, you have {c:#ffe066}${state.coins}g{/c}.`,
            );
          }
        },
      };
    });

    shopChoices.push({
      label: 'Back to Conversation',
      tone: 'leave',
      hotkey: '4',
      onSelect: () => {
        showOrUpdateFalloutTurn(lastResult, false);
      },
    });

    dialogueBox.updateTurn({
      speaker: profile.name,
      portraitKey: profile.spriteKey,
      subtitle: `Merchant Wares • ${state.coins}g${discountSuffix}`,
      voicePitch: profile.voicePitch,
      hearts: moodState.hearts,
      moodLabel: moodState.moodLabel,
      moodColor: getMoodColor(moodState.moodLabel),
      choiceLayout: 'fallout',
      lines: [feedbackLine ?? introLine],
      choices: shopChoices,
      onClose: finishConversation,
    });
  };

  const openQuestStep = (quest: QuestDef, kind: 'offer' | 'complete'): void => {
    const moodState = runtime.getNpcMoodState(profile.id);
    if (kind === 'offer') {
      dialogueBox.updateTurn({
        speaker: profile.name,
        portraitKey: profile.spriteKey,
        subtitle: `New Quest: ${quest.title}`,
        voicePitch: quest.voicePitch ?? profile.voicePitch,
        hearts: moodState.hearts,
        moodLabel: moodState.moodLabel,
        moodColor: getMoodColor(moodState.moodLabel),
        choiceLayout: 'fallout',
        lines: quest.offerDialogue,
        onClose: finishConversation,
        choices: [
          {
            label: 'Accept Quest',
            tone: 'quest',
            primary: true,
            hotkey: '1',
            onSelect: () => {
              state.acceptQuest(quest.id);
              state.setTrackedQuest(quest.id);
              runtime.recordWorldEvent(
                `The hero accepted "${quest.title}" from ${profile.name}.`,
              );
              dialogueBox.close(false);
              finishConversation();
              params.onAcceptQuest?.(quest);
            },
          },
          {
            label: 'Maybe Later',
            tone: 'leave',
            hotkey: '2',
            onSelect: () => {
              showOrUpdateFalloutTurn(lastResult, false);
            },
          },
        ],
      });
      return;
    }

    dialogueBox.updateTurn({
      speaker: profile.name,
      portraitKey: profile.spriteKey,
      subtitle: `Quest Ready: ${quest.title}`,
      voicePitch: quest.voicePitch ?? profile.voicePitch,
      hearts: moodState.hearts,
      moodLabel: moodState.moodLabel,
      moodColor: getMoodColor(moodState.moodLabel),
      choiceLayout: 'fallout',
      lines: quest.completeDialogue,
      onClose: finishConversation,
      choices: [
        {
          label: `Complete (+${quest.rewards.coins}g, +${quest.rewards.xp} XP)`,
          tone: 'quest',
          primary: true,
          hotkey: '1',
          onSelect: () => {
            const done = state.completeQuest(quest.id);
            if (done) {
              runtime.recordWorldEvent(
                `The hero completed "${done.title}" for ${profile.name}!`,
              );
              state.setNpcBrainsSnapshot(runtime.serializeAll());
              params.onCompleteQuest?.(done);
              turnIndex += 1;
              const prevHearts = lastResult.hearts;
              const followUp = runtime.talk(
                profile.id,
                `Thank you for rewarding me for ${done.title}!`,
              );
              notifyHeartLevelUpIfNeeded(prevHearts, followUp.hearts);
              showOrUpdateFalloutTurn(followUp, false);
            } else {
              showOrUpdateFalloutTurn(lastResult, false);
            }
          },
        },
        {
          label: 'Wait a moment',
          tone: 'leave',
          hotkey: '2',
          onSelect: () => {
            showOrUpdateFalloutTurn(lastResult, false);
          },
        },
      ],
    });
  };

  const handleChoice = (choice: GeneratedChoice, activeQuest?: QuestDef): void => {
    const action = choice.action ?? 'talk';

    if (action === 'leave') {
      runtime.talk(profile.id, 'Farewell for now');
      dialogueBox.close(false);
      finishConversation();
      return;
    }

    if (action === 'shop') {
      if (params.onOpenMerchantShop) {
        const moodState = runtime.getNpcMoodState(profile.id);
        const secretClaimed = state.hasClaimedNpcSecret(profile.id);
        dialogueBox.close(false);
        params.onOpenMerchantShop({
          profile,
          currentDay,
          hearts: moodState.hearts,
          secretClaimed,
          onBackToChat: () => {
            if (!finished) {
              showOrUpdateFalloutTurn(lastResult, true);
            }
          },
          onCloseAll: () => {
            finishConversation();
          },
        });
        return;
      }
      openMerchantShop();
      return;
    }

    if (action === 'quest' && activeQuest) {
      const kind = choice.id === 'world_quest_complete' ? 'complete' : 'offer';
      openQuestStep(activeQuest, kind);
      return;
    }

    const prevHearts = lastResult.hearts;

    if (action === 'gift') {
      const knownGifts = state.getNpcKnownGifts?.(profile.id);
      const candidate = choice.giftItemId
        ? { itemId: choice.giftItemId, itemName: ITEMS[choice.giftItemId]?.name ?? choice.giftItemId }
        : resolveGiftCandidate(state, knownGifts);
      if (
        candidate &&
        !state.hasGiftedNpcToday(profile.id, currentDay) &&
        state.removeItem(candidate.itemId, 1)
      ) {
        const reaction = evaluateGiftReaction(profile, candidate.itemId);
        state.markNpcGiftedToday(profile.id, currentDay);
        state.recordNpcKnownGift?.(profile.id, candidate.itemId, reaction);
        const giftRes = runtime.applyGift(profile.id, candidate.itemName, reaction);
        state.setNpcBrainsSnapshot(runtime.serializeAll());
        params.onGiftReaction?.(reaction, candidate.itemId, candidate.itemName);
        notifyHeartLevelUpIfNeeded(prevHearts, giftRes.hearts);
        turnIndex += 1;
        showOrUpdateFalloutTurn(giftRes, false);
        return;
      }
    }

    if (action === 'secret') {
      const claimedNow = !state.hasClaimedNpcSecret(profile.id);
      if (claimedNow) {
        applySecretReward(state, profile.secretReward);
        state.claimNpcSecret(profile.id);
        params.onSecretClaimed?.(profile.secretReward);
      }
      activeTopicsUsed.push('secret');
      recordExhaustedTopic(activeTopicsUsed, choice);
      turnIndex += 1;
      const secretRes = runtime.talk(profile.id, choice.prompt);
      state.setNpcBrainsSnapshot(runtime.serializeAll());
      notifyHeartLevelUpIfNeeded(prevHearts, secretRes.hearts);
      const lines = claimedNow
        ? [`${secretRes.text} {c:#ffe066}${profile.secretReward.description}{/c}`]
        : [secretRes.text];
      showOrUpdateFalloutTurn(secretRes, false, lines);
      return;
    }

    recordExhaustedTopic(activeTopicsUsed, choice);
    turnIndex += 1;
    const talkRes = runtime.talk(profile.id, choice.prompt);
    state.setNpcBrainsSnapshot(runtime.serializeAll());
    notifyHeartLevelUpIfNeeded(prevHearts, talkRes.hearts);
    const customLines =
      choice.id === 'lore_gift_hint' && profile.giftHint
        ? [profile.giftHint]
        : undefined;
    showOrUpdateFalloutTurn(talkRes, false, customLines);
  };

  showOrUpdateFalloutTurn(lastResult, true);
  return lastResult;
}
