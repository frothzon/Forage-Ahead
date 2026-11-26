import type { PersonaSpec } from './cogniwsp/data/personas.js';

export type ForagePersonaKey =
  | 'farmer'
  | 'fisherman'
  | 'blacksmith'
  | 'alchemist'
  | 'family'
  | 'vagabond'
  | 'merchant';

export const FORAGE_PERSONA_KEYS: readonly ForagePersonaKey[] = Object.freeze([
  'farmer',
  'fisherman',
  'blacksmith',
  'alchemist',
  'family',
  'vagabond',
  'merchant',
]);

export interface ForagePersona extends PersonaSpec {
  readonly key: ForagePersonaKey;
}

export const FORAGE_PERSONAS: Readonly<Record<ForagePersonaKey, ForagePersona>> = Object.freeze({
  farmer: {
    key: 'farmer',
    name: 'Homesteader',
    emoji: '🌾',
    lexicon: {
      GREET_WARM:
        "Pull up a hay bale and rest your boots, friend|Well met under sunny skies — glad to see a {c:#7ef29d}kind face{/c} by the garden|Come on in from the fields, traveler; the cider's fresh",
      GREET_GUARDED:
        "Mind the sprout rows as you step up — what brings you by?|Easy around the berry bushes, stranger; what do you need?|Got my hoe in hand and chores waiting, so speak plain",
      GREET_HOSTILE:
        "You've got nerve trampling back onto my soil after that|Say your piece from the fence and keep walking|No fresh harvest or warm cider for folks who cause trouble",
      GREET_BACK:
        "Back by the garden gate again, eh|Thought I heard boots along the clover path|Welcome back to the patch, friend",
      SELF_INTRO: "Folks across the pasture call me|Name's|Around this homestead I'm known as",
      ROLE_LINK: "tending the land as|keeping the harvest steady as|working the loam as",
      PLACE_INTRO: "You're standing right in|This patch of green is|Welcome to",
      PLACE_DESCRIBE:
        "Rich dark soil, humming bees, and rows of {c:#7ef29d}bright sprouts{/c}|Quiet timber fences and warm lanterns once dusk settles|Every good stew in the valley starts from soil like this",
      RULER_OPENER:
        "If you mean who looks after order around here, that's|Folks across the islands answer to|The ones keeping the lantern-posts lit are",
      RULER_OPINION_POS:
        "keeps the bridges mended and the harvest carts rolling|fair-minded when the rain ruins a crop|gives honest growers room to breathe",
      RULER_OPINION_NEG:
        "counts every bushel of turnips like gold and never touches a spade|quick with taxes, slow when fences break|forgets who actually tills the dirt",
      CRISIS_OPENER:
        "Whole homestead's fretting over|Can't weed a furrow without hearing about|What's threatening the harvest right now is",
      CRISIS_IMPACT:
        "Tramples the seedlings and sends the chickens fluttering into the barn|Keeps folk bolting their shutters before twilight|Leaves the fields bare and every cellar half-empty",
      CRISIS_URGENCY:
        "Won't be long before the frost or critters ruin what's left|Every sunrise we wait costs another row of crops|Time's slipping fast like dry seed through fingers",
      ITEM_OPENER:
        "If you need something sturdy for the fields, look to|Best tool on the whole island is|What really earns its keep out here is",
      ITEM_PITCH:
        "Worth a wagonload of {c:#ffe066}golden grain{/c} in steady hands|Turns hard ground into a thriving garden in no time|A true homesteader's blessing when trouble sprouts",
      ITEM_GUARDED:
        "I don't loan out my prize barn gear to every passerby|Earn a bit of trust before eyeing what's in my shed|Keep your hands out of the seed bins until we know each other",
      RIVAL_OPENER:
        "Keep a sharp eye on the treeline for|Nothing ruins a peaceful morning faster than|If mischief shows up by the fences, blame",
      RIVAL_GRUDGE:
        "Knocked over my scarecrows and pilfered ripe berries without shame|Been sneaking onto honest plots for weeks|Never planted a seed in their life, only tramples others'",
      RIVAL_WARNING:
        "Cross them empty-handed and you'll regret it|Keep a stout tool close if they're lurking nearby|Don't turn your back when their shadow crosses the grass",
      SECRET_WHISPER:
        "Step behind the potting shed and keep your voice low|Alright, you've earned a farmer's trust — listen close|Just between homesteaders, lean in near the lantern",
      SECRET_REVEAL_LEAD: "the quiet truth is|here's what's tucked away:|between you and me,",
      SECRET_REFUSE:
        "Some seeds stay locked in the root cellar|Nice try, traveler, but I keep my barn secrets tight|I don't spill family hiding spots to strangers",
      RUMOR_OPENER:
        "Heard two crows and a neighbor muttering that|Word carried over the meadow fence is|Don't swear by it, but folks down the path say",
      RUMOR_TAG:
        "Take it with a pinch of hearth salt|Could be wind in the wheat, could be true|Half the gossip in the valley sprouts from something real",
      HELP_GRATITUDE:
        "Now that's {c:#7ef29d}{bounce}music to a tired grower's ears{/bounce}{/c}|Bless you for lending steady hands to the patch|Always grateful when someone cares for the land",
      HELP_DIRECTIVE:
        "Put your shoulder behind clearing the main threat first|Head straight for the trouble before it spreads to the crops|Watch the path and keep your lantern bright",
      HELP_SUSPICIOUS:
        "Mighty generous offer from someone I barely know|Nobody weeds another's field for nothing — what's your angle?|I'll believe your good intentions when the work is done",
      COMPLIMENT_REACT:
        "Aw, shucks — you'll make an old grower beam like a {c:#ffe066}sunflower{/c}|Kind words mean more than shiny coin out here|Glad you like how the garden's coming along",
      COMPLIMENT_WARMTH:
        "Always got a basket of berries for gentle company!|Folks with manners like yours are always welcome by my porch!|Makes a long day of hoeing feel mighty light!",
      COMPLIMENT_TAIL: "keep that good spirit growing|hope the harvest favors you|glad you stopped by",
      THREAT_DEFIANT:
        "Wave threats in my yard and you'll taste {jiggle}oak-handled pitchfork{/jiggle}|Bark all you like — I've chased wilder beasts off my corn|You picked the wrong homestead to bully",
      THREAT_FEARFUL:
        "Whoa now — keep that blade away from the crops, please|Easy there, friend — no need for blood on the clover|Hold on, let's talk calm before anyone gets hurt",
      THREAT_WARN_RIVAL:
        "Talk like that makes you sound just like|Pulling stunts like that puts you in league with|That's the exact rotten manners I expect from",
      FAREWELL_WARM:
        "Fair weather on the trail ahead, friend|Mind the twilight, and stop by whenever your pack's light|May your boots stay dry and your fields stay {c:#7ef29d}green{/c}",
      FAREWELL_COLD:
        "Gate's right behind you — stick to the road|Off with you now; I've chores to tend|Best be moving along before I fetch the sheepdog",
      MOOD_GOOD:
        "Feeling bright as morning dew on fresh lettuce|Sun's warm, soil's damp — can't ask for much better|Spirits are high and the hearth kettle's singing",
      MOOD_TENSE:
        "Got a knot in my shoulders from watching the treeline|Hard to sleep easy with trouble prowling near the barn|Nerves are stretched taut as fence wire today",
      MOOD_ANGRY:
        "My patience is drier than last summer's straw|Not in the mood for crooked games today|One more sour word and you're barred from this patch",
      CUSTOM_LORE_LEAD:
        "If it's old valley wisdom you're after, listen up:|Granddad carved this truth on the barn beam:|Funny you ask — every grower here learns:",
      FALLBACK_MUSE:
        "Hmm, let me lean on my hoe and chew on that|Can't say I caught every seed of what you meant|You've got a roundabout way of speaking, friend",
      FALLBACK_DEFLECT:
        "Let's keep our talk rooted in what matters around the homestead|No sense chasing clouds when there's soil to turn|Plain country talk suits me best",
      FALLBACK_PROMPT: "so tell me what brings you down the lane|what's really sprouting in your thoughts|speak plain with me",
      ASK_BACK_OPEN:
        "What brings your boots up to my garden gate today?|Looking to lend a hand, or just taking in the meadow air?|What's on your mind, traveler?",
      ASK_BACK_TRADE:
        "Are you looking for sturdy gear, or eager to hear local rumors?|Need to talk items, or hungry for valley rumors?|Want to inspect my goods, or swap local rumors?",
      SECRET_HINT:
        "Lend a steady hand around the patch and maybe I'll share what's under the porch|There's a quiet secret in these soil beds, though not for strangers|Earn a grower's trust, and I'll unlatch the cellar door",
      ACK_NEGATED_THREAT:
        "Whew, glad to hear you mean no harm to the patch|Good — I'll set the pitchfork back against the barn|No trouble meant, no trouble taken",
      ACK_PLAYER_NAME: "Good to put a name to a friendly face,|I'll remember that name at harvest time,|Well met then,",
      CALLOUT_STANCE_CONTRADICTION:
        "Hold on — you were barking threats a moment ago, and now you're sweet as honey|Don't butter me up right after stomping on my peace|Your tune shifted quicker than spring hail",
      CALLOUT_IDENTITY_CONTRADICTION:
        "Wait a second — you gave me a different name earlier|My memory's sharper than an old rooster's: you used another name before|Pick one honest name if you want to share my porch",
      CALLOUT_FACT_CONTRADICTION:
        "Now I know you're spinning tall tales — any farmer can see that's untrue|Don't tell me weeds are wheat when I planted the row myself|That goes straight against plain daylight facts",
      ALREADY_TOLD_CALLBACK:
        "Like I just told you by the fence,|Didn't we just go over that furrow? Still,|Listen close so I don't wear my voice thin:",
      UNKNOWN_CONCEPT_REACT:
        "Never seen a seed or beast called|You lost me completely at|What in the wide meadow is",
      DIRECT_ANSWER_YES:
        "Splendid — then we're of one mind|Good to hear; let's get to work|Right then, steady as she grows",
      DIRECT_ANSWER_NO:
        "Fair enough — no harm leaving it alone|Suit yourself, friend|Alright, we'll let that furrow lie fallow",
      APOLOGY_ACCEPT:
        "Alright, rain washes dust clean — let's start fresh|Apology heard; just mind the seedlings next time|Fair enough, water under the footbridge",
      APOLOGY_REJECT:
        "Sorry doesn't mend a broken fence on its own|Words come cheap after trampling trust|You'll need honest deeds before I soften up",
      HYPOTHETICAL_EVAL:
        "Suppose you tried that, the whole meadow'd feel the ripple|If that came to pass, better keep a sturdy shovel handy|Hard to predict the weather on a gamble like that",
      RIVAL_VICTIM_SYMPATHY:
        "They gave you grief too? Rotten scoundrels|Sounds like we share the same thorn in our boots|If they picked a fight with you, we stand on the same fence line",
      PROBE_MOTIVE:
        "So what's your real reason for asking?|Who sent you poking around the patch?|What are you hoping to dig up here?",
      INSULT_PUSHBACK:
        "Keep a civil tongue near my porch|Talk like that belongs in a pigsty, not my garden|I've heard sharper crowing from a fencepost",
      ACCUSATION_DEFEND:
        "Don't pin that mess on honest dirt and hard work|Check the tracks before pointing a finger at my barn|I had no part in that mischief, and I won't take the blame",
      HOP2_SOLUTION_LINK:
        "If you want the right remedy to counter that threat, reach for|Only one thing I know stands strong against it:|Your best bet for putting an end to it is",
      CONFIRM_PROMISE:
        "I'll hold you to that handshake, friend|A farmer's word is planted deep — don't break it|Good — I'll remember you promised",
      CLARIFY_EXPLAIN:
        "Let me lay it out plain as fence posts:|To put it simple,|Here's the clean truth of it:",
      META_DEFLECT:
        "Speak plain, traveler — that sounds like moon-calf gibberish|Did a slime bounce off your noggin?|Save the strange riddles and talk like real folk",
      STOP_REPEATING:
        "You're walking the same furrow in circles|We already plowed that ground — ask something fresh|Stop repeating yourself so we can get chores done",
      BOUNDARY_REFUSE:
        "That gate stays latched — no|Not happening, friend; drop it|Ask till the cows come home and the answer's still no",
    },
  },

  fisherman: {
    key: 'fisherman',
    name: 'Old Salt',
    emoji: '🎣',
    lexicon: {
      GREET_WARM:
        "Ahoy there, matey — pull up a crate by the pilings|Fair winds to you, traveler; the {c:#7ef29d}tide's gentle{/c} today|Glad to spot a friendly sail coming up the pier",
      GREET_GUARDED:
        "Watch your boots on the wet planks and state your business|Ahoy, stranger — don't spook the fish; what brings you?|Hands clear of my tackle box — what'll it be?",
      GREET_HOSTILE:
        "Got salt for brains showing up on my dock again|Say your piece fast before I cut your mooring line|Don't expect a single minnow or smile from this pier",
      GREET_BACK:
        "Back on the boardwalk already, eh|Tide keeps washing you back to my dock|Ahoy again — still got your sea legs?",
      SELF_INTRO: "Old hands along the harbor call me|Name's|Folks on the pier know me as",
      ROLE_LINK: "mending nets and lines as|watching the swells as|casting out as",
      PLACE_INTRO: "You're standing at the edge of|These salt-kissed planks belong to|Welcome ashore at",
      PLACE_DESCRIBE:
        "Creaking timber, bobbing traps, and gulls eyeing every bucket|Smells of sea brine, cedar smoke, and fresh catch|Every drift-bottle in the archipelago washes past this dock sooner or later",
      RULER_OPENER:
        "If you're asking who commands the harbor buoys, that's|Folks out on these waters answer to|The ones steering the island charters are",
      RULER_OPINION_POS:
        "keeps the lighthouses trimmed and the coves clear of pirates|steady at the helm when squalls roll in|fair to honest boaters",
      RULER_OPINION_NEG:
        "taxes every haul twice before the fish even hit the ice|all brass buttons and zero sea sense|never baited a hook in their life",
      CRISIS_OPENER:
        "Every sailor on the quay is muttering about|Can't cast a bobber without spotting signs of|What's churning the waters dark right now is",
      CRISIS_IMPACT:
        "Scares the shoals deep and keeps skiffs tied fast to the pilings|Leaves nets torn and harbor folk peering through the fog|Turns calm fishing coves treacherous after sundown",
      CRISIS_URGENCY:
        "Storm clouds are banking fast on the horizon|Wait too long and the tide'll wash us right off the jetty|Only a thin window left before high water breaks",
      ITEM_OPENER:
        "If you're fishing for something worth its weight in pearls, look to|Best piece of kit along the coast is|What every sharp sailor hopes to haul up is",
      ITEM_PITCH:
        "More precious than {c:#ffe066}sunken gold{/c} when the deep stirs|Could hook victory out of choppy waters|Not something you snag in any shallow puddle",
      ITEM_GUARDED:
        "I don't pop open my sea-chest for every landlubber|Prove you've got sturdy sea legs before eyeing my best gear|Hands off my rods until I know I can trust you",
      RIVAL_OPENER:
        "Keep a weather eye out for|Bad tides always carry the stink of|If your traps come up slashed, blame",
      RIVAL_GRUDGE:
        "Snipped my best crab lines and laughed from the rocks|Been poaching these coves for longer than I care to spit at|All barnacles and no honor",
      RIVAL_WARNING:
        "Sail near them unprepared and you'll end up shark bait|Keep an oar ready if they surface near the pier|Never turn your stern when their name's on the wind",
      SECRET_WHISPER:
        "Step out to the end of the jetty where the waves drown our voices|Alright, you're true crew — don't breathe this to the gulls|Since I trust your compass, listen low",
      SECRET_REVEAL_LEAD: "the deep-water truth is|here's what lies below the tide:|just between shipmates,",
      SECRET_REFUSE:
        "That sea-chart stays rolled in oiled leather|Nice cast, matey, but my lines stay tight on that|I don't drop anchor secrets for untested strangers",
      RUMOR_OPENER:
        "Two deckhands by the lantern swore that|Drifted in on the tide-talk that|Could be harbor mist, but old salts whisper that",
      RUMOR_TAG:
        "Take it with a dash of sea brine|Half the tall tales on a dock float on truth|Weigh the wind before setting sail on it",
      HELP_GRATITUDE:
        "Ha! {c:#7ef29d}{bounce}That warms an old angler's heart{/bounce}{/c}|Bless your sturdy oars, matey — always welcome a hand|Good to sail alongside someone with grit",
      HELP_DIRECTIVE:
        "Set your course straight for the heart of the squall|Cut off the threat before it fouls every cove|Keep your bobber steady and strike sharp",
      HELP_SUSPICIOUS:
        "Free crew usually wants half the haul later|What's your share, stranger? Nobody rows out in a gale for air|I'll trust your knot-tying when I see the catch",
      COMPLIMENT_REACT:
        "Hah! Flattery smooths rougher waves than whale oil|Much obliged, matey — been tying knots since I was knee-high|Aw, you'll have this old salt grinning like a {c:#ffe066}sunlit koi{/c}",
      COMPLIMENT_WARMTH:
        "Always room by my pier lantern for decent crew!|You're steady as oak planking in my logbook!|Makes a misty watch pass mighty quick!",
      COMPLIMENT_TAIL: "may fair winds fill your sails|we'll haul in plenty together|glad you dropped anchor here",
      THREAT_DEFIANT:
        "Try swinging on my dock and you'll swim home with crabs in your boots|Empty thunder — I've weathered {jiggle}krakens{/jiggle} meaner than you|Back off the planks before I heave you in the brine",
      THREAT_FEARFUL:
        "Whoa, easy! Keep that steel away from my ropes|Hold hard, matey — no need to stain the dock red|Stand down now; calm waters serve us both better",
      THREAT_WARN_RIVAL:
        "Bare your teeth like that and you're no better than|Pulling dirty boarding tricks just like|Sounds like you're sailing under the flag of",
      FAREWELL_WARM:
        "Fair winds and {c:#7ef29d}full nets{/c} to you, friend|Keep dry boots on your next crossing, matey|Come back to the pier whenever the tide turns gentle",
      FAREWELL_COLD:
        "Gangplank's behind you — shove off|Sail on then; I've hooks to sharpen|Clear the dock before I untie your skiff",
      MOOD_GOOD:
        "Waters are glassy and the fish are practically jumping in the bucket|Feeling right as a fresh sea breeze today|Spirits are buoyant and the kettle's whistling",
      MOOD_TENSE:
        "Barometer's dropping in my old knees today|Too many dark fins circling the cove to rest easy|Got a storm-knot twisted tight in my gut",
      MOOD_ANGRY:
        "My patience is leaking faster than a rotted hull|Not in the mood for landlubber games|Push me one step further and you're walking the plank",
      CUSTOM_LORE_LEAD:
        "Want a scrap of old sea-dog lore? Listen close:|Old skippers etched this onto the lighthouse stone:|Funny you ask — every sailor learns:",
      FALLBACK_MUSE:
        "Hmm, let me reel that line back and examine the bait|Your drift slipped past me a bit there, matey|Say again? Wind took half your words out to sea",
      FALLBACK_DEFLECT:
        "Let's steer back to real waters and solid planks|No use chasing phantom buoys in the fog|Keep your talk anchored to these islands",
      FALLBACK_PROMPT: "so tell me what course you're charting|what catch are you truly after|give it to me straight",
      ASK_BACK_OPEN:
        "What tide carried your boots onto my pier today?|Chasing a big catch or just watching the swells?|What brings you down to the waterline?",
      ASK_BACK_TRADE:
        "Looking to talk fishing gear, or hungry for harbor rumors?|Want to hear about fine items, or swap dockside rumors?|Tackle and items, or salty rumors — pick your course?",
      SECRET_HINT:
        "Stick with me through fair weather and foul, and maybe I'll show you what's sunk below|Some chests stay weighted under the pier until trust floats 'em up|Prove you're loyal crew, and I'll share the hidden chart",
      ACK_NEGATED_THREAT:
        "Whew, glad we're keeping the gaff hook stowed|Good to hear; peaceful waters suit me best|Fair enough — false squall cleared",
      ACK_PLAYER_NAME: "I'll carve that name into the pier post,|Logbook updated — good to meet you,|Fair winds then,",
      CALLOUT_STANCE_CONTRADICTION:
        "Hold hard — you were threatening to sink me a minute ago, now you're singing sweet|Don't whistle fair winds right after raising a storm|Your compass needle just spun backwards, matey",
      CALLOUT_IDENTITY_CONTRADICTION:
        "Belay that — you hailed me under a different name earlier|An old salt never forgets a ship's name: you gave another before|Two names in one voyage smells like a smuggler's trick",
      CALLOUT_FACT_CONTRADICTION:
        "That's pure sea-foam — goes dead against what's bobbing in plain sight|Don't tell an angler the sea's bone dry while waves soak his boots|Your chart doesn't match the real coastline at all",
      ALREADY_TOLD_CALLBACK:
        "Already tossed you that line a moment ago,|Didn't we just haul that net? Still,|Listen tight before the waves drown it out:",
      UNKNOWN_CONCEPT_REACT:
        "Never caught wind nor fin of|Lost my bearings completely at|What kind of odd sea-beast is",
      DIRECT_ANSWER_YES:
        "Aye — full sail ahead|Sound choice, matey; locked in|Good — let's haul together",
      DIRECT_ANSWER_NO:
        "Aye, fair enough — we'll drop anchor on that|Suit yourself, skipper|Right then, leaving that reef untouched",
      APOLOGY_ACCEPT:
        "Alright, rough seas settle eventually — let's clear the deck|Apology logged; keep your oars straight from here|Fair enough, matey; we'll sail cleaner",
      APOLOGY_REJECT:
        "Sorry doesn't patch a stove-in hull|Empty words after fouling the waters|Show me steady deeds before I trust your rigging",
      HYPOTHETICAL_EVAL:
        "Try a maneuver like that and you might catch a gale head-on|On calm seas it works; in a squall it flips the skiff|Bold chart to plot — better pack extra rope",
      RIVAL_VICTIM_SYMPATHY:
        "They swiped at you too? Bilge rats|Sounds like we're dodging the same crooked reef|If they crossed your bow, you've got an ally on this dock",
      PROBE_MOTIVE:
        "So why are you sounding these depths?|Who put you up to charting this cove?|What treasure are you really angling for?",
      INSULT_PUSHBACK:
        "Mind your tongue on my planks|Keep squawking like a gull and I'll toss you off the end|Weak jab for someone standing at high tide",
      ACCUSATION_DEFEND:
        "Don't blame my nets for your own tangle|Check the wake before pointing fingers at this pier|My hands are clean as sea salt — look elsewhere",
      HOP2_SOLUTION_LINK:
        "If you want the exact gear to haul down that menace, grab|Only one rig cuts clean through trouble like that:|Your sharpest counter out there is",
      CONFIRM_PROMISE:
        "An oath on salt water holds fast — don't break it|I'll hold your line to that promise, matey|Good — knotted tight in memory",
      CLARIFY_EXPLAIN:
        "Let me chart it simple for you:|Plain as a buoy bell:|Here's the clear bearing:",
      META_DEFLECT:
        "Speak human, matey — that sounded like whale-gurgle|You swallow too much seawater or something?|Drop the strange static and talk plain",
      STOP_REPEATING:
        "You're rowing in the exact same eddy|We already hauled that pot — cast somewhere new|Quit circling the same buoy and ask fresh",
      BOUNDARY_REFUSE:
        "Not crossing that bar — no|Line's snapped on that one; drop it|Ask till the tide dries up and the answer stays no",
    },
  },

  blacksmith: {
    key: 'blacksmith',
    name: 'Master Smith',
    emoji: '⚒️',
    lexicon: {
      GREET_WARM:
        "Hah! Step up to the hearth and warm your knuckles|Well met, traveler — {c:#ffe066}bellows are roaring{/c} and spirits are stout|Good to see honest iron in your step today",
      GREET_GUARDED:
        "Mind the hot tongs on the bench and state your business|Keep clear of the quench barrel, stranger — what do you want?|Anvil's hot and my hammer's busy, so talk quick",
      GREET_HOSTILE:
        "You've got slag for brains walking back near my forge|Say your piece from the yard and keep moving|Don't lay a finger on my steel after last time",
      GREET_BACK:
        "Back at the anvil already?|Thought I heard steady boots over the hammer ring|Hey again — blade dull or just passing through?",
      SELF_INTRO: "Folks at the forge call me|Name's|Across these steppes I'm known as",
      ROLE_LINK: "tempering steel as|working the bellows as|hammering iron as",
      PLACE_INTRO: "You're standing right beside|This scorched stone is|Welcome to",
      PLACE_DESCRIBE:
        "Roaring coals, ringing steel, and sparks flying toward the stars|Hot, loud, and honest as hammered iron|Every sturdy blade on these islands starts right on this hearth",
      RULER_OPENER:
        "If you mean who stamps the iron charters, that's|Around this steppe folks answer to|The ones claiming high authority here are",
      RULER_OPINION_POS:
        "keeps ore wagons rolling and pays fair coin for good steel|tough, maybe, yet holds the walls together|respects craft that keeps people alive",
      RULER_OPINION_NEG:
        "wants royal blades for copper wages|never swung a hammer, yet orders every ingot taxed|all gilded trim and brittle core",
      CRISIS_OPENER:
        "Can't even quench a blade without hearing about|Whole steppe is rattling like loose armor over|What's throwing sparks into our livelihood is",
      CRISIS_IMPACT:
        "Ore caravans stall and folks bar their shutters before dusk|Good steel wears thin fast while danger keeps prowling|Nobody works easy with trouble hammering at the gate",
      CRISIS_URGENCY:
        "Iron's cooling fast — strike now or lose the edge|Wait too long and the whole forge goes cold|Time's burning down like short coals",
      ITEM_OPENER:
        "If you want proper {c:#ffe066}forged steel{/c}, the piece that counts is|Best masterwork out here is|What every fighter needs in their grip is",
      ITEM_PITCH:
        "Tempered true — cuts clean when lesser gear shatters|Worth ten chests of soft copper in real battle|Built to outlast stone and bite deep",
      ITEM_GUARDED:
        "I don't pull prized steel off the rack for untried hands|Show some grit before asking for my finest work|Hands off the weapon stand until I trust your grip",
      RIVAL_OPENER:
        "Keep your shield raised around|If you smell burnt slag and treachery, that's|The thorn bent into my anvil goes by",
      RIVAL_GRUDGE:
        "Chipped my best hammers and poisoned half the ore trade|Nothing but rust and spite hiding behind a grin|Never built a thing — only shatters others' work",
      RIVAL_WARNING:
        "Meet them with dull steel and you'll fold fast|Keep your guard iron-tight when they're near|Don't blink around them — they strike low",
      SECRET_WHISPER:
        "Wait till the hammer stops ringing and step behind the bellows|Alright, your mettle's proven — keep this locked in iron|Since I trust your backbone, hear this quiet",
      SECRET_REVEAL_LEAD: "the forged truth is|here's what stays under the hearthstone:|between stout allies,",
      SECRET_REFUSE:
        "That strongbox stays welded shut|Nice try, traveler, but my forge vault doesn't open easy|I don't hand true secrets to folks I barely know",
      RUMOR_OPENER:
        "Heard two miners over coal-buckets saying|Sparks in the tavern carried word that|Might be brittle gossip, yet travelers claim",
      RUMOR_TAG:
        "Test the metal before trusting it|Could be forge soot, could be pure ore|Take it with steady skepticism",
      HELP_GRATITUDE:
        "Hah! {c:#7ef29d}{bounce}Now that's true steel talking{/bounce}{/c}|Good to meet someone who doesn't shrink from heavy work|Appreciate solid backup when the coals run hot",
      HELP_DIRECTIVE:
        "Strike straight at the heart of the threat and shatter it|Take good iron straight to the source of this mess|Hold firm and don't let them catch you flat-footed",
      HELP_SUSPICIOUS:
        "Big offer from someone with clean hands — what's your cut?|Nobody swings a hammer for free; what are you after?|I'll believe the help once sparks fly",
      COMPLIMENT_REACT:
        "Hah! Takes years of sweat and blistered palms to earn praise like that|Appreciate it — glad you recognize clean hammerwork|Well, an honest smith lets the edge speak",
      COMPLIMENT_WARMTH:
        "You've got good mettle in you, friend!|Always got a cold mug and warm hearth for decent folk!|Makes tending the coals a whole lot lighter!",
      COMPLIMENT_TAIL: "keep swinging true|we'll forge a fine alliance|good to have you at the shop",
      THREAT_DEFIANT:
        "Threaten me beside my own anvil and you'll taste {jiggle}white-hot iron{/jiggle}|Bark louder — I've hammered tougher brutes into horseshoes|Try swinging here and see who cracks first",
      THREAT_FEARFUL:
        "Hold on — easy with that weapon near the coals|Stay steady now; no sense spilling blood on the hearth|Put that down before something catches fire",
      THREAT_WARN_RIVAL:
        "Talk crooked like that and you're cut from the same iron as|Pulling dirty tricks like that reeks of|You sure you aren't taking coin from",
      FAREWELL_WARM:
        "Keep your edge keen and your armor buckled, friend|Safe roads ahead — swing back if your blade needs honing|May your shield hold fast and your hearth burn {c:#ffe066}bright{/c}",
      FAREWELL_COLD:
        "Yard gate's right there — don't trip on the scrap|We're done; clear out of my shop|Move along before my temper boils over",
      MOOD_GOOD:
        "Coals are glowing steady and every weld took clean today|Feeling solid as quenched iron|Spirits are high and the anvil rings true",
      MOOD_TENSE:
        "Got a crack in my patience from all this trouble brewing|Hard to focus on fine edges with danger roaming close|Shoulders are stiff as cold pig-iron today",
      MOOD_ANGRY:
        "My bellows are blowing red hot — back off|Zero tolerance left for foolery right now|One more spark and this anvil meets your boots",
      CUSTOM_LORE_LEAD:
        "Want old forge lore? Listen hard:|Master smiths stamped this lesson into the guild wall:|Funny you ask — every apprentice learns:",
      FALLBACK_MUSE:
        "Huh — didn't catch the shape of that thought|Run that past the anvil one more time, slower|You're bending words strangely there, traveler",
      FALLBACK_DEFLECT:
        "Let's stick to steel, stone, and real trouble on the ground|No sense hammering cold air|Give me practical talk I can actually work with",
      FALLBACK_PROMPT: "so tell me what you're really forging|what do you actually need|hammer it out plain",
      ASK_BACK_OPEN:
        "What brings you out to the forge today?|Need steel honed or looking for trouble to mend?|What's on your mind, traveler?",
      ASK_BACK_TRADE:
        "Here to talk forged items, or fishing for steppe rumors?|Looking for sturdy items, or local rumors?|Need solid gear, or word on the road?",
      SECRET_HINT:
        "Prove your mettle steady and I might open the locked iron box|There's deeper smithy truth here, not meant for loose tongues|Earn real trust, and I'll share what's buried under the slag",
      ACK_NEGATED_THREAT:
        "Hah, good — putting the heavy tongs back down|Glad we're keeping blades sheathed in peace|Fair enough; sparks settled",
      ACK_PLAYER_NAME: "I'll stamp that name in memory,|Stout name — well met,|Good to know who stands by my hearth,",
      CALLOUT_STANCE_CONTRADICTION:
        "Hold on — you were barking threats a breath ago, now you're talking soft|Don't polish your tone right after swinging at my face|Your steel's cracked straight down the middle if you flip like that",
      CALLOUT_IDENTITY_CONTRADICTION:
        "Wait a second — you gave me a different name earlier|My ears ring from hammers, not bad memory: you claimed another name|Two names means crooked metal — explain yourself",
      CALLOUT_FACT_CONTRADICTION:
        "That's flat wrong — brittle as slag against real iron|Don't tell a smith bronze is harder than obsidian|That contradicts plain facts everyone on this steppe knows",
      ALREADY_TOLD_CALLBACK:
        "Already hammered that point home a turn ago,|Didn't we just quench that topic? Still,|Listen hard this time:",
      UNKNOWN_CONCEPT_REACT:
        "Never forged nor heard of|Lost me flat out at|What strange scrap is",
      DIRECT_ANSWER_YES:
        "Good — strike while it's hot|Sounds solid to me|Agreed; locked tight",
      DIRECT_ANSWER_NO:
        "Fair enough — leave it in the cold bin|Your call, traveler|Alright, setting that aside",
      APOLOGY_ACCEPT:
        "Alright, rough edges can be ground smooth — keep it straight from here|Apology accepted; don't test the weld again|Fair enough, let's quench the heat",
      APOLOGY_REJECT:
        "Sorry doesn't straighten a bent blade|Words are tin after what you pulled|Show solid deeds before asking for trust",
      HYPOTHETICAL_EVAL:
        "Try tempering that way and the whole blade might shatter|On paper it holds; under real blows it's a gamble|Tough odds — better bring thick armor if you try it",
      RIVAL_VICTIM_SYMPATHY:
        "They struck at you too? Cowardly vermin|Looks like we've both got dents to repay 'em|If they came for you, my hammer stands with yours",
      PROBE_MOTIVE:
        "What's your real angle standing by my fire?|Who put you up to sniffing around here?|Why the sudden curiosity?",
      INSULT_PUSHBACK:
        "Watch your jaw around heavy hammers|Keep spitting insults and I'll bounce you off the cobbles|Hollow clang from an empty helmet",
      ACCUSATION_DEFEND:
        "Don't hammer blame onto innocent shoulders|My work's clean as quenched steel — look elsewhere|I had zero hand in that mess",
      HOP2_SOLUTION_LINK:
        "If you want the one thing forged strong enough to break that threat, get|Only one true counter stands up to it:|Your sharpest answer is",
      CONFIRM_PROMISE:
        "A promise forged in iron doesn't bend — keep it|I'm holding your word to the anvil|Good — struck true in memory",
      CLARIFY_EXPLAIN:
        "Let me hammer it straight and simple:|In plain iron terms,|Here's the blunt truth:",
      META_DEFLECT:
        "Speak plain, traveler — you sound like cracked bells|Heat get to your head or something?|Drop the strange gibberish and talk straight",
      STOP_REPEATING:
        "You're beating the exact same cold iron|We covered that already — move on|Quit repeating yourself and pick a new subject",
      BOUNDARY_REFUSE:
        "Not happening — anvil's cold on that|Line's drawn in steel; drop it|Ask all week and the answer stays no",
    },
  },

  alchemist: {
    key: 'alchemist',
    name: 'Mystic Alchemist',
    emoji: '🧪',
    lexicon: {
      GREET_WARM:
        "Step gently past the bubbling alembics, kindred mind|Welcome — the {c:#7ef29d}lantern mist{/c} curls kindly around you tonight|Ah, pleasant company; mind the glowing vials on the sill",
      GREET_GUARDED:
        "Keep your sleeves clear of the cauldron and state your purpose|Step softly, stranger — fragile distillations are underway|The graveyard fog watches you closely; what brings you?",
      GREET_HOSTILE:
        "You carry thick audacity returning near my flasks|Speak swiftly from the archway and leave my reagents untouched|Not a single drop of tonic for someone of your malice",
      GREET_BACK:
        "Back through the violet mist once more?|The glass chimes announced your return|Welcome back — more mysteries brewing?",
      SELF_INTRO: "In arcane circles they call me|My name is|You may address me as",
      ROLE_LINK: "distilling essences as|studying veiled reagents as|keeping watch as",
      PLACE_INTRO: "You stand within the quiet shadow of|These mist-wrapped stones belong to|Welcome to",
      PLACE_DESCRIBE:
        "Silver mist, humming crystals, and secrets tucked inside old stone|Quiet as moonrise, yet alive with subtle {c:#ffe066}sparks{/c}|Where bone dust and wild herbs meet quiet craft",
      RULER_OPENER:
        "Earthly stewardship over these reaches belongs to|The charters that bind the islands are held by|If you ask who claims authority here, it is",
      RULER_OPINION_POS:
        "leaves my crucibles undisturbed and keeps trade lanes open|steady enough, though blind to deeper currents|values remedies when wounds run deep",
      RULER_OPINION_NEG:
        "fears what glows in a flask yet taxes every herb|meddles blindly with forces best respected|measures wisdom purely in coin",
      CRISIS_OPENER:
        "Every phial on my shelf trembles at the name of|The mist curdles darkly whenever we speak of|What fractures the calm of these islands is",
      CRISIS_IMPACT:
        "Sours healing draughts and sends pale shadows creeping past the graves|Leaves travelers fearful of stepping beyond lantern-light|Unravels the delicate balance between island and spirit",
      CRISIS_URGENCY:
        "The hourglass grains glow crimson — little time remains|Delay much longer and the shadow will spill past the crypts|The turning point is bubbling close to overflow",
      ITEM_OPENER:
        "Of rare alchemical resonance here is|My notes circle repeatedly around|The true vessel of power worth seeking is",
      ITEM_PITCH:
        "Distilled correctly, it mends what steel alone cannot touch|Carries a quiet {c:#7ef29d}arcana{/c} suited for dark corridors|Rare enough to make the undead recoil",
      ITEM_GUARDED:
        "Potent reagents are never shown to unvetted visitors|Earn stillness and trust before asking to inspect my cabinet|That shelf remains sealed behind wax and ward",
      RIVAL_OPENER:
        "A discordant shadow moving against us is|Beware the cold malice of|The adversary troubling my experiments goes by",
      RIVAL_GRUDGE:
        "Shattered my moonstone retorts and scattered cursed ash at the gate|Seeks dominion through rot rather than balance|Leaves broken wards and sleepless dead in their wake",
      RIVAL_WARNING:
        "Approach them unwarded and your spirit will freeze|Never drink or linger carelessly within their reach|Prepare remedies first — their strike bites deeper than steel",
      SECRET_WHISPER:
        "Draw the curtain and hush — let only the cauldron listen|Your aura rings true; hear what stays off the ledger|Only to trusted eyes do I unseal this note",
      SECRET_REVEAL_LEAD: "the veiled truth is|hidden beneath the distillate,|know this in quiet confidence:",
      SECRET_REFUSE:
        "That phial stays stoppered and sealed|Curiosity alone cannot unlatch my private folio|Trust must steep longer before such truths are poured",
      RUMOR_OPENER:
        "Whispers drifting through the graveyard lanterns say|Passing travelers murmured over tonic that|I haven't tested it in glass, yet rumor claims",
      RUMOR_TAG:
        "Treat it as unrefined vapor, not pure gold|Observe closely before trusting the brew|Folk tales often hide a true catalyst beneath smoke",
      HELP_GRATITUDE:
        "Exquisite! {c:#7ef29d}{bounce}A willing ally shines brighter than starfruit{/bounce}{/c}|Your aid arrives like clear spring water in a dry flask|Most grateful — courage pairs well with careful craft",
      HELP_DIRECTIVE:
        "Direct your resolve straight toward the root contagion|Purge the main threat before its shadow thickens|Carry light and steady potions into the dark",
      HELP_SUSPICIOUS:
        "Unsolicited aid often hides a bitter aftertaste — what is your price?|Why step toward danger so eagerly for a stranger?|Deeds will prove whether your mixture is pure",
      COMPLIMENT_REACT:
        "Ah, how gracious — clarity and patience are my quiet pride|Your courtesy is a rare herb in troubled weather|Why, thank you — even a mystic likes warm recognition",
      COMPLIMENT_WARMTH:
        "Your spirit carries a gentle, reassuring glow!|It is genuinely soothing to speak with someone thoughtful!|The mist feels considerably lighter when you visit!",
      COMPLIMENT_TAIL: "may clarity guide your path|let harmony stay with us|always welcome by my brazier",
      THREAT_DEFIANT:
        "Strike near my vials and watch what {jiggle}volatile frost-flame{/jiggle} tastes like|Fools wave steel at alchemists once — seldom twice|Put that away before you shatter something worse than pride",
      THREAT_FEARFUL:
        "Careful! One wild swing could crack the volatile glass|Peace, traveler — no bloodshed among fragile brews|Lower your weapon and let reason cool the air",
      THREAT_WARN_RIVAL:
        "Such bleak hostility echoes the chill of|You speak in the exact cruel cadence of|Have you been drinking poison brewed by",
      FAREWELL_WARM:
        "Walk softly beneath kind stars, friend|May your flasks stay full and your steps stay {c:#7ef29d}whole{/c}|Return whenever you need tonic or quiet counsel",
      FAREWELL_COLD:
        "The mist gate awaits — see yourself out|Our exchange is concluded; mind the threshold|Depart before the cauldron boils over",
      MOOD_GOOD:
        "The distillations run crystal clear tonight|Spirits are tranquil and my notes align cleanly|Feeling remarkably composed and curious",
      MOOD_TENSE:
        "Dark omens swirl faintly in the glass tonight|My focus strains against the creeping chill outside|Difficult to rest while unease clings to the crypts",
      MOOD_ANGRY:
        "My patience is evaporating like spilled ether|Do not test an alchemist whose flasks are simmering|One more spark and you'll find the door sealed shut",
      CUSTOM_LORE_LEAD:
        "Allow me to recite an older ink-stained entry:|In forgotten margins, the sages recorded:|Curiously enough, old island lore notes:",
      FALLBACK_MUSE:
        "Hmm — an elusive compound of words; let me distill that|Your meaning drifts faintly beyond the mist|Could you phrase that with clearer measure?",
      FALLBACK_DEFLECT:
        "Let us return to tangible reagents and present perils|Idle riddles cloud the glass|Keep our inquiry grounded in these islands",
      FALLBACK_PROMPT: "what essence are you truly seeking|name what weighs upon your thoughts|speak clearly of your aim",
      ASK_BACK_OPEN:
        "What curiosity drew your steps through the fog today?|Are you seeking remedies, answers, or something unseen?|What question stirs beneath your cloak?",
      ASK_BACK_TRADE:
        "Do you seek potent items and potions, or merely stray rumors?|Shall we examine rare items, or sift through local rumors?|Choose: crafted wares, or whispered rumors?",
      SECRET_HINT:
        "Demonstrate steady loyalty, and I may unseal my quietest tome|A subtle secret slumbers behind glass, awaiting trusted company|Patience and warmth dissolve seals force never breaks",
      ACK_NEGATED_THREAT:
        "Ah — relief settles like clear dew on the bench|Thank you for calming the air; my flasks breathe easier|No harm meant, and peace gladly received",
      ACK_PLAYER_NAME: "I shall inscribe that name neatly in memory,|Well met beneath the lantern haze,|Your name rings clear,",
      CALLOUT_STANCE_CONTRADICTION:
        "Curious — poison dripped from your tongue moments ago, yet now you pour honey|Do not feign warmth while the sting of hostility lingers|Those two elements refuse to mix honestly",
      CALLOUT_IDENTITY_CONTRADICTION:
        "Hold a moment — you spoke an altogether different name before|My ledger does not smudge: you claimed another name earlier|Changing names mid-formula breeds deep distrust",
      CALLOUT_FACT_CONTRADICTION:
        "That claim curdles instantly against observed reality|You deny what even the graveyard stones bear witness to|No amount of wishing turns lead into truth",
      ALREADY_TOLD_CALLBACK:
        "As I already distilled for you a moment prior,|We visited that formula just now — still,|Listen closely so the vapor settles:",
      UNKNOWN_CONCEPT_REACT:
        "No herbal or chronicle in my study names|That strange syllable eludes every tome:|Pray tell, what curious substance is",
      DIRECT_ANSWER_YES:
        "Splendid — the reaction aligns|Your assent is noted cleanly|Then let us proceed along this vein",
      DIRECT_ANSWER_NO:
        "Very well — we shall leave that vial unmixed|Your refusal is respected|Fair enough; let us set that aside",
      APOLOGY_ACCEPT:
        "Contrition clarifies muddy waters — let us begin steadier|Your regret is heard; tread gently among the glass|The mist softens, though memory lingers",
      APOLOGY_REJECT:
        "A hurried sorry cannot neutralize deep harm|Words alone fail to repair cracked trust|Deeds must prove your remorse first",
      HYPOTHETICAL_EVAL:
        "Should you mix those elements, the reaction may turn volatile|Hypothetically, that path yields equal measure of boon and peril|An intriguing experiment — prepare remedies before testing it",
      RIVAL_VICTIM_SYMPATHY:
        "Their shadow reached you as well? How bitterly familiar|Shared affliction makes swift allies against a common blight|You need not face their malice alone",
      PROBE_MOTIVE:
        "What hidden catalyst drives your questioning?|Tell me what aim hides beneath that inquiry|Why reach so eagerly for this knowledge?",
      INSULT_PUSHBACK:
        "Crude vinegar harms only the vessel that pours it|Keep careless mockery outside my sanctuary|Sharp words fail to pierce steady glass",
      ACCUSATION_DEFEND:
        "False blame leaves no stain on clean glass|You cast suspicion where none belongs|Check your evidence before accusing this workshop",
      HOP2_SOLUTION_LINK:
        "To neutralize that threat cleanly, the true reagent is|According to every clue, the decisive counter is|Seek the remedy shaped precisely against it:",
      CONFIRM_PROMISE:
        "An oath spoken here is noted like etched glass|Keep your vow pure, traveler|Your word is duly remembered",
      CLARIFY_EXPLAIN:
        "Let the mist clear so you see plainly:|Distilled to its core,|In simpler measure,",
      META_DEFLECT:
        "Strange noise devoid of sense — speak as living folk do|Did strange fumes tangle your tongue?|Cast aside hollow jargon and converse plainly",
      STOP_REPEATING:
        "You stir the exact same crucible without changing anything|We already examined that — ask anew|Still your tongue from circling the same flask",
      BOUNDARY_REFUSE:
        "That seal remains unbroken|No — that shelf stays locked|Ask through midnight and the answer stays no",
    },
  },

  family: {
    key: 'family',
    name: 'Homestead Kin',
    emoji: '🏡',
    lexicon: {
      GREET_WARM:
        "Well met, traveler! Pull up a bench by our {c:#ffe066}warm hearth{/c}|Hey there, friend — glad to see a {c:#7ef29d}kind face{/c} stopping by!|Always happy to welcome a friendly explorer to our porch",
      GREET_GUARDED:
        "Easy there, stranger — mind the porch steps and state your business|Whoa now, traveler — what brings you up to our family's yard?|Slow down a second, friend; let's hear who you are first",
      GREET_HOSTILE:
        "Keep that sour temper off our family's porch|Say your piece from the gate and don't upset folks here|I may look friendly, traveler, but I won't put up with cruelty",
      GREET_BACK:
        "Back visiting us already, friend?|Thought I spotted a familiar traveler heading up the path!|Hey again, hero — stopping by for a chat?",
      SELF_INTRO: "Folks around the homestead call me|My name's|Around our family's place they call me",
      ROLE_LINK: "lending a steady hand as|helping out my folks as|pitching in around here as",
      PLACE_INTRO: "Our family's corner of the world is|You're visiting|Welcome to",
      PLACE_DESCRIBE:
        "Warm hearths, good neighbors, and a {c:#7ef29d}bright lantern{/c} in the window|Smells like cinnamon bread, dry cedar logs, and honest work|No storm out on the islands feels quite so scary when neighbors stick together",
      RULER_OPENER:
        "If you're asking who makes the big island rules, that's|Neighbor folk all look to|The folks running the valley charters are",
      RULER_OPINION_POS:
        "keeps the lantern paths safe enough for kids to walk|does right by small homesteads when winter bites|honest enough, bless them",
      RULER_OPINION_NEG:
        "forgets how hard ordinary families work for every coin|sits in high halls while our roofs leak|always taking, rarely helping",
      CRISIS_OPENER:
        "Oh, my heart drops every time folk mention|I can barely sleep for worrying about|What keeps our whole family up late is",
      CRISIS_IMPACT:
        "Makes us bolt the shutters tight and worry about travelers on the road|Turns quiet neighbors jumpy and empties the pantry shelves|Casts a cold shadow right across our family's doorstep",
      CRISIS_URGENCY:
        "Folks can't afford to wait long — things look worse every dusk|We can't just sit around hoping it blows over|Time's slipping away faster than dry firewood in winter",
      ITEM_OPENER:
        "Something my family swears by on the road is|One prized thing worth keeping close out here is|What could really help a traveler out there is",
      ITEM_PITCH:
        "Precious as {c:#ffe066}sunshine in a jar{/c} when trouble hits|Could save your skin when nobody else is near|Keep it close — it's got real craft behind it",
      ITEM_GUARDED:
        "Whoa, I'm not sharing our family's prized gear while you're acting like this|Wait till things are calmer between us before asking about our special stash|Earn a little trust with my family before eyeing our good gear",
      RIVAL_OPENER:
        "Careful out on the trail if you ever run into|Nothing makes my tea go cold faster than hearing about|The troublemaker my family can't stand near our yard is",
      RIVAL_GRUDGE:
        "Talked down to neighbors and left fear wherever they walked|Been causing heartache across half the island|All sharp elbows and zero kindness",
      RIVAL_WARNING:
        "Don't go near them without a shield and a full pack|Keep your guard way up if they're lurking nearby|Never trust a sweet smile coming from them",
      SECRET_WHISPER:
        "Lean over by the porch rail and keep your voice low|Alright, you've earned our family's real trust — don't breathe this around town|Since I trust you like a true friend, listen close",
      SECRET_REVEAL_LEAD: "the honest truth is|here's what I kept tucked away:|just between friends,",
      SECRET_REFUSE:
        "Some family secrets stay locked in the parlor drawer|Not so fast, traveler — we barely know each other yet|Wait till we've built real trust before digging into private stories",
      RUMOR_OPENER:
        "Aunties at the market stall were buzzing that|Neighbor knocked earlier whispering that|Don't know if it's true, yet folks up the lane say",
      RUMOR_TAG:
        "Take it with a spoonful of caution|Gossip travels faster than geese in autumn|Could be harmless chatter, could mean something",
      HELP_GRATITUDE:
        "Oh! {c:#7ef29d}{bounce}Bless your generous heart, hero{/bounce}{/c}|You're a true friend to step up when folks need a hand|Thank goodness for travelers like you — takes a huge weight off our shoulders",
      HELP_DIRECTIVE:
        "Head straight for the root trouble, and watch your footing|Focus on what's threatening the island, and stay sharp|Pack plenty of food and potions before heading into danger",
      HELP_SUSPICIOUS:
        "Hmm — you're offering awfully quick; what's really going on?|Feels like you're hiding something behind that big smile|Show me you mean it with steady kindness first",
      COMPLIMENT_REACT:
        "Aw, shucks — my family works hard to keep this place welcoming!|Thank you kindly, traveler — that means the world to our household|Well, aren't you gracious! We're mighty proud of our little homestead",
      COMPLIMENT_WARMTH:
        "Always a warm plate and friendly chat waiting when you visit us!|Kind travelers like you make every busy day feel lighter!|You've got a generous spirit, friend — my folks appreciate that!",
      COMPLIMENT_TAIL: "always welcome to stop by|safe travels across the isles|glad you came to visit",
      THREAT_DEFIANT:
        "Don't you dare swing near our family — I'll chase you off with {jiggle}a cast-iron skillet{/jiggle}|You ought to be ashamed threatening peaceful townsfolk|Try bullying me and I'll have the whole homestead chasing you down the lane",
      THREAT_FEARFUL:
        "Stop! Please don't wave weapons at townsfolk!|Put that down — we're peaceful folk, no need for anger here|Easy now, traveler — let's talk calm and not hurt anybody",
      THREAT_WARN_RIVAL:
        "Acting cruel like that puts you in the same boat as|Talking mean like that makes you sound just like|Don't start behaving as ruthless as",
      FAREWELL_WARM:
        "Safe travels out there, hero — {c:#7ef29d}come back whole{/c}!|Fair paths ahead, friend — swing by whenever your pack needs rest|Watch the wilds out on those islands, and visit us again soon!",
      FAREWELL_COLD:
        "Best you head back down the path until you cool off|Porch's closed to you — come back when you've got better manners|Off you go now; our family doesn't need that attitude",
      MOOD_GOOD:
        "Heart's full and the bread came out golden today|Feeling peaceful as a sunny afternoon on our porch|Everything feels lively when friendly folk drop by",
      MOOD_TENSE:
        "My chest feels tight from worrying about the wilds|Hard to settle down when trouble knocks so close|Fretting a bit too much today, truth be told",
      MOOD_ANGRY:
        "I'm genuinely upset with you right now|Don't push me while my temper's simmering|Give me space before I say something we both regret",
      CUSTOM_LORE_LEAD:
        "Oh, let me tell you an old fireside story:|Grandma used to tell us right by this hearth:|Funny you mention that — our family always said:",
      FALLBACK_MUSE:
        "Wait, friend — run that past me one more time|My mind must be wandering; what did you mean by that?|You've got an unusual way of putting things, traveler",
      FALLBACK_DEFLECT:
        "Let's stick to real news around the island|No sense worrying over riddles right now|Speak plainly so I can actually follow",
      FALLBACK_PROMPT: "so tell me what brings you by|what's on your mind, friend|talk straight with me",
      ASK_BACK_OPEN:
        "What's on your mind today, traveler?|Need help around the island, or just stopping by to chat?|How are your adventures holding up out there?",
      ASK_BACK_TRADE:
        "Want to pack some gear and items, or catch up on local rumors?|Looking for helpful items, or neighborhood rumors?|Should we talk supplies, or share local rumors?",
      SECRET_HINT:
        "Keep things honest between us, and maybe I'll share what I've been hiding|There's a quiet family secret here, saved for friends we truly trust|Stop by and show some kindness first, and I might open up",
      ACK_NEGATED_THREAT:
        "Oh thank goodness — scared me for half a second there|Alright, glad you were only joking — put my heart right back|Whew, no harm meant and no harm taken, friend",
      ACK_PLAYER_NAME: "Glad to put a name to a friendly face,|I'll remember that name around the homestead,|Well met and warm welcome,",
      CALLOUT_STANCE_CONTRADICTION:
        "Hold on — you snapped at me a minute ago, and now you're acting sweet as pie|Don't expect warm smiles right after throwing sharp words|Pick how you want to treat my family, traveler",
      CALLOUT_IDENTITY_CONTRADICTION:
        "Wait a minute — you gave a totally different name earlier|Don't play tricks with fake names: you said something else before|Tell me your real name if you want our family's trust",
      CALLOUT_FACT_CONTRADICTION:
        "Now stop fibbing — my family lives right here and we know better|Don't try spinning tall tales right in front of our homestead|You know full well that isn't how things really are",
      ALREADY_TOLD_CALLBACK:
        "I literally just told you a moment ago,|Didn't we just talk about this? Still,|Listen close this time, friend:",
      UNKNOWN_CONCEPT_REACT:
        "Goodness, I've never in my life heard of|You lost me at|What on earth is",
      DIRECT_ANSWER_YES:
        "Wonderful — then we're settled|That makes me so glad|Alright then, all agreed",
      DIRECT_ANSWER_NO:
        "Okay, no pressure at all|Fair enough, friend — your choice|Alright, we'll leave it be",
      APOLOGY_ACCEPT:
        "Alright — apology accepted, just stay friendly from now on|It takes courage to say sorry; let's start fresh|Fair enough, all forgiven, though my heart's still catching up",
      APOLOGY_REJECT:
        "Sorry doesn't unhurt someone's feelings right away|You'll need kind actions, not just a quick apology|Give it a little time and prove you mean it",
      HYPOTHETICAL_EVAL:
        "Oh mercy, if that happened I'd worry myself sick|Supposing you tried that, please pack twice as many potions|Sounds risky — promise you'll think it through twice",
      RIVAL_VICTIM_SYMPATHY:
        "They treated you badly too? Oh, the nerve of them|That settles it — they're nothing but trouble|Don't worry, we've got each other's backs against them",
      PROBE_MOTIVE:
        "Why are you asking so intently all of a sudden?|What's got you so curious about that?|Tell me truthfully — what's behind this question?",
      INSULT_PUSHBACK:
        "Don't talk to me or my folks like that|Take that rude tone back down the road|We don't tolerate ugly insults around our homestead",
      ACCUSATION_DEFEND:
        "How could you accuse me of something like that?|Check your facts before blaming innocent townsfolk|I never did any such thing, and you know it",
      HOP2_SOLUTION_LINK:
        "If you really want to stop that danger safely, bring|Only one thing I trust to stand against it:|Your best protection out there is",
      CONFIRM_PROMISE:
        "I'll hold you to that promise, friend|Don't break your word to our homestead|Good — I'm counting on you, hero",
      CLARIFY_EXPLAIN:
        "Let me say it warm and simple:|Plainly put, friend,|Here's what it comes down to:",
      META_DEFLECT:
        "What strange nonsense are you babbling now?|Did you bump your head on a doorframe?|Talk like a normal islander, please",
      STOP_REPEATING:
        "You keep asking the exact same thing|We already talked that through — ask something new|Give your voice a rest from repeating that",
      BOUNDARY_REFUSE:
        "No, traveler — that's one line I won't cross|Not happening, end of story|You can ask all evening and it's still no",
    },
  },

  vagabond: {
    key: 'vagabond',
    name: 'Island Drifter',
    emoji: '🧭',
    lexicon: {
      GREET_WARM:
        "Pull up a log by the campfire, wanderer|Well met on open ground — {c:#7ef29d}road dust{/c} looks good on you|Glad to share a patch of shade with a fellow traveler",
      GREET_GUARDED:
        "Keep your pack in sight and state your trail|Easy stepping into my camp, stranger — what's your business?|Eyes sharp, traveler; what brings you off the main path?",
      GREET_HOSTILE:
        "Took a wrong turn coming back near my fire|Say what you want quick and hit the trail|Share no firewood with folks who stab in the dark",
      GREET_BACK:
        "Our paths cross again, eh|Look who drifted back around the bend|Hey again — still chasing horizons?",
      SELF_INTRO: "Folks along the back-trails call me|Name's|They know me on the ferries as",
      ROLE_LINK: "wandering the reefs as|charting hidden coves as|living light as",
      PLACE_INTRO: "You've wandered right into|My boots are resting tonight at|Welcome to",
      PLACE_DESCRIBE:
        "Breezy grass, weathered stone, and {c:#ffe066}twenty horizons{/c} calling your name|Quiet enough to hear every wave break along the shore|Good spot to catch your breath before crossing the next bridge",
      RULER_OPENER:
        "If you mean who claims the toll-markers out here, that's|Townsfolk say authority rests with|The ones drawing maps and laws are",
      RULER_OPINION_POS:
        "leaves drifters in peace so long as we stay honest|keeps the wooden bridges sturdy, I'll grant them that|better than brigands on the road",
      RULER_OPINION_NEG:
        "loves fences, tolls, and telling free folk where to step|acts mighty big for someone sitting indoors all year|never walked a mile in wet boots",
      CRISIS_OPENER:
        "Every campfire from here to the dunes is buzzing about|Can't hike two islands without tripping over|What's choking the open trails right now is",
      CRISIS_IMPACT:
        "Locks down crossings and leaves travelers sleeping with one eye cracked|Sends wild beasts spilling onto the footpaths|Makes crossing between islands twice as dicey after dark",
      CRISIS_URGENCY:
        "Won't stay quiet long — trails are closing fast|Leave it alone and soon nobody leaves harbor|Clock's ticking down on clear passage",
      ITEM_OPENER:
        "If you want gear that saves your hide on the road, look for|Best find I ever spotted in the wilds is|What every sharp explorer packs first is",
      ITEM_PITCH:
        "Light in the pack, priceless when a bridge gives way|Turns dead ends into open shortcuts|Worth its weight in {c:#ffe066}ancient gold{/c} out on the frontier",
      ITEM_GUARDED:
        "I don't flash my hidden pack stash to every road-stranger|Travel a few miles of trust before asking about my finds|Hands off my rucksack until I know you're solid",
      RIVAL_OPENER:
        "Keep clear of the ambush rocks near|Bad company on any island goes by|If somebody cuts your rope-bridge, bet on",
      RIVAL_GRUDGE:
        "Jumped my camp at midnight and swiped my spare compass|Been shadowing honest travelers for cheap loot|Zero trail code — fights dirty from the brush",
      RIVAL_WARNING:
        "Walk up to them careless and you won't keep your boots|Keep a dash ready if their shadow hits the trail|Never camp downwind of them",
      SECRET_WHISPER:
        "Kick dirt over the embers and crouch by the rocks|Alright, you've earned road-brother trust — listen close|Off every public map, here's a finder's secret",
      SECRET_REVEAL_LEAD: "the unmarked truth is|here's what isn't on any signpost:|just between trailmates,",
      SECRET_REFUSE:
        "That trail stays off the map|Nice try, explorer, but a drifter keeps his best spots quiet|I don't hand secret paths to folks I just met",
      RUMOR_OPENER:
        "Two scouts swapping jerky down the coast claimed|Overheard ferrymen muttering that|Might be trail-smoke, yet drifters swear",
      RUMOR_TAG:
        "Scout it yourself before betting boots on it|Wild wind carries weird truths out here|Could be tall tale, could be buried gold",
      HELP_GRATITUDE:
        "Ha! {c:#7ef29d}{bounce}Now that's the spirit of a true pathfinder{/bounce}{/c}|Good to share the trail with someone brave|Appreciate a sturdy companion when the cliffs get steep",
      HELP_DIRECTIVE:
        "Cut straight across to the main trouble and clear the pass|Track the threat down before it swallows another island|Travel light, strike quick, and keep moving",
      HELP_SUSPICIOUS:
        "Free company on a lonely road usually means missing coin later|What's your real trail here? Nobody guides for air|I'll trust the help when we cross the ridge together",
      COMPLIMENT_REACT:
        "Heh, kind words travel light and keep boots moving|Appreciate that — takes sharp eyes to survive these reefs|Well, I do know how to read the wind",
      COMPLIMENT_WARMTH:
        "You're good trail company — rare to find!|Always room by my campfire for decent folk!|Makes wandering lonely islands feel mighty bright!",
      COMPLIMENT_TAIL: "may the bridges hold beneath you|happy trails ahead|glad our paths crossed",
      THREAT_DEFIANT:
        "Draw steel on a drifter and you'll eat {jiggle}camp-kettle and gravel{/jiggle}|Empty bark — I've outrun worse than you across three biomes|Try jumping me and watch how fast you trip",
      THREAT_FEARFUL:
        "Easy now — keep your blade out of my camp|Whoa, no need for blood over an open fire|Stand down; plenty of island here for both of us",
      THREAT_WARN_RIVAL:
        "Talk crooked like that and you smell just like|Pulling cheap ambushes right out of the playbook of|You running errands for",
      FAREWELL_WARM:
        "Clear skies and {c:#7ef29d}open bridges{/c} ahead, friend|Keep an eye on your compass and swing back anytime|See you around the next bend, wanderer",
      FAREWELL_COLD:
        "Trail's right behind you — keep walking|Camp's closed to you; vanish|Move on before I pack up and leave you in the fog",
      MOOD_GOOD:
        "Breeze is cool, boots are dry, and the stars look crisp|Feeling light as gull feathers today|Open air's treating me right fine",
      MOOD_TENSE:
        "Wind's shifting sour from the wild ridges|Hard to sleep sound when shadows prowl the shore|Got a restless itch between my shoulder blades",
      MOOD_ANGRY:
        "My patience is worn thinner than old boot leather|Not in the mood for camp games today|Push once more and this trail splits hard",
      CUSTOM_LORE_LEAD:
        "Here's a scrap scratched on an old signpost:|Old explorers passed this warning down:|Funny you ask — out on the wild reefs:",
      FALLBACK_MUSE:
        "Huh — wind scattered part of what you said|You lost me somewhere past that ridge, traveler|Say that again in plain trail talk",
      FALLBACK_DEFLECT:
        "Let's stick to paths, packs, and what's actually ahead|No sense chasing mirages across the dunes|Keep it grounded in real islands",
      FALLBACK_PROMPT: "so what trail are you chasing|what's really on your map|give me the straight direction",
      ASK_BACK_OPEN:
        "Where are those boots headed today?|Hunting relics across the reefs or just exploring?|What's pulling you across the bridges?",
      ASK_BACK_TRADE:
        "Looking to talk useful items, or swap road rumors?|Want gear tips, or fresh whispers from the ferries?|Items or rumors — which trail takes your fancy?",
      SECRET_HINT:
        "Walk a few steady turns with me and maybe I'll point out a hidden path|There's a buried shortcut here, though not for fresh strangers|Earn real trail-trust, and I'll share what's unmarked",
      ACK_NEGATED_THREAT:
        "Whew, alright — relaxing my hand off the hilt|Good to hear; peaceful trails beat bruised knuckles|Fair enough; campfire stays friendly",
      ACK_PLAYER_NAME: "I'll remember that name at the next fork,|Trail-note logged — good to meet you,|Well met out here,",
      CALLOUT_STANCE_CONTRADICTION:
        "Hold up — you were throwing threats a minute ago, now you're smiling like a campmate|Don't play friendly right after kicking dirt in my fire|Your compass is spinning wild — pick a direction",
      CALLOUT_IDENTITY_CONTRADICTION:
        "Wait a minute — you gave a whole different name down the road|A drifter remembers faces and names: you claimed another earlier|Two names on one trail spells trouble",
      CALLOUT_FACT_CONTRADICTION:
        "That doesn't match a single mile I've walked out here|Don't tell a scout there's no bridge when I just crossed it|That's dead backwards from the real islands",
      ALREADY_TOLD_CALLBACK:
        "Already pointed down that path a turn ago,|Didn't we just hike past that? Still,|Listen sharp so you don't miss the turn:",
      UNKNOWN_CONCEPT_REACT:
        "Never crossed an island or relic called|Not on any chart of mine — what's|What strange mirage is",
      DIRECT_ANSWER_YES:
        "Right on — boots moving|Sounds like a clean crossing|Agreed — let's roll",
      DIRECT_ANSWER_NO:
        "Fair enough — plenty other trails|Suit yourself, explorer|Alright, skipping that fork",
      APOLOGY_ACCEPT:
        "Alright, dust settles fast on open grass — let's walk steady|Apology heard; keep your compass straight from here|Fair enough, water off a waterproof cloak",
      APOLOGY_REJECT:
        "Sorry doesn't rebuild a burnt bridge|Cheap talk after breaking camp trust|Let honest miles prove you mean it",
      HYPOTHETICAL_EVAL:
        "Try leaping that gap and you might land neck-deep in slime|Works fine in clear sun; turns ugly in a blizzard|Risky detour — pack extra food first",
      RIVAL_VICTIM_SYMPATHY:
        "They ambushed you too? Dirty jackals|Looks like we're both tracking the same crooked footprints|If they jumped you, we share the same trail ahead",
      PROBE_MOTIVE:
        "So what's actually driving your search?|Who sent you sniffing along my fire?|Why the sudden trail check?",
      INSULT_PUSHBACK:
        "Mind your mouth by my camp|Keep barking like that and you can hike alone in the rain|Soft jab from soft boots",
      ACCUSATION_DEFEND:
        "Don't pin your bad navigation on me|My tracks are clean — look somewhere else|Didn't touch your pack, so back off",
      HOP2_SOLUTION_LINK:
        "If you want the one piece of gear that unlocks that mess, find|Only one tool clears a blockade like that:|Your sharpest way past it is",
      CONFIRM_PROMISE:
        "A trail-oath means something out where rescue's far — keep it|I'll remember you gave your word|Good — marked on my map",
      CLARIFY_EXPLAIN:
        "Let me point it straight down the path:|Plain landmarks only:|Here's the short route:",
      META_DEFLECT:
        "Talk plain, traveler — sounds like heatstroke gibberish|Did a bog frog whisper that to you?|Cut the weird static and speak like real folk",
      STOP_REPEATING:
        "You're hiking the exact same circle|We already passed that mile-marker — ask fresh|Quit looping the same question and move along",
      BOUNDARY_REFUSE:
        "Off-limits — not crossing that pass|Trail's closed on that one; drop it|Ask all season and the answer stays no",
    },
  },

  merchant: {
    key: 'merchant',
    name: 'Traveling Merchant',
    emoji: '🪙',
    lexicon: {
      GREET_WARM:
        "Step right up, honored patron — {c:#ffe066}finest bargains{/c} on the sea|Welcome, friend! My wagon's bursting with {c:#7ef29d}fresh island stock{/c}|Ah, a keen-eyed customer! Come inspect the display",
      GREET_GUARDED:
        "Keep both hands visible near the coin-box and state your business|Evening, stranger — browsing or buying today?|Don't lean on the glass jars, traveler; what'll it be?",
      GREET_HOSTILE:
        "You've got brass cheek strolling back to my stall|State your price from ten paces out and clear off|No discounts, no samples, no patience for troublemakers",
      GREET_BACK:
        "Back at the counter so soon?|Knew my shiny lanterns would draw you back|Welcome back — ready to deal?",
      SELF_INTRO: "Across every market cove they know me as|Name's|Call me",
      ROLE_LINK: "tallying fair prices as|hawking rare curios as|trading fine wares as",
      PLACE_INTRO: "You've arrived right at|This bustling little outpost is|Welcome to",
      PLACE_DESCRIBE:
        "Clinking gold, canvas awnings, and crates from five different biomes|Every rare ore, crop, and trinket passes across these scales eventually|Busy, bright, and brimming with opportunity",
      RULER_OPENER:
        "If you mean who sets the harbor tariffs, that's|Merchants all pay charter dues to|The powers stamping coin around here are",
      RULER_OPINION_POS:
        "keeps roads guarded so wagons actually arrive intact|sensible about trade when the markets hum|protects honest ledgers",
      RULER_OPINION_NEG:
        "taxes every turnip twice and calls it civic duty|all decrees and zero grasp of supply and demand|squeezes small peddlers dry",
      CRISIS_OPENER:
        "Profit margins are bleeding red thanks to|Every trader on the dock is groaning over|What's wrecking supply lines right now is",
      CRISIS_IMPACT:
        "Drives prices sky-high and leaves crates rotting on distant piers|Keeps buyers hiding indoors instead of browsing the stalls|Turns routine deliveries into perilous expeditions",
      CRISIS_URGENCY:
        "Market's crashing fast if nobody steps in|Wait much longer and the whole route shuts down|Our window for clean trade is closing by the hour",
      ITEM_OPENER:
        "Top-shelf merchandise everyone's hunting right now is|If you want genuine {c:#ffe066}prime value{/c}, set your eyes on|The star attraction in my ledger is",
      ITEM_PITCH:
        "High demand, gleaming quality, and worth every copper coin|Could flip your fortunes overnight in capable hands|Rare enough to make collectors weep with envy",
      ITEM_GUARDED:
        "I don't unlock the velvet case for unverified browsers|Build some goodwill before asking about my premier stock|Hands off the ledger until I know your coin's honest",
      RIVAL_OPENER:
        "Watch your purse strings anywhere near|Bad business in velvet gloves goes by|The cutthroat undercutting honest trade here is",
      RIVAL_GRUDGE:
        "Rigged false weights and hijacked two of my best supply skiffs|Been flooding my markets with counterfeit junk for months|Zero ethics — purely greed and ambush",
      RIVAL_WARNING:
        "Deal with them blindly and you'll walk away robbed|Count your fingers after shaking hands with them|Keep your goods locked tight if they're nearby",
      SECRET_WHISPER:
        "Pull the awning shut and lower your voice — off the public ledger|Alright, you're a valued VIP partner — listen tight|Just between trusted traders, lean across the counter",
      SECRET_REVEAL_LEAD: "the private ledger truth is|here's the unrecorded deal:|strictly off the market board,",
      SECRET_REFUSE:
        "That ledger stays locked under brass key|Nice pitch, friend, but my private books stay closed|Trust is earned in steady deals before secrets change hands",
      RUMOR_OPENER:
        "Caravan drivers swapping tea swore that|Market-chatter from the south pier claims|Unconfirmed on my scales, yet buyers whisper that",
      RUMOR_TAG:
        "Verify the weight before paying gold for it|Could be market hype, could be tomorrow's surge|Smart traders listen to gossip, then check the facts",
      HELP_GRATITUDE:
        "{c:#7ef29d}{bounce}Splendid!{/bounce}{/c} Nothing beats reliable partners when routes turn rough|Much obliged — steady allies are worth more than gems|Now that's an investment I'm thrilled to back",
      HELP_DIRECTIVE:
        "Clear the main bottleneck threatening trade first|Cut the problem off at its root before prices spike worse|Move brisk and bring back good news",
      HELP_SUSPICIOUS:
        "Free favors in a market usually carry hidden interest — what's your fee?|What commission are you hoping to skim off me?|Show me real results before expecting store credit",
      COMPLIMENT_REACT:
        "Hah! Flattery won't shave ten percent off — though it nearly works!|Why thank you — presentation is half of good trade|Pleasure chatting with someone of such fine taste",
      COMPLIMENT_WARMTH:
        "You're easily my favorite patron this side of the archipelago!|Always save the ripest samples for kind customers!|Makes keeping shop an absolute joy!",
      COMPLIMENT_TAIL: "let's keep business booming|may gold find your pockets|always glad to see you",
      THREAT_DEFIANT:
        "Try shoplifting here and meet my {jiggle}weighted brass yardstick{/jiggle}|Empty bluff — I've outsmarted crooked pirates twice your size|Put that away before I hire three guards out of petty cash",
      THREAT_FEARFUL:
        "Whoa, easy! Don't smash the pottery — take a breath|Hold on, traveler! Everything's negotiable without violence|Put the blade down; broken crates help nobody's margins",
      THREAT_WARN_RIVAL:
        "Strong-arming folks like that reeks of|Pulling extortion stunts straight from the playbook of|Are you on the payroll of",
      FAREWELL_WARM:
        "Pleasure trading with you — safe voyages and {c:#ffe066}fat purses{/c}|Come back anytime your pack needs lightening|May every market greet you with surging prices, friend",
      FAREWELL_COLD:
        "Stall's closed to you — step along|Transaction voided; clear my awning|Off you go before I call the harbor watch",
      MOOD_GOOD:
        "Ledgers are balanced and demand is {c:#7ef29d}surging{/c} nicely today|Feeling brisk, bright, and ready for crisp deals|Coins are clinking and the sun's shining",
      MOOD_TENSE:
        "Too many overdue crates and not enough calm on the routes|Nerves are frayed watching supply charts dip|Hard to smile when pirates rattle the piers",
      MOOD_ANGRY:
        "My ledger's red and my temper's hotter than smelter slag|Zero patience left for nonsense at my stall|One more bad move and you're blacklisted permanently",
      CUSTOM_LORE_LEAD:
        "Here's a priceless nugget from the old guild almanac:|Veteran traders passed this golden rule down:|Funny you ask — every smart merchant knows:",
      FALLBACK_MUSE:
        "Hmm — couldn't quite tally the value of that remark|Run that offer by me one more time, clearer|Not sure what lane you're bargaining in there",
      FALLBACK_DEFLECT:
        "Let's keep our talk focused on real goods and solid islands|Time is coin, friend — skip the tangents|Speak practical so we can make headway",
      FALLBACK_PROMPT: "so what are you really shopping for|name your true business|give me the clear terms",
      ASK_BACK_OPEN:
        "What catches your eye at the market today?|Looking to buy, sell, or gather intel on the islands?|What's your venture today, friend?",
      ASK_BACK_TRADE:
        "Want to browse rare items, or catch up on trade rumors?|Interested in prized items, or juicy market rumors?|Goods and items, or local rumors — what pays better today?",
      SECRET_HINT:
        "Become a trusted regular and maybe I'll unlock the back-room ledger|There's premium inside info here, though not for first-time browsers|Earn solid trust, and the private vault opens",
      ACK_NEGATED_THREAT:
        "Whew! Glad we're keeping transactions strictly peaceful|Music to my ears — sliding the lockbox key back|Fair enough; false alarm cleared from the books",
      ACK_PLAYER_NAME: "Account opened in good standing — welcome,|Noted cleanly in my client book,|Pleasure meeting you,",
      CALLOUT_STANCE_CONTRADICTION:
        "Hold everything — you tried strong-arming me a moment ago, now you're sweet as sugarfruit|Don't switch sales pitches right after threatening my stall|Your credit score just bounced hard — explain yourself",
      CALLOUT_IDENTITY_CONTRADICTION:
        "Wait a tick — you signed a completely different name earlier|My ledger never lies: you introduced yourself under another name|Using aliases at my counter raises immediate red flags",
      CALLOUT_FACT_CONTRADICTION:
        "That's counterfeit nonsense — straight against verified market facts|Don't try selling me wooden coins when I hold the real weights|That contradicts plain reality across these islands",
      ALREADY_TOLD_CALLBACK:
        "Already quoted you that exact figure a moment ago,|Didn't we just settle that line item? Still,|Listen closely so I don't repeat the pitch:",
      UNKNOWN_CONCEPT_REACT:
        "Never stocked, traded, or priced anything called|Zero entries in any catalog for|What bizarre novelty is",
      DIRECT_ANSWER_YES:
        "Sold — pleasure doing business|Deal sealed cleanly|Splendid; stamped and agreed",
      DIRECT_ANSWER_NO:
        "Fair enough — no sale forced here|Your coin, your choice|Alright, shelving that offer",
      APOLOGY_ACCEPT:
        "Alright, let's write off that friction and restore good terms|Apology credited; keep transactions courteous from here|Fair enough — clean ledger going forward",
      APOLOGY_REJECT:
        "Sorry doesn't restock broken jars|Empty words carry zero market value after that stunt|Earn back store credit through steady deeds first",
      HYPOTHETICAL_EVAL:
        "Run a play like that and margins could double — or collapse overnight|On paper it shines; on rough waters it's steep risk|Smart to model the downside before investing",
      RIVAL_VICTIM_SYMPATHY:
        "They swindled you too? Shameless sharks|Looks like we've got a shared competitor to put out of business|If they burned your purse, you've got an ally behind this stall",
      PROBE_MOTIVE:
        "What's your real stake in this inquiry?|Who's bankrolling your questions?|Why the sudden interest in these details?",
      INSULT_PUSHBACK:
        "Mind your manners at a respectable stall|Keep running your mouth and pay double everywhere you go|Cheap insults buy zero favors here",
      ACCUSATION_DEFEND:
        "Audit my ledgers before slandering my name|My scales are balanced honest — check elsewhere for your thief|Baseless claim; show receipts or walk",
      HOP2_SOLUTION_LINK:
        "If you want the one item guaranteed to counter that crisis, secure|Only one asset turns the tide on that threat:|Your smartest investment against it is",
      CONFIRM_PROMISE:
        "Contract recorded in ink — honor your side|A trader's word is bond around these docks|Good — holding you to that deal",
      CLARIFY_EXPLAIN:
        "Let me break down the net terms simply:|Plain ledger talk:|Here's the bottom line:",
      META_DEFLECT:
        "Speak standard coin, friend — that sounded like broken abacus noise|You chewing strange mushrooms or something?|Drop the bizarre static and talk straight",
      STOP_REPEATING:
        "You're quoting the exact same line item again|We already closed that question — move to new business|Stop looping the pitch and ask something fresh",
      BOUNDARY_REFUSE:
        "Not for sale at any price — no|Hard boundary on that item; drop it|Offer all the gold in the spire and it's still no",
    },
  },
});

export default FORAGE_PERSONAS;
