export type DialogueTone =
  | 'contextual'
  | 'friendly'
  | 'bold'
  | 'lore'
  | 'gift'
  | 'quest'
  | 'secret'
  | 'shop'
  | 'leave';

export interface GeneratedChoice {
  id: string;
  label: string;
  prompt: string;
  tone: DialogueTone;
  primary?: boolean;
  action?: 'talk' | 'gift' | 'quest' | 'secret' | 'shop' | 'leave';
  giftItemId?: string;
}

export interface ChoiceGenContext {
  npcName: string;
  role: string;
  stance: string;
  mood: number[];
  hearts: number;
  secretUnlocked: boolean;
  secretClaimed: boolean;
  turnIndex: number;
  lastConceptSeq: number[];
  lastOpenQuestion?: { type?: string; options?: string[]; topic?: string } | null;
  activeTopicsUsed: string[];
  loreTopics: {
    crisis?: string;
    rival?: string;
    item?: string;
    home?: string;
    rumor?: string;
  };
  questAction?: { label: string; kind: 'offer' | 'complete' } | null;
  giftCandidate?: { itemId: string; itemName: string } | null;
  giftedToday: boolean;
  isMerchant?: boolean;
  knownGiftReaction?: 'loved' | 'liked' | 'disliked' | null;
  giftHintAvailable?: boolean;
}

type LoreKey = keyof ChoiceGenContext['loreTopics'];

interface ChoiceDraft extends GeneratedChoice {
  topicKey?: string;
}

const SLOT1_LORE_ORDER: LoreKey[] = ['crisis', 'item', 'rival', 'home', 'rumor'];
const SLOT3_LORE_ORDER: LoreKey[] = ['rumor', 'item', 'home', 'rival', 'crisis'];

// CogniWSP concept IDs aligned with src/ai/cogniwsp/core/constants.js (no runtime import needed)
const CONCEPT_CRISIS_SET = new Set([13, 14, 15, 74]);
const CONCEPT_CONTRADICTION_SET = new Set([50, 51, 52, 62, 63]);
const CONCEPT_TRADE_SET = new Set([46]);
const CONCEPT_RUMOR_SET = new Set([25, 26, 78]);

function norm(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function truncateText(text: string, maxLen: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

function isHostileStance(stance: string, mood: number[]): boolean {
  const s = norm(stance);
  if (/hostile|angry|upset|contradict|furious|enraged|bitter/.test(s)) return true;
  if (mood.length >= 4 && mood[3] >= 0.55) return true; // CogniWSP mood[3] = anger
  return mood.length > 0 && mood[0] < -0.5;
}

function isGuardedStance(stance: string, mood: number[]): boolean {
  const s = norm(stance);
  if (isHostileStance(stance, mood)) return true;
  if (/guarded|wary|suspicious|cold|distant|tense|distrust|cautious/.test(s)) return true;
  if (mood.length >= 5 && mood[4] >= 0.58) return true; // CogniWSP mood[4] = suspicion
  return mood.length > 0 && mood[0] < -0.25;
}

function isWarmStance(stance: string, hearts: number, mood: number[]): boolean {
  const s = norm(stance);
  if (/warm|friendly|trust|ally|fond|happy|open|eager|cheerful/.test(s)) return true;
  if (hearts >= 3 && !isGuardedStance(stance, mood)) return true;
  if (mood.length >= 2 && (mood[0] >= 0.6 || mood[1] >= 0.6) && !isGuardedStance(stance, mood)) return true;
  return mood.length > 0 && mood[0] > 0.35 && mood.length < 4;
}

function buildExhaustedSet(ctx: ChoiceGenContext): Set<string> {
  const set = new Set<string>();
  for (const item of ctx.activeTopicsUsed) {
    const key = norm(item);
    if (key) set.add(key);
  }
  return set;
}

function makeLoreChoice(key: LoreKey, topicValue: string): ChoiceDraft {
  const cleanTopic = topicValue.trim();
  const shortTopic = truncateText(cleanTopic, 26);
  switch (key) {
    case 'crisis':
      return {
        id: 'lore_crisis',
        label: 'What threatens the island?',
        prompt: `Tell me about ${cleanTopic}—what is happening here?`,
        tone: 'lore',
        action: 'talk',
        topicKey: 'crisis',
      };
    case 'rival':
      return {
        id: 'lore_rival',
        label: `Ask about ${shortTopic}`,
        prompt: `Tell me about your trouble with ${cleanTopic}.`,
        tone: 'lore',
        action: 'talk',
        topicKey: 'rival',
      };
    case 'item':
      return {
        id: 'lore_item',
        label: `Ask about ${shortTopic}`,
        prompt: `What makes ${cleanTopic} so important around here?`,
        tone: 'lore',
        action: 'talk',
        topicKey: 'item',
      };
    case 'home':
      return {
        id: 'lore_home',
        label: `Life at ${shortTopic}`,
        prompt: `Tell me about ${cleanTopic}—what is life like around this island for you?`,
        tone: 'lore',
        action: 'talk',
        topicKey: 'home',
      };
    case 'rumor':
      return {
        id: 'lore_rumor',
        label: 'Heard any rumors lately?',
        prompt: `Have you heard rumors about ${cleanTopic}—what do you make of it?`,
        tone: 'lore',
        action: 'talk',
        topicKey: 'rumor',
      };
  }
}

function isCandidateUsed(
  candidate: ChoiceDraft,
  exhausted: Set<string>,
  chosenIds: Set<string>,
  chosenLabels: Set<string>,
  chosenPrompts: Set<string>,
): boolean {
  const id = norm(candidate.id);
  const label = norm(candidate.label);
  const prompt = norm(candidate.prompt);
  const topicKey = norm(candidate.topicKey);

  if (chosenIds.has(id) || chosenLabels.has(label) || chosenPrompts.has(prompt)) {
    return true;
  }
  if (exhausted.has(id) || exhausted.has(label) || exhausted.has(prompt)) {
    return true;
  }
  if (topicKey && exhausted.has(topicKey)) {
    return true;
  }
  return false;
}

function pickUnusedLore(
  ctx: ChoiceGenContext,
  order: LoreKey[],
  exhausted: Set<string>,
  chosenIds: Set<string>,
  chosenLabels: Set<string>,
  chosenPrompts: Set<string>,
): ChoiceDraft | null {
  for (const key of order) {
    const val = ctx.loreTopics[key];
    if (!val || !val.trim()) continue;
    if (exhausted.has(norm(key)) || exhausted.has(norm(val))) continue;
    const draft = makeLoreChoice(key, val);
    if (!isCandidateUsed(draft, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
      return draft;
    }
  }
  return null;
}

function makeGiftHintChoice(): ChoiceDraft {
  return {
    id: 'lore_gift_hint',
    label: 'What sort of gifts do you like?',
    prompt: 'What sort of gifts do you like?',
    tone: 'lore',
    action: 'talk',
    topicKey: 'gift_hint',
  };
}

function buildMerchantShopDraft(ctx: ChoiceGenContext): ChoiceDraft {
  return {
    id: 'world_merchant_shop',
    label: 'Browse Wares',
    prompt: `Show me what wares you have for sale today, ${ctx.npcName || 'merchant'}.`,
    tone: 'shop',
    primary: !ctx.questAction,
    action: 'shop',
  };
}

function canOfferGiftHint(
  ctx: ChoiceGenContext,
  exhausted: Set<string>,
  chosenIds: Set<string>,
  chosenLabels: Set<string>,
  chosenPrompts: Set<string>,
): ChoiceDraft | null {
  if (!ctx.giftHintAvailable || ctx.hearts < 1 || ctx.activeTopicsUsed.includes('gift_hint')) {
    return null;
  }
  const draft = makeGiftHintChoice();
  if (isCandidateUsed(draft, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
    return null;
  }
  return draft;
}

function buildContextualSlot1(
  ctx: ChoiceGenContext,
  exhausted: Set<string>,
  chosenIds: Set<string>,
  chosenLabels: Set<string>,
  chosenPrompts: Set<string>,
): ChoiceDraft {
  const q = ctx.lastOpenQuestion;
  const qType = norm(q?.type);
  const qTopic = (q?.topic ?? '').trim();
  const qOpts = (q?.options ?? []).map((o) => o.trim()).filter(Boolean);

  const apologyDraft: ChoiceDraft = {
    id: 'ctx_apology',
    label: "I didn't mean any offense.",
    prompt: "I apologize if I crossed a line—let's clear the air and start fresh.",
    tone: 'contextual',
    action: 'talk',
    topicKey: 'apology',
  };

  const hasContradictionConcept = ctx.lastConceptSeq.some((id) => CONCEPT_CONTRADICTION_SET.has(id));
  const hasCrisisConcept = ctx.lastConceptSeq.some((id) => CONCEPT_CRISIS_SET.has(id));
  const hasTradeConcept = ctx.lastConceptSeq.some((id) => CONCEPT_TRADE_SET.has(id));
  const hasRumorConcept = ctx.lastConceptSeq.some((id) => CONCEPT_RUMOR_SET.has(id));

  // 1. Explicit contradiction/hostile question, contradiction concept, OR hostile stance
  if (
    (q && /contradict|hostile|accuse|apolog|blame/.test(qType)) ||
    hasContradictionConcept ||
    (isHostileStance(ctx.stance, ctx.mood) && !q)
  ) {
    if (!isCandidateUsed(apologyDraft, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
      return apologyDraft;
    }
  }

  // 2. React to openQuestion
  if (q) {
    // Special handling for CogniWSP greeting choice: { type: 'CHOICE', options: ['ITEM', 'RUMOR'], topic: 'trade_or_rumor' }
    if (norm(qTopic) === 'trade_or_rumor' || (qOpts.includes('ITEM') && qOpts.includes('RUMOR'))) {
      const itemTopic = ctx.loreTopics.item?.trim();
      const itemOptionDraft: ChoiceDraft = {
        id: 'ctx_answer_trade_choice',
        label: itemTopic ? `Ask about ${truncateText(itemTopic, 24)}` : 'Got anything for trade?',
        prompt: itemTopic
          ? `Tell me about ${itemTopic}—are you looking to trade?`
          : 'Do you have any wares or trades on offer?',
        tone: 'contextual',
        action: 'talk',
        topicKey: 'item',
      };
      if (!isCandidateUsed(itemOptionDraft, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
        return itemOptionDraft;
      }

      const rumorOptionDraft: ChoiceDraft = {
        id: 'ctx_answer_rumor_choice',
        label: 'Heard any rumors around town?',
        prompt: 'What rumors have you heard around the island lately?',
        tone: 'contextual',
        action: 'talk',
        topicKey: 'rumor',
      };
      if (!isCandidateUsed(rumorOptionDraft, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
        return rumorOptionDraft;
      }
    }

    if (/trade|barter|deal|price|merchant|buy|sell|offer/.test(qType) || hasTradeConcept) {
      const opt = qOpts.find((o) => !exhausted.has(norm(o)));
      const tradeDraft: ChoiceDraft = {
        id: 'ctx_answer_trade',
        label: opt ? truncateText(opt, 42) : 'Let’s strike a fair trade.',
        prompt: opt
          ? `About your trade offer—let's go with "${opt}".`
          : qTopic
            ? `I'm interested in trading for ${qTopic}—what is your price?`
            : 'Yes, let us make a fair trade—what do you have in mind?',
        tone: 'contextual',
        action: 'talk',
        topicKey: 'trade_answer',
      };
      if (!isCandidateUsed(tradeDraft, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
        return tradeDraft;
      }
    }

    if (/rumor|gossip|news|whisper|heard/.test(qType)) {
      const opt = qOpts.find((o) => !exhausted.has(norm(o)));
      const rumorDraft: ChoiceDraft = {
        id: 'ctx_answer_rumor',
        label: opt ? truncateText(opt, 42) : 'I heard whispers too—tell me more.',
        prompt: opt
          ? `About that rumor—${opt}. What do you know?`
          : qTopic
            ? `I heard rumors about ${qTopic} around the island—is it true?`
            : 'Yes, I caught wind of those rumors—what really happened?',
        tone: 'contextual',
        action: 'talk',
        topicKey: 'rumor_answer',
      };
      if (!isCandidateUsed(rumorDraft, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
        return rumorDraft;
      }
    }

    if (
      /crisis|danger|threat|blight|storm|monster|trouble|problem/.test(qType) ||
      (qTopic && ctx.loreTopics.crisis && norm(qTopic).includes('crisis'))
    ) {
      const crisisSolution: ChoiceDraft = {
        id: 'ctx_solve_crisis',
        label: qTopic ? `How do we stop ${truncateText(qTopic, 24)}?` : 'How can we stop the crisis?',
        prompt: qTopic
          ? `How can we stop ${qTopic} before things get worse?`
          : 'How do we stop this crisis and make the island safe again?',
        tone: 'contextual',
        action: 'talk',
        topicKey: 'crisis_solution',
      };
      if (!isCandidateUsed(crisisSolution, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
        return crisisSolution;
      }
    }

    for (let i = 0; i < qOpts.length; i += 1) {
      const opt = qOpts[i];
      if (opt === 'ITEM' || opt === 'RUMOR') continue;
      const optDraft: ChoiceDraft = {
        id: `ctx_option_${i}`,
        label: opt === 'YES' ? 'Yes, agreed.' : opt === 'NO' ? 'No, I do not think so.' : truncateText(opt, 44),
        prompt: opt === 'YES' ? 'Yes, I agree.' : opt === 'NO' ? 'No, I disagree.' : opt,
        tone: 'contextual',
        action: 'talk',
      };
      if (!isCandidateUsed(optDraft, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
        return optDraft;
      }
    }

    if (qTopic && norm(qTopic) !== 'player_intent' && norm(qTopic) !== 'motive' && !exhausted.has(norm(qTopic))) {
      const topicDraft: ChoiceDraft = {
        id: `ctx_topic_${norm(qTopic).replace(/[^a-z0-9]+/g, '_')}`,
        label: `More about ${truncateText(qTopic, 28)}`,
        prompt: `You brought up ${qTopic}—tell me what else I should know.`,
        tone: 'contextual',
        action: 'talk',
        topicKey: norm(qTopic),
      };
      if (!isCandidateUsed(topicDraft, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
        return topicDraft;
      }
    }
  }

  // 3. Concept-driven follow-ups from lastConceptSeq (crisis 2-hop, trade, rumor)
  if (hasCrisisConcept || (ctx.lastConceptSeq.length > 0 && ctx.loreTopics.crisis)) {
    const crisisText = ctx.loreTopics.crisis?.trim();
    const crisisSolution: ChoiceDraft = {
      id: 'ctx_solve_crisis',
      label: 'How do we stop this crisis?',
      prompt: crisisText
        ? `How can we stop ${crisisText} for good?`
        : 'How can we stop this crisis and protect the island?',
      tone: 'contextual',
      action: 'talk',
      topicKey: 'crisis_solution',
    };
    if (!isCandidateUsed(crisisSolution, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
      return crisisSolution;
    }
  }

  if (hasTradeConcept) {
    const tradeFollowup: ChoiceDraft = {
      id: 'ctx_answer_trade',
      label: 'Let’s talk trade.',
      prompt: 'What price or barter do you have in mind for a trade?',
      tone: 'contextual',
      action: 'talk',
      topicKey: 'trade_answer',
    };
    if (!isCandidateUsed(tradeFollowup, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
      return tradeFollowup;
    }
  }

  if (hasRumorConcept && ctx.loreTopics.rumor) {
    const rumorFollowup = makeLoreChoice('rumor', ctx.loreTopics.rumor);
    if (!isCandidateUsed(rumorFollowup, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
      return rumorFollowup;
    }
  }

  // 3b. Diegetic Gift Hint topic once rapport reaches >= 1 heart
  const giftHintPick = canOfferGiftHint(ctx, exhausted, chosenIds, chosenLabels, chosenPrompts);
  if (giftHintPick) {
    return giftHintPick;
  }

  // 4. Unexplored lore topic
  const lorePick = pickUnusedLore(ctx, SLOT1_LORE_ORDER, exhausted, chosenIds, chosenLabels, chosenPrompts);
  if (lorePick) {
    return lorePick;
  }

  // 5. Turn-indexed contextual fallback
  const fallbacks: ChoiceDraft[] = [
    {
      id: 'ctx_fallback_work',
      label: 'How are you doing today?',
      prompt: 'How are you doing today? Keeping busy around here?',
      tone: 'contextual',
      action: 'talk',
    },
    {
      id: 'ctx_fallback_surroundings',
      label: 'Seen anything strange nearby?',
      prompt: 'Have you spotted anything unusual around the island today?',
      tone: 'contextual',
      action: 'talk',
    },
    {
      id: 'ctx_fallback_reflect',
      label: 'What else is on your mind?',
      prompt: 'What else has been on your mind lately?',
      tone: 'contextual',
      action: 'talk',
    },
  ];

  for (let offset = 0; offset < fallbacks.length; offset += 1) {
    const pick = fallbacks[(ctx.turnIndex + offset) % fallbacks.length];
    if (!isCandidateUsed(pick, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
      return pick;
    }
  }

  return {
    id: `ctx_turn_${ctx.turnIndex}`,
    label: 'Tell me more.',
    prompt: `Go on, ${ctx.npcName || 'friend'}—I'm listening. (Turn ${ctx.turnIndex + 1})`,
    tone: 'contextual',
    action: 'talk',
  };
}

function buildRelationshipSlot2(
  ctx: ChoiceGenContext,
  exhausted: Set<string>,
  chosenIds: Set<string>,
  chosenLabels: Set<string>,
  chosenPrompts: Set<string>,
): ChoiceDraft | null {
  const npcText = ctx.npcName?.trim() || 'friend';

  const friendlyPool: ChoiceDraft[] = [
    {
      id: 'lever_friendly_help',
      label: 'Can I help out around here?',
      prompt: `You work hard around here, ${npcText}—let me help if you need a hand.`,
      tone: 'friendly',
      action: 'talk',
    },
    {
      id: 'lever_friendly_compliment',
      label: "You're doing great work here.",
      prompt: `You're doing great work here, ${npcText}—this whole island runs smoother thanks to you.`,
      tone: 'friendly',
      action: 'talk',
    },
    {
      id: 'lever_friendly_checkin',
      label: 'How are you holding up?',
      prompt: `How are you really holding up with everything going on around the island, ${npcText}?`,
      tone: 'friendly',
      action: 'talk',
    },
    {
      id: 'lever_friendly_trust',
      label: 'You can always count on me.',
      prompt: `No matter what hits the island next, ${npcText}, you've got an ally in me.`,
      tone: 'friendly',
      action: 'talk',
    },
  ];

  const boldPool: ChoiceDraft[] = [
    {
      id: 'lever_bold_motive',
      label: "What aren't you telling me?",
      prompt: `Wait—you're holding something back, ${npcText}. What's the real motive here?`,
      tone: 'bold',
      action: 'talk',
    },
    {
      id: 'lever_bold_press',
      label: 'Skip the small talk.',
      prompt: `Let's drop the pleasantries—what do you actually want out of this?`,
      tone: 'bold',
      action: 'talk',
    },
    {
      id: 'lever_bold_probe',
      label: 'Who are you protecting?',
      prompt: `You seem awfully careful around that topic—who are you trying to protect?`,
      tone: 'bold',
      action: 'talk',
    },
    {
      id: 'lever_bold_challenge',
      label: "Your story doesn't add up.",
      prompt: `Hold on, ${npcText}—something about that doesn't quite add up. Explain.`,
      tone: 'bold',
      action: 'talk',
    },
  ];

  const guarded = isGuardedStance(ctx.stance, ctx.mood);
  const warm = isWarmStance(ctx.stance, ctx.hearts, ctx.mood);

  // Alternate friendly vs bold as turnIndex evolves; guarded/low-heart starts bold on turn 0 to contrast Slot 1 apology/lore,
  // while neutral/warm starts friendly on turn 0 and probes bold on turn 1.
  const preferBold = guarded || ctx.hearts <= 0 ? ctx.turnIndex % 2 === 0 : ctx.turnIndex % 2 === 1;
  const primaryPool = preferBold ? boldPool : friendlyPool;
  const secondaryPool = preferBold ? friendlyPool : boldPool;

  const startIdx = Math.floor(Math.max(0, ctx.turnIndex) / 2);
  const pools = warm && ctx.turnIndex >= 2 ? [secondaryPool, primaryPool] : [primaryPool, secondaryPool];

  for (const pool of pools) {
    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[(startIdx + i) % pool.length];
      if (!isCandidateUsed(candidate, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
        return candidate;
      }
    }
  }

  return null;
}

function buildWorldActionSlot3(
  ctx: ChoiceGenContext,
  exhausted: Set<string>,
  chosenIds: Set<string>,
  chosenLabels: Set<string>,
  chosenPrompts: Set<string>,
): ChoiceDraft | null {
  // Priority 1: Deterministic Quest offer/complete
  if (ctx.questAction) {
    const isComplete = ctx.questAction.kind === 'complete';
    const questDraft: ChoiceDraft = {
      id: isComplete ? 'world_quest_complete' : 'world_quest_offer',
      label: ctx.questAction.label,
      prompt: isComplete
        ? 'I finished everything you asked for—let us wrap up this quest.'
        : 'Tell me what needs doing—I will take on this task.',
      tone: 'quest',
      primary: true,
      action: 'quest',
    };
    if (!chosenIds.has(norm(questDraft.id)) && !chosenLabels.has(norm(questDraft.label))) {
      return questDraft;
    }
  }

  // Priority 2: Claim Secret if unlocked and not yet claimed
  if (ctx.secretUnlocked && !ctx.secretClaimed) {
    const secretDraft: ChoiceDraft = {
      id: 'world_claim_secret',
      label: 'Ask about their secret',
      prompt: `We trust each other now, ${ctx.npcName || 'friend'}—tell me the secret you have kept.`,
      tone: 'secret',
      primary: true,
      action: 'secret',
      topicKey: 'secret',
    };
    if (!isCandidateUsed(secretDraft, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
      return secretDraft;
    }
  }

  // Priority 3: Gift carried/held item if not gifted today
  if (!ctx.giftedToday && ctx.giftCandidate) {
    const reactionSuffix =
      ctx.knownGiftReaction === 'loved'
        ? ' (♥)'
        : ctx.knownGiftReaction === 'liked'
          ? ' (+)'
          : ctx.knownGiftReaction === 'disliked'
            ? ' (!)'
            : '';
    const giftDraft: ChoiceDraft = {
      id: `world_gift_${ctx.giftCandidate.itemId}`,
      label: `Gift ${ctx.giftCandidate.itemName}${reactionSuffix}`,
      prompt: `Here—I brought this ${ctx.giftCandidate.itemName} for you.`,
      tone: 'gift',
      action: 'gift',
      giftItemId: ctx.giftCandidate.itemId,
    };
    if (!isCandidateUsed(giftDraft, exhausted, chosenIds, chosenLabels, chosenPrompts)) {
      return giftDraft;
    }
  }

  // Priority 4: Diegetic Gift Hint if unlocked and not yet asked
  const giftHintPick = canOfferGiftHint(ctx, exhausted, chosenIds, chosenLabels, chosenPrompts);
  if (giftHintPick) {
    return giftHintPick;
  }

  // Priority 5: Unexplored Lore / Rumor topic
  const lorePick = pickUnusedLore(ctx, SLOT3_LORE_ORDER, exhausted, chosenIds, chosenLabels, chosenPrompts);
  if (lorePick) {
    return lorePick;
  }

  return null;
}

function buildLeaveChoice(ctx: ChoiceGenContext): ChoiceDraft {
  const guarded = isGuardedStance(ctx.stance, ctx.mood);
  return {
    id: 'leave',
    label: guarded ? 'I should head out.' : 'Take care.',
    prompt: guarded ? 'I should get going. Watch yourself.' : 'Take care—I will catch up with you later.',
    tone: 'leave',
    action: 'leave',
  };
}

function stripDraft(draft: ChoiceDraft): GeneratedChoice {
  const out: GeneratedChoice = {
    id: draft.id,
    label: draft.label,
    prompt: draft.prompt,
    tone: draft.tone,
  };
  if (draft.primary !== undefined) out.primary = draft.primary;
  if (draft.action !== undefined) out.action = draft.action;
  if (draft.giftItemId !== undefined) out.giftItemId = draft.giftItemId;
  return out;
}

/**
 * Generates between 2 and 4 deterministic Fallout-style dialogue choices
 * tailored to NPC stance, hearts, active quest/gift/secret state, and turn history.
 */
export function generateFalloutChoices(ctx: ChoiceGenContext): GeneratedChoice[] {
  const exhausted = buildExhaustedSet(ctx);
  const chosenIds = new Set<string>();
  const chosenLabels = new Set<string>();
  const chosenPrompts = new Set<string>();
  const drafts: ChoiceDraft[] = [];

  const record = (draft: ChoiceDraft): void => {
    drafts.push(draft);
    chosenIds.add(norm(draft.id));
    chosenLabels.add(norm(draft.label));
    chosenPrompts.add(norm(draft.prompt));
  };

  // Slot 1: Contextual Follow-Up
  const slot1 = buildContextualSlot1(ctx, exhausted, chosenIds, chosenLabels, chosenPrompts);
  record(slot1);

  if (ctx.isMerchant) {
    const shopDraft = buildMerchantShopDraft(ctx);
    const slot3World = buildWorldActionSlot3(ctx, exhausted, chosenIds, chosenLabels, chosenPrompts);
    const hasHighPriorityWorldAction = Boolean(
      slot3World &&
        (slot3World.action === 'quest' ||
          slot3World.action === 'secret' ||
          slot3World.action === 'gift'),
    );

    if (hasHighPriorityWorldAction && slot3World) {
      record(shopDraft);
      record(slot3World);
    } else {
      const slot2 = buildRelationshipSlot2(ctx, exhausted, chosenIds, chosenLabels, chosenPrompts);
      if (slot2) {
        record(slot2);
      }
      record(shopDraft);
    }
  } else {
    // Slot 2: Tone / Relationship Lever
    const slot2 = buildRelationshipSlot2(ctx, exhausted, chosenIds, chosenLabels, chosenPrompts);
    if (slot2) {
      record(slot2);
    }

    // Slot 3: World / Stardew Action
    const slot3 = buildWorldActionSlot3(ctx, exhausted, chosenIds, chosenLabels, chosenPrompts);
    if (slot3) {
      record(slot3);
    }
  }

  // Slot 4: Pivot (on turn 0-1 if we have fewer than 3 non-leave options) + guaranteed Leave
  if (ctx.turnIndex <= 1 && drafts.length < 3) {
    const pivot = pickUnusedLore(ctx, SLOT3_LORE_ORDER, exhausted, chosenIds, chosenLabels, chosenPrompts);
    if (pivot) {
      record(pivot);
    }
  }

  // Ensure at least 1 non-leave choice + 1 leave choice (>= 2 total) and <= 4 total
  const leave = buildLeaveChoice(ctx);
  const boundedNonLeave = drafts.slice(0, 3);

  // Guard against any accidental collision with leave label/prompt
  const finalChoices = boundedNonLeave.filter(
    (c) => norm(c.label) !== norm(leave.label) && norm(c.prompt) !== norm(leave.prompt),
  );
  if (finalChoices.length === 0) {
    finalChoices.push(slot1);
  }
  finalChoices.push(leave);

  return finalChoices.slice(0, 4).map(stripDraft);
}
