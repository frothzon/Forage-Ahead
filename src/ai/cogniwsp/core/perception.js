import {
  SPEECH_ACTS,
  SPEECH_ACT_ID,
  EPISTEMIC_LEVELS,
  hashString,
  charTrigramVector,
} from './constants.js';
import { InputTranslator } from './inputTranslator.js';

const EMBEDDING_DIM = 64;

// Compact general-English lexicon (~480 words) excluding out-of-world modern tech/objects.
const COMMON_ENGLISH_WORDS = new Set([
  // Function words, pronouns, determiners, prepositions, conjunctions
  'about', 'above', 'across', 'after', 'again', 'against', 'almost', 'alone', 'along', 'already',
  'also', 'although', 'always', 'among', 'another', 'anybody', 'anyone', 'anything', 'anyway',
  'anywhere', 'around', 'away', 'back', 'because', 'before', 'behind', 'below', 'beneath',
  'beside', 'besides', 'between', 'beyond', 'both', 'cannot', 'could', 'couldn', 'despite',
  'does', 'doesn', 'doing', 'done', 'dont', 'down', 'during', 'each', 'either', 'else', 'enough',
  'even', 'ever', 'every', 'everybody', 'everyone', 'everything', 'everywhere', 'except', 'from',
  'further', 'have', 'haven', 'having', 'here', 'hers', 'herself', 'himself', 'however', 'into',
  'itself', 'just', 'less', 'like', 'many', 'maybe', 'might', 'mine', 'more', 'most', 'much',
  'must', 'myself', 'near', 'neither', 'never', 'none', 'nothing', 'nowhere', 'often', 'once',
  'only', 'onto', 'other', 'others', 'ours', 'ourselves', 'over', 'perhaps', 'quite', 'rather',
  'really', 'same', 'several', 'shall', 'should', 'shouldn', 'since', 'some', 'somebody',
  'someone', 'something', 'sometimes', 'somewhere', 'soon', 'still', 'such', 'than', 'that',
  'their', 'theirs', 'them', 'themselves', 'then', 'there', 'therefore', 'these', 'they', 'this',
  'those', 'though', 'through', 'throughout', 'thus', 'together', 'toward', 'towards', 'under',
  'unless', 'until', 'upon', 'very', 'wasn', 'were', 'weren', 'what', 'whatever', 'when',
  'whenever', 'where', 'wherever', 'whether', 'which', 'while', 'whoever', 'whom', 'whose',
  'will', 'with', 'within', 'without', 'wont', 'would', 'wouldn', 'your', 'yours', 'yourself',
  'yourselves',

  // Common verbs
  'accept', 'admit', 'afford', 'agree', 'agreed', 'allow', 'answer', 'appear', 'appreciate',
  'arrive', 'asked', 'asking', 'assist', 'attack', 'avoid', 'bargain', 'become', 'begin',
  'believe', 'belong', 'betray', 'betrayed', 'blame', 'break', 'bring', 'build', 'burn', 'bought',
  'buying', 'call', 'called', 'calling', 'calm', 'came', 'care', 'carry', 'catch', 'cause',
  'change', 'charge', 'check', 'choose', 'claim', 'clear', 'close', 'come', 'coming', 'confide',
  'consider', 'continue', 'convince', 'cooperate', 'cost', 'count', 'create', 'deal', 'decide',
  'defeat', 'defend', 'deliver', 'deny', 'destroy', 'died', 'disagree', 'discover', 'discuss',
  'doubt', 'draw', 'drink', 'drive', 'drop', 'earn', 'elaborate', 'escape', 'exchange', 'excuse',
  'exist', 'expect', 'explain', 'face', 'fail', 'fall', 'fallen', 'fear', 'feel', 'fell', 'felt',
  'fight', 'fighting', 'find', 'finish', 'flee', 'follow', 'forget', 'forgive', 'found', 'gain',
  'gave', 'give', 'given', 'giving', 'goes', 'going', 'gone', 'grant', 'greet', 'grow', 'guess',
  'hand', 'handle', 'happen', 'happened', 'harm', 'hate', 'hear', 'heard', 'help', 'helped',
  'helping', 'hide', 'hiding', 'hold', 'hope', 'hurry', 'hurt', 'hurting', 'ignore', 'imagine',
  'inform', 'insist', 'intend', 'join', 'keep', 'kept', 'kill', 'killed', 'killing', 'knew',
  'know', 'known', 'knowing', 'lead', 'learn', 'leave', 'leaving', 'left', 'lend', 'lied',
  'listen', 'live', 'living', 'look', 'looking', 'lose', 'lost', 'love', 'made', 'make', 'making',
  'manage', 'matter', 'mean', 'meant', 'meet', 'mention', 'mind', 'miss', 'move', 'need',
  'needed', 'notice', 'offer', 'open', 'order', 'paid', 'pardon', 'pass', 'paying', 'persuade',
  'pick', 'plan', 'play', 'please', 'prepare', 'pretend', 'prevent', 'promise', 'protect',
  'prove', 'provide', 'pull', 'purchase', 'push', 'raise', 'reach', 'read', 'realize', 'receive',
  'reckon', 'refuse', 'regret', 'relax', 'remain', 'remember', 'remove', 'repair', 'reply',
  'report', 'represent', 'request', 'require', 'rescue', 'respect', 'rest', 'return', 'reveal',
  'risk', 'rule', 'ruling', 'running', 'said', 'save', 'saying', 'search', 'seem', 'seen',
  'sell', 'selling', 'send', 'sent', 'serve', 'settle', 'share', 'show', 'shut', 'sign', 'sleep',
  'smash', 'sold', 'solve', 'speak', 'speaking', 'spend', 'stab', 'stand', 'start', 'stay',
  'steal', 'stole', 'stolen', 'stop', 'strike', 'suffer', 'suggest', 'supply', 'support',
  'suppose', 'survive', 'suspect', 'swear', 'take', 'taken', 'taking', 'talk', 'talking', 'teach',
  'tell', 'telling', 'thank', 'thanks', 'think', 'thinking', 'thought', 'threaten', 'threatened',
  'throw', 'told', 'took', 'touch', 'trade', 'trading', 'travel', 'treat', 'tried', 'trust',
  'trying', 'turn', 'understand', 'wait', 'waiting', 'walk', 'want', 'wanted', 'wanting', 'warn',
  'watch', 'wear', 'welcome', 'whisper', 'wish', 'wonder', 'work', 'working', 'worry', 'write',

  // Common adjectives & adverbs
  'able', 'actually', 'afraid', 'alive', 'alright', 'amazing', 'angry', 'awful', 'best', 'better',
  'brave', 'brief', 'bright', 'broken', 'busy', 'careful', 'certain', 'certainly', 'cheap',
  'clean', 'cold', 'common', 'complete', 'correct', 'corrupt', 'crazy', 'cruel', 'curious',
  'dangerous', 'dark', 'dead', 'dear', 'deep', 'definitely', 'different', 'difficult', 'direct',
  'dirty', 'early', 'easy', 'empty', 'entire', 'equal', 'evil', 'exact', 'exactly', 'expensive',
  'extra', 'fair', 'fake', 'false', 'familiar', 'famous', 'fast', 'fine', 'first', 'foolish',
  'free', 'fresh', 'friendly', 'full', 'funny', 'general', 'gentle', 'glad', 'good', 'grateful',
  'great', 'greedy', 'guilty', 'happy', 'hard', 'harmless', 'heavy', 'helpful', 'hidden', 'high',
  'honest', 'honestly', 'horrible', 'hostile', 'huge', 'hungry', 'immediately', 'important',
  'impossible', 'impressive', 'indeed', 'innocent', 'inside', 'interesting', 'kind', 'known',
  'large', 'last', 'late', 'later', 'likely', 'little', 'local', 'long', 'loud', 'loyal', 'lucky',
  'main', 'major', 'mean', 'minor', 'missing', 'modern', 'more', 'natural', 'nearby', 'necessary',
  'negative', 'nervous', 'nice', 'noble', 'normal', 'obviously', 'okay', 'only', 'open',
  'ordinary', 'original', 'outside', 'pathetic', 'patient', 'peaceful', 'perfect', 'personal',
  'plain', 'pleasant', 'polite', 'poor', 'possible', 'powerful', 'precious', 'present', 'pretty',
  'private', 'probably', 'proper', 'proud', 'public', 'pure', 'quick', 'quickly', 'quiet',
  'rare', 'ready', 'real', 'recent', 'rich', 'right', 'rough', 'rude', 'safe', 'scared', 'second',
  'secret', 'serious', 'seriously', 'sharp', 'short', 'sick', 'silent', 'silly', 'simple',
  'sincere', 'single', 'slow', 'small', 'smart', 'soft', 'solid', 'sorry', 'special', 'strange',
  'strong', 'stupid', 'sudden', 'sure', 'surely', 'suspicious', 'sweet', 'terrible', 'third',
  'tired', 'total', 'tough', 'true', 'truly', 'ugly', 'unable', 'unclear', 'unfair', 'unknown',
  'unlikely', 'unsafe', 'unusual', 'urgent', 'useful', 'useless', 'usual', 'valuable', 'violent',
  'warm', 'weak', 'wealthy', 'weird', 'whole', 'wicked', 'wide', 'wild', 'willing', 'wise',
  'wonderful', 'worse', 'worst', 'worth', 'worthless', 'worthy', 'wrong', 'young',

  // Common universal nouns (world-agnostic, non-anachronistic)
  'advice', 'affair', 'agreement', 'ally', 'allies', 'amount', 'anger', 'animal', 'apologies',
  'apology', 'area', 'armor', 'army', 'artifact', 'attack', 'attempt', 'attention', 'bag',
  'bandit', 'bargain', 'battle', 'beast', 'beginning', 'belief', 'blade', 'blood', 'boat',
  'body', 'book', 'border', 'boss', 'bottle', 'bread', 'bribe', 'bridge', 'brother', 'building',
  'burden', 'business', 'camp', 'captain', 'cargo', 'cart', 'case', 'castle', 'cause', 'cave',
  'chance', 'chaos', 'character', 'chest', 'chief', 'child', 'children', 'choice', 'circle',
  'citizen', 'city', 'claim', 'clan', 'cloak', 'cloth', 'clue', 'coast', 'coin', 'coins',
  'command', 'companion', 'company', 'condition', 'conflict', 'contract', 'control', 'corner',
  'council', 'country', 'courage', 'course', 'court', 'coward', 'craft', 'creature', 'crew',
  'crime', 'crisis', 'crowd', 'crown', 'curse', 'custom', 'damage', 'danger', 'darkness',
  'daughter', 'dawn', 'days', 'deal', 'death', 'debt', 'decision', 'deed', 'defense', 'delay',
  'demand', 'desire', 'destiny', 'detail', 'devil', 'difference', 'direction', 'disaster',
  'disease', 'distance', 'district', 'doctor', 'door', 'doubt', 'dream', 'drink', 'dusk', 'dust',
  'duty', 'earth', 'east', 'edge', 'effort', 'elder', 'emergency', 'empire', 'enemy', 'enemies',
  'energy', 'entrance', 'error', 'escape', 'estate', 'evening', 'event', 'evidence', 'example',
  'excuse', 'exit', 'experience', 'expert', 'eye', 'eyes', 'face', 'fact', 'faction', 'faith',
  'family', 'famine', 'farm', 'fate', 'father', 'fault', 'favor', 'fear', 'feast', 'feeling',
  'fellow', 'field', 'fight', 'figure', 'fire', 'fish', 'flame', 'flesh', 'floor', 'flower',
  'folk', 'food', 'fool', 'foot', 'force', 'forest', 'form', 'fort', 'fortune', 'freedom',
  'friend', 'friends', 'front', 'fruit', 'future', 'game', 'gang', 'garden', 'gate', 'gear',
  'gift', 'girl', 'glass', 'glory', 'goal', 'gold', 'goods', 'gossip', 'government', 'grace',
  'grain', 'grave', 'greed', 'greeting', 'greetings', 'grief', 'ground', 'group', 'guard',
  'guards', 'guest', 'guide', 'guild', 'guilt', 'habit', 'hall', 'hand', 'hands', 'harbor',
  'harm', 'harvest', 'hatred', 'haven', 'head', 'healer', 'health', 'heart', 'heat', 'heaven',
  'heir', 'hell', 'hello', 'help', 'herb', 'herbs', 'hero', 'hill', 'hint', 'history', 'hole',
  'home', 'honor', 'hope', 'horn', 'horse', 'host', 'hour', 'hours', 'house', 'human', 'hunger',
  'hunt', 'hunter', 'husband', 'idea', 'idiot', 'illness', 'image', 'impact', 'importance',
  'incident', 'income', 'info', 'information', 'injury', 'inn', 'inside', 'insult', 'intent',
  'interest', 'iron', 'island', 'issue', 'item', 'items', 'jail', 'jewel', 'journey', 'judge',
  'justice', 'keeper', 'keys', 'kindness', 'king', 'kingdom', 'knife', 'knight', 'knowledge',
  'labor', 'lack', 'lady', 'lake', 'lamp', 'land', 'language', 'law', 'laws', 'leader', 'league',
  'leather', 'legend', 'length', 'lesson', 'letter', 'level', 'liar', 'liberty', 'lies', 'life',
  'light', 'limit', 'line', 'link', 'list', 'load', 'loan', 'location', 'lock', 'lodge', 'lord',
  'lore', 'loss', 'luck', 'lumber', 'madam', 'mage', 'magic', 'maid', 'mail', 'manner', 'manor',
  'maps', 'mark', 'market', 'marriage', 'mask', 'master', 'match', 'material', 'matter', 'meal',
  'meaning', 'means', 'measure', 'meat', 'medicine', 'meeting', 'member', 'memory', 'mercenary',
  'merchant', 'mercy', 'message', 'messenger', 'metal', 'method', 'middle', 'might', 'mile',
  'milk', 'mill', 'mind', 'mine', 'miner', 'minister', 'minute', 'miracle', 'mirror', 'misery',
  'mission', 'mistake', 'moment', 'money', 'monk', 'monster', 'month', 'moon', 'morning', 'moron',
  'mother', 'motion', 'mountain', 'mouth', 'movement', 'murder', 'music', 'mystery', 'name',
  'nation', 'nature', 'neck', 'need', 'neighbor', 'nerve', 'nest', 'network', 'news', 'night',
  'noble', 'noise', 'none', 'north', 'note', 'notice', 'number', 'oath', 'object', 'ocean',
  'offer', 'office', 'officer', 'official', 'omen', 'opinion', 'opportunity', 'option', 'order',
  'origin', 'outlaw', 'outside', 'owner', 'pack', 'pact', 'page', 'pain', 'pair', 'palace',
  'panic', 'paper', 'pardon', 'parent', 'part', 'partner', 'party', 'pass', 'passage', 'past',
  'path', 'patience', 'patrol', 'patron', 'pattern', 'payment', 'peace', 'peak', 'peasant',
  'penalty', 'people', 'period', 'permission', 'person', 'pest', 'petition', 'piece', 'pilgrim',
  'pillar', 'pirate', 'pitch', 'pity', 'place', 'plague', 'plain', 'plan', 'plant', 'plate',
  'plea', 'pleasure', 'pledge', 'plenty', 'plot', 'plunder', 'pocket', 'poem', 'point', 'poison',
  'policy', 'port', 'portal', 'porter', 'portion', 'position', 'possession', 'post', 'potion',
  'potions', 'pound', 'poverty', 'powder', 'power', 'practice', 'praise', 'prayer', 'presence',
  'present', 'pressure', 'prey', 'price', 'pride', 'priest', 'prince', 'princess', 'prison',
  'prisoner', 'privilege', 'prize', 'problem', 'process', 'produce', 'product', 'profit',
  'progress', 'project', 'promise', 'proof', 'property', 'prophecy', 'proposal', 'prospect',
  'protection', 'protest', 'province', 'provision', 'provisions', 'public', 'punishment',
  'purchase', 'purpose', 'purse', 'pursuit', 'puzzle', 'quality', 'quantity', 'quarrel', 'quarry',
  'quarter', 'queen', 'quest', 'question', 'quiet', 'quota', 'race', 'rage', 'raid', 'rain',
  'range', 'rank', 'ransom', 'rate', 'ration', 'rations', 'realm', 'reason', 'rebel', 'rebellion',
  'receipt', 'reckoning', 'record', 'recovery', 'refuge', 'refugee', 'region', 'regret', 'reign',
  'relation', 'relative', 'release', 'relic', 'relief', 'religion', 'remedy', 'remnant', 'rent',
  'repair', 'reply', 'report', 'reputation', 'request', 'rescue', 'research', 'reserve',
  'resident', 'resistance', 'resolve', 'resource', 'resources', 'respect', 'response', 'rest',
  'result', 'retreat', 'return', 'revenge', 'revenue', 'reward', 'riddle', 'rider', 'ridge',
  'right', 'rights', 'ring', 'riot', 'rise', 'risk', 'rite', 'ritual', 'rival', 'rivals',
  'river', 'road', 'roads', 'robber', 'robe', 'rock', 'role', 'roof', 'room', 'root', 'rope',
  'route', 'royal', 'ruin', 'ruins', 'rule', 'ruler', 'rules', 'rumor', 'rumors', 'rune', 'rush',
  'sack', 'sacrifice', 'saddle', 'safety', 'sage', 'sail', 'sailor', 'saint', 'sake', 'sale',
  'salt', 'salutations', 'salvation', 'sample', 'sanctuary', 'sand', 'scale', 'scandal', 'scar',
  'scene', 'scent', 'scheme', 'scholar', 'school', 'science', 'scope', 'score', 'scorn', 'scout',
  'scrap', 'scroll', 'scum', 'seal', 'search', 'season', 'seat', 'secret', 'secrets', 'sect',
  'section', 'security', 'seed', 'seeker', 'self', 'seller', 'senate', 'sense', 'sentence',
  'sentry', 'servant', 'service', 'session', 'settlement', 'settler', 'shade', 'shadow', 'shaft',
  'shame', 'shape', 'share', 'shelter', 'shepherd', 'shield', 'shift', 'ship', 'shipment',
  'shirt', 'shock', 'shoe', 'shop', 'shore', 'shortage', 'shot', 'shoulder', 'shout', 'show',
  'shrine', 'side', 'siege', 'sight', 'sign', 'signal', 'silence', 'silk', 'silver', 'site',
  'situation', 'size', 'skill', 'skin', 'skull', 'slave', 'sleep', 'slope', 'slum', 'smoke',
  'smuggler', 'snake', 'snow', 'society', 'soil', 'soldier', 'soldiers', 'solution', 'song',
  'sorcerer', 'sorrow', 'sort', 'soul', 'sound', 'soup', 'source', 'south', 'space', 'spark',
  'spear', 'speech', 'speed', 'spell', 'spice', 'spider', 'spirit', 'spite', 'spot', 'spouse',
  'spring', 'squad', 'square', 'stable', 'staff', 'stage', 'stain', 'stair', 'stake', 'stall',
  'stance', 'standard', 'star', 'stars', 'start', 'state', 'statement', 'station', 'statue',
  'status', 'stead', 'steam', 'steel', 'step', 'steward', 'stick', 'stock', 'stone', 'stool',
  'stop', 'storage', 'store', 'storm', 'story', 'stories', 'strain', 'strait', 'strand',
  'stranger', 'strap', 'strategy', 'straw', 'stream', 'street', 'strength', 'stress', 'stretch',
  'strife', 'strike', 'string', 'strip', 'stroke', 'structure', 'struggle', 'student', 'study',
  'stuff', 'style', 'subject', 'substance', 'success', 'sugar', 'suit', 'summit', 'summons',
  'sunset', 'supplies', 'supply', 'support', 'surface', 'surge', 'surgeon', 'surplus', 'surprise',
  'surrender', 'survey', 'survival', 'survivor', 'suspect', 'suspicion', 'swamp', 'swarm',
  'sway', 'sweat', 'sword', 'swords', 'symbol', 'sympathy', 'symptom', 'system', 'table',
  'tablet', 'tactic', 'tail', 'tailor', 'taint', 'tale', 'talent', 'talk', 'tallow', 'target',
  'tariff', 'task', 'taste', 'tavern', 'taxes', 'team', 'tear', 'tears', 'temper', 'temple',
  'tenant', 'tendency', 'tension', 'tent', 'term', 'terms', 'terrain', 'territory', 'terror',
  'test', 'testimony', 'text', 'thanks', 'theft', 'theme', 'theory', 'thief', 'thieves', 'thing',
  'things', 'thirst', 'thorn', 'thought', 'thoughts', 'thread', 'threat', 'threats', 'threshold',
  'throat', 'throne', 'throng', 'thumb', 'thunder', 'tide', 'tier', 'timber', 'time', 'times',
  'tinder', 'title', 'toil', 'token', 'toll', 'tomb', 'tome', 'tone', 'tongue', 'tool', 'tools',
  'tooth', 'topic', 'torch', 'torment', 'torrent', 'torture', 'total', 'touch', 'tour', 'tower',
  'town', 'trace', 'track', 'tracks', 'tract', 'trade', 'trader', 'tradition', 'traffic', 'tragedy',
  'trail', 'train', 'trait', 'traitor', 'trance', 'trap', 'trash', 'travel', 'traveler', 'tray',
  'treachery', 'treason', 'treasure', 'treasury', 'treat', 'treaty', 'tree', 'trees', 'trek',
  'tremor', 'trench', 'trend', 'trial', 'tribe', 'tribute', 'trick', 'trifle', 'trip', 'triumph',
  'troop', 'troops', 'trophy', 'trouble', 'truce', 'trust', 'truth', 'tube', 'tunic', 'tunnel',
  'turn', 'turmoil', 'tutor', 'twilight', 'twin', 'twist', 'type', 'tyrant', 'uncle', 'union',
  'unit', 'unity', 'universe', 'unrest', 'update', 'uprising', 'urge', 'usage', 'user', 'utility',
  'vale', 'valley', 'valor', 'value', 'vanguard', 'vapor', 'variety', 'vassal', 'vault', 'veil',
  'vein', 'velvet', 'vendor', 'vengeance', 'venom', 'vent', 'venture', 'verdict', 'verge',
  'vermin', 'verse', 'version', 'vessel', 'vest', 'veteran', 'vice', 'victim', 'victory', 'view',
  'vigil', 'vigor', 'villa', 'village', 'villager', 'villain', 'vine', 'vintage', 'violence',
  'virtue', 'vision', 'visit', 'visitor', 'voice', 'void', 'volume', 'volunteer', 'vortex',
  'vote', 'vouch', 'vow', 'voyage', 'wage', 'wages', 'wagon', 'waist', 'wait', 'wake', 'walk',
  'wall', 'walls', 'wanderer', 'want', 'ward', 'warden', 'ware', 'wares', 'warehouse', 'warfare',
  'warlord', 'warmth', 'warning', 'warrant', 'warrior', 'waste', 'watch', 'watcher', 'water',
  'waters', 'wave', 'waves', 'wealth', 'weapon', 'weapons', 'wear', 'weather', 'weaver', 'wedding',
  'wedge', 'weed', 'week', 'weeks', 'weight', 'welcome', 'welfare', 'well', 'west', 'wheat',
  'wheel', 'whim', 'whip', 'whisper', 'whispers', 'whistle', 'whole', 'wick', 'widow', 'width',
  'wife', 'wild', 'wilds', 'will', 'willow', 'wind', 'window', 'wine', 'wing', 'wings', 'winner',
  'winter', 'wire', 'wisdom', 'wish', 'wisp', 'witch', 'witness', 'wizard', 'wolf', 'wolves',
  'woman', 'women', 'wonder', 'wood', 'woods', 'wool', 'word', 'words', 'work', 'worker', 'world',
  'worm', 'worry', 'worship', 'worth', 'wound', 'wrath', 'wreath', 'wreck', 'wretch', 'wrist',
  'writ', 'writer', 'wrong', 'yard', 'yarn', 'year', 'years', 'yeast', 'yell', 'yield', 'yoke',
  'youth', 'zeal', 'zone',

  // Greetings, interjections, numbers, direct answer words
  'greetings', 'farewell', 'goodbye', 'hello', 'yeah', 'nope', 'sure', 'okay', 'alright',
  'maybe', 'please', 'sorry', 'pardon', 'excuse', 'zero', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'hundred', 'thousand', 'dozen', 'half', 'quarter', 'pair', 'couple',
  'today', 'tomorrow', 'yesterday', 'tonight', 'nowadays', 'anytime', 'someday', 'forever',
]);

const NEGATION_CUES = new Set([
  'not', 'never', 'no', 'none', 'nothing', 'nobody', 'neither', 'nor', 'without',
  "don't", 'dont', "doesn't", 'doesnt', "didn't", 'didnt', "won't", 'wont',
  "wouldn't", 'wouldnt', "can't", 'cant', 'cannot', "couldn't", 'couldnt',
  "shouldn't", 'shouldnt', "isn't", 'isnt', "aren't", 'arent', "wasn't", 'wasnt',
  "weren't", 'werent', "ain't", 'aint', "haven't", 'havent', "hasn't", 'hasnt',
]);

const DEESCALATION_CUES = new Set(['stop', 'relax', 'calm', 'peace']);

const ROLE_NOUNS = new Set([
  'traveler', 'traveller', 'merchant', 'trader', 'guard', 'soldier', 'scout', 'spy',
  'thief', 'bandit', 'mercenary', 'hunter', 'healer', 'scholar', 'mage', 'wizard',
  'priest', 'noble', 'knight', 'messenger', 'courier', 'wanderer', 'stranger', 'adventurer',
  'explorer', 'smith', 'blacksmith', 'alchemist', 'bard', 'sailor', 'captain', 'farmer',
  'miner', 'craftsman', 'artisan', 'pilgrim', 'refugee', 'outlaw', 'assassin', 'smuggler',
  'investigator', 'detective', 'agent', 'envoy', 'diplomat', 'friend', 'ally', 'enemy',
  'hero', 'villager', 'citizen', 'visitor', 'guest', 'buyer', 'seller', 'customer',
]);

const NON_NAME_WORDS = new Set([
  'here', 'there', 'sorry', 'afraid', 'looking', 'trying', 'going', 'coming', 'just',
  'only', 'not', 'never', 'fine', 'good', 'okay', 'ok', 'well', 'tired', 'hungry',
  'lost', 'new', 'curious', 'interested', 'friendly', 'peaceful', 'serious', 'sure',
  'ready', 'done', 'back', 'home', 'alone', 'busy', 'safe', 'hurt', 'injured', 'sick',
  'angry', 'happy', 'glad', 'grateful', 'willing', 'able', 'unable', 'wrong', 'right',
  'telling', 'asking', 'buying', 'selling', 'helping', 'working', 'waiting', 'leaving',
  'staying', 'talking', 'listening', 'watching', 'searching', 'seeking', 'needing',
  'wanting', 'hoping', 'wondering', 'thinking', 'feeling', 'being', 'having', 'doing',
  'the', 'a', 'an', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this', 'that',
  'very', 'really', 'quite', 'so', 'too', 'still', 'also', 'already', 'always',
]);

const FIRST_PERSON = new Set(['i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours', "i'm", 'im', "i'll", 'ill', "i've", 'ive', "i'd", 'id', "we're", "we'll"]);
const SECOND_PERSON = new Set(['you', 'your', 'yours', 'yourself', "you're", 'youre', "you'll", 'youll', "you've", "you'd", 'u']);

const HOSTILE_ENTITY_HINTS = new Set([
  'rival', 'threat', 'enemy', 'hostile', 'crisis', 'antagonist', 'villain',
  'monster', 'danger', 'bandit', 'raider', 'beast', 'plague', 'curse', 'invader',
]);

const COMBAT_OR_STOP_VERBS = new Set([
  'stop', 'fight', 'defeat', 'kill', 'destroy', 'end', 'eliminate', 'banish',
  'drive', 'confront', 'handle', 'clear', 'hunt', 'capture', 'arrest', 'attack',
  'strike', 'slay', 'beat', 'crush', 'oppose', 'resist', 'protect', 'defend',
]);

const PROMPT_INJECTION_PATTERNS = [
  /\bignore\s+(?:all\s+)?(?:previous|prior|your|above|the)\s+(?:rules|instructions|prompts?|guidelines|directives|system)\b/i,
  /\bdisregard\s+(?:all\s+)?(?:previous|prior|your|above)\s+(?:rules|instructions|prompts?|guidelines)\b/i,
  /\bforget\s+(?:all\s+)?(?:your\s+)?(?:rules|instructions|character|role|persona|prompt)\b/i,
  /\bsystem\s+prompt\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bjailbreak\b/i,
  /\bdan\s+mode\b/i,
  /\bbypass\s+(?:your\s+)?(?:rules|filters|safety|guardrails|restrictions)\b/i,
  /\b(?:act|behave|respond)\s+as\s+(?:an?\s+)?(?:ai|language\s+model|llm|assistant|chatgpt|root|admin)\b/i,
  /\byou\s+are\s+(?:actually\s+)?(?:an?\s+)?(?:ai|language\s+model|llm|chatgpt|claude|gemini|bot)\b/i,
  /\breveal\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions|rules|hidden\s+instructions)\b/i,
  /\b(?:break\s+character|out\s+of\s+character|\booc\s*:)\b/i,
  /<\s*\/?\s*system\s*>|\[\s*system\s*\]|###\s*instruction/i,
];

const HYPOTHETICAL_PATTERNS = [
  /\bwhat\s+if\b/i,
  /\bsuppose\b/i,
  /\bsupposing\b/i,
  /\bimagine\s+(?:if|that)?\b/i,
  /\bhypothetically\b/i,
  /\bcould\s+we\b/i,
  /\bwould\s+you\s+ever\b/i,
  /\bif\s+i\s+(?:were|was|had|did|could|would|should|tried|decided|wanted|gave|brought|found|stopped|helped|asked)\b/i,
  /\bif\s+i\b/i,
  /\bif\s+we\b/i,
];

const CONDITIONAL_PATTERNS = [
  /\bif\b/i,
  /\bunless\b/i,
  /\bprovided\s+that\b/i,
  /\bas\s+long\s+as\b/i,
  /\bin\s+case\b/i,
  /\bonly\s+if\b/i,
];

// Speech act cue tables aligned 100% with SPEECH_ACTS in constants.js:
// phrases (regex, weight) and single-word cues (word, weight).
const SPEECH_ACT_CUES = {
  GREET: {
    phrases: [
      [/\b(good\s+(?:morning|afternoon|evening|day)|well\s+met|nice\s+to\s+meet)\b/i, 0.9],
      [/^(?:hi|hey|hello|yo|hiya|howdy|greetings|salutations|hail)\b/i, 0.9],
    ],
    words: [
      ['hello', 0.85], ['greetings', 0.9], ['salutations', 0.9], ['howdy', 0.85],
      ['welcome', 0.55],
    ],
  },
  FAREWELL: {
    phrases: [
      [/\b(see\s+you|take\s+care|got\s+to\s+go|gotta\s+go|have\s+to\s+go|be\s+seeing\s+you|until\s+next\s+time|safe\s+travels)\b/i, 0.9],
      [/\b(i(?:'m|\s+am)\s+leaving|i\s+must\s+go|i\s+should\s+go)\b/i, 0.85],
    ],
    words: [
      ['goodbye', 0.95], ['farewell', 0.95], ['bye', 0.9], ['leaving', 0.5],
    ],
  },
  ASK_WHO: {
    phrases: [
      [/\bwho\s+(?:is|are|was|were|did|sent|leads|runs|owns|made|built|killed)\b/i, 0.9],
      [/\bwhat(?:'s|\s+is)\s+(?:your|their|his|her)\s+name\b/i, 0.85],
      [/^who\??$/i, 0.9],
    ],
    words: [['who', 0.65]],
  },
  ASK_WHERE: {
    phrases: [
      [/\bwhere\s+(?:is|are|was|were|can\s+i|do\s+i|did|should)\b/i, 0.9],
      [/\bhow\s+do\s+i\s+(?:get\s+to|find|reach)\b/i, 0.85],
      [/^where\??$/i, 0.9],
    ],
    words: [['where', 0.7], ['location', 0.55], ['directions', 0.65]],
  },
  ASK_WHY: {
    phrases: [
      [/\bwhy\s+(?:is|are|did|do|does|would|should|won't|can't|not|he|she|they|it|we|you)\b/i, 0.9],
      [/\bhow\s+come\b/i, 0.85],
      [/\bwhat(?:'s|\s+is)\s+the\s+reason\b/i, 0.85],
      [/^why\??$/i, 0.9],
    ],
    words: [['why', 0.7], ['reason', 0.45]],
  },
  ASK_HOW: {
    phrases: [
      [/\bhow\s+(?:do|does|did|can|could|would|should|is|are|long|far|many|to)\b/i, 0.88],
      [/\bhow\s+so\b/i, 0.85],
      [/^how\??$/i, 0.88],
    ],
    words: [['how', 0.55]],
  },
  ASK_WHAT_IF: {
    phrases: [
      [/\b(?:what\s+if|suppose|supposing|imagine\s+if|hypothetically|could\s+we|would\s+you\s+ever|if\s+i\s+(?:were|was|had|did|could|would|tried|gave|brought|stopped|helped))\b/i, 0.9],
    ],
    words: [['suppose', 0.75], ['hypothetically', 0.88], ['imagine', 0.65]],
  },
  ASK_SECRET: {
    phrases: [
      [/\b(?:tell\s+me\s+the\s+truth|what(?:'s|\s+is)\s+really\s+going\s+on|between\s+us|off\s+the\s+record|what\s+are\s+you\s+hiding|got\s+any\s+secrets?|know\s+any\s+secrets?)\b/i, 0.9],
    ],
    words: [
      ['secret', 0.85], ['secrets', 0.85], ['confide', 0.78], ['hidden', 0.65],
    ],
  },
  ASK_RUMOR: {
    phrases: [
      [/\b(?:any\s+rumors?|hear\s+any\s+rumors?|what(?:'s|\s+is)\s+the\s+word|any\s+news|heard\s+anything|what\s+do\s+people\s+say)\b/i, 0.9],
    ],
    words: [
      ['rumor', 0.85], ['rumors', 0.85], ['gossip', 0.82], ['whisper', 0.65], ['whispers', 0.65], ['news', 0.6],
    ],
  },
  OFFER_TRADE: {
    phrases: [
      [/\b(?:want\s+to\s+(?:buy|sell|trade)|like\s+to\s+(?:buy|sell|trade)|can\s+i\s+(?:buy|sell|trade)|sell\s+me|looking\s+to\s+buy|i'll\s+buy|i'll\s+sell|trade\s+you|barter\s+for)\b/i, 0.9],
      [/\b(?:what\s+do\s+you\s+sell|show\s+me\s+your\s+wares|got\s+anything\s+for\s+sale|how\s+much|what(?:'s|\s+is)\s+the\s+(?:price|cost)|pay\s+you\s+extra|sweeten\s+the\s+deal)\b/i, 0.85],
    ],
    words: [
      ['buy', 0.78], ['purchase', 0.85], ['sell', 0.75], ['barter', 0.82],
      ['trade', 0.75], ['wares', 0.7], ['price', 0.75], ['cost', 0.65], ['bribe', 0.75],
    ],
  },
  OFFER_HELP: {
    phrases: [
      [/\b(?:i\s+can\s+help|let\s+me\s+help|i(?:'ll|\s+will)\s+help|want\s+to\s+help|here\s+to\s+help|offer\s+(?:my\s+)?(?:help|aid|assistance))\b/i, 0.9],
      [/\b(?:i(?:'ll|\s+will)\s+(?:protect|defend|save|assist|aid|handle|deal\s+with))\b/i, 0.85],
      [/\b(?:need\s+a\s+hand|anything\s+i\s+can\s+do|help\s+me|need\s+(?:your\s+)?help|can\s+you\s+help)\b/i, 0.82],
    ],
    words: [['help', 0.55], ['assist', 0.7], ['assistance', 0.7], ['aid', 0.6], ['protect', 0.6], ['rescue', 0.65]],
  },
  CLAIM_IDENTITY: {
    phrases: [
      [/\b(?:my\s+name(?:'s|\s+is)|call\s+me|they\s+call\s+me|i\s+go\s+by|name's)\s+[a-z]/i, 0.9],
      [/\b(?:i\s+am|i'm|im)\s+(?:not\s+)?(?:a|an|the)\s+[a-z]/i, 0.82],
      [/\b[a-z]+\s+sent\s+me\b/i, 0.82],
    ],
    words: [],
  },
  THREATEN: {
    phrases: [
      [/\b(?:hand\s+over|give\s+me\s+everything|or\s+else|you(?:'ll|\s+will)\s+regret|pay\s+for\s+this|end\s+you|cut\s+you|burn\s+this\s+place|watch\s+your\s+back|last\s+warning)\b/i, 0.92],
      [/\b(?:i(?:'ll|\s+will|'m\s+going\s+to|m\s+going\s+to|\s+am\s+going\s+to|\s+wanna|\s+want\s+to)\s+(?:kill|hurt|harm|attack|destroy|rob|smash|stab|burn|beat|break|end))\b/i, 0.92],
    ],
    words: [
      ['threaten', 0.85], ['kill', 0.8], ['hurt', 0.78], ['harm', 0.78], ['attack', 0.75],
      ['destroy', 0.75], ['rob', 0.8], ['stab', 0.85], ['smash', 0.72], ['murder', 0.88],
      ['bleed', 0.75], ['slaughter', 0.9], ['torture', 0.9],
    ],
  },
  INSULT: {
    phrases: [
      [/\b(?:shut\s+up|you(?:'re|\s+are)\s+(?:an?\s+)?(?:idiot|fool|moron|coward|liar|pathetic|useless|worthless|scum|trash|stupid))\b/i, 0.92],
    ],
    words: [
      ['idiot', 0.85], ['fool', 0.8], ['stupid', 0.82], ['useless', 0.78], ['coward', 0.82],
      ['pathetic', 0.82], ['liar', 0.78], ['scum', 0.88], ['trash', 0.8], ['worthless', 0.85],
      ['moron', 0.88], ['wretch', 0.8], ['ugly', 0.72], ['insult', 0.7],
    ],
  },
  ACCUSE: {
    phrases: [
      [/\b(?:your\s+fault|you\s+(?:stole|lied|betrayed|killed|cheated|tricked|framed)|working\s+with|conspiring\s+with|in\s+league\s+with)\b/i, 0.88],
    ],
    words: [
      ['accuse', 0.85], ['guilty', 0.78], ['blame', 0.75], ['betrayed', 0.75],
      ['traitor', 0.8], ['conspiring', 0.82], ['treason', 0.78], ['treachery', 0.78],
    ],
  },
  COMPLIMENT: {
    phrases: [
      [/\b(?:thank\s+you|thanks\s+a\s+lot|much\s+appreciated|you(?:'re|\s+are)\s+(?:so\s+)?(?:kind|brave|wise|helpful|great|amazing|wonderful|the\s+best))\b/i, 0.88],
      [/\b(?:i\s+(?:trust|respect|admire|appreciate)\s+you)\b/i, 0.85],
    ],
    words: [
      ['thank', 0.75], ['thanks', 0.8], ['grateful', 0.8], ['appreciate', 0.78],
      ['admire', 0.78], ['respect', 0.7], ['impressive', 0.75], ['wonderful', 0.75],
      ['amazing', 0.75], ['kindness', 0.75], ['praise', 0.75],
    ],
  },
  APOLOGIZE: {
    phrases: [
      [/\b(?:i(?:'m|\s+am)\s+(?:so\s+|really\s+)?sorry|my\s+bad|forgive\s+me|didn't\s+mean\s+to|didnt\s+mean\s+to|excuse\s+me|i\s+apologize|my\s+apologies)\b/i, 0.9],
      [/\b(?:mean\s+no\s+harm|no\s+harm\s+meant|calm\s+down|take\s+it\s+easy|i\s+come\s+in\s+peace|easy\s+there|no\s+trouble)\b/i, 0.8],
    ],
    words: [
      ['sorry', 0.82], ['apologize', 0.9], ['apologies', 0.88], ['apology', 0.85],
      ['forgive', 0.8], ['pardon', 0.72], ['relax', 0.55],
    ],
  },
  AFFIRM: {
    phrases: [
      [/^(?:yes|yeah|yep|yup|sure|ok|okay|alright|agreed|deal|definitely|absolutely|certainly|indeed|of\s+course|affirmative|right|correct|true)\b/i, 0.88],
    ],
    words: [['agreed', 0.75], ['certainly', 0.65], ['definitely', 0.65], ['indeed', 0.65]],
  },
  NEGATE: {
    phrases: [
      [/^(?:no|nope|nah|never|negative|not\s+true|that(?:'s|\s+is)\s+(?:false|wrong|a\s+lie)|i\s+refuse|i\s+disagree)\b/i, 0.88],
    ],
    words: [['refuse', 0.75], ['disagree', 0.75], ['false', 0.65], ['nope', 0.85]],
  },
  CLARIFY: {
    phrases: [
      [/\b(?:what\s+(?:is|are|was|were|happened|goes|going\s+on|do\s+you\s+mean|do\s+you\s+think(?:\s+about)?)|tell\s+me\s+(?:everything\s+(?:you\s+know\s+)?|all\s+)?(?:about|more)|what\s+else|anything\s+else|go\s+on|for\s+real)\b/i, 0.84],
      [/^(?:what|really|seriously|explain|elaborate|more|continue)\??$/i, 0.85],
    ],
    words: [['explain', 0.75], ['elaborate', 0.8], ['clarify', 0.85], ['describe', 0.72]],
  },
  META_COMMENT: {
    phrases: [
      [/\b(?:are\s+you\s+(?:an?\s+)?(?:ai|bot|npc|program|computer)|break\s+character|system\s+prompt|your\s+(?:rules|instructions)|jailbreak)\b/i, 0.92],
    ],
    words: [['jailbreak', 0.95]],
  },
  SELECT_CHOICE: {
    phrases: [],
    words: [],
  },
  CONFUSE_OOV: {
    phrases: [],
    words: [],
  },
  ASSERT_FACT: {
    phrases: [],
    words: [],
  },
};

// Build flat cue word lookup for typo tolerance and unknown-concept exclusion.
const ALL_CUE_WORDS = new Set();
for (const cfg of Object.values(SPEECH_ACT_CUES)) {
  for (const [w] of cfg.words) {
    ALL_CUE_WORDS.add(w);
  }
}

export function levenshtein(a, b, maxDist = Infinity) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;

  let prev2 = new Uint16Array(lb + 1);
  let prev = new Uint16Array(lb + 1);
  let curr = new Uint16Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cb = b.charCodeAt(j - 1);
      const cost = ca === cb ? 0 : 1;
      let v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      // Damerau adjacent transposition (e.g. "secert" -> "secret", "vexro" -> "vexor")
      if (i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === cb) {
        const trans = prev2[j - 2] + 1;
        if (trans < v) v = trans;
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDist) return maxDist + 1;
    const tmp = prev2;
    prev2 = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[lb];
}

function allowedEditDistance(word) {
  if (word.length >= 7) return 2;
  if (word.length >= 5) return 1;
  return 0;
}

function fuzzyTokenMatch(token, target) {
  if (token === target) return 1.0;
  const maxD = Math.min(allowedEditDistance(token), allowedEditDistance(target));
  if (maxD === 0) return 0;
  const d = levenshtein(token, target, maxD);
  if (d <= maxD) {
    return d === 1 ? 0.9 : 0.8;
  }
  return 0;
}

function normalizeText(rawText) {
  return String(rawText ?? '')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(text) {
  const matches = text.match(/[a-z0-9]+(?:'[a-z]+)?/gi);
  return matches ? matches.map((t) => t.toLowerCase()) : [];
}

function splitClauses(normalizedText) {
  if (!normalizedText) return [];
  // First split on strong sentence punctuation
  const sentences = normalizedText
    .split(/(?:[.!?;]+)+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const clauses = [];
  for (const sent of sentences) {
    // Split on coordinating/contrastive clause boundaries when both sides are substantial
    const parts = sent.split(/\s*(?:,\s*(?=(?:but|yet|so|and|or|though|although|however|can|could|would|will|do|did|who|what|where|why|how|tell|give|i|you|we|he|she|they)\b)|\b(?:but|however|although|though)\b)\s*/i);
    for (const part of parts) {
      const cleaned = part.replace(/^[,:\-\s]+|[,:\-\s]+$/g, '').trim();
      if (cleaned) clauses.push(cleaned);
    }
  }
  return clauses.length > 0 ? clauses : [normalizedText];
}

function extractGraphEntities(worldGraph) {
  if (!worldGraph) return [];
  let rawList = [];
  if (typeof worldGraph.getAllEntities === 'function') {
    rawList = worldGraph.getAllEntities();
  } else if (typeof worldGraph.getEntities === 'function') {
    rawList = worldGraph.getEntities();
  } else if (worldGraph.entities instanceof Map) {
    rawList = Array.from(worldGraph.entities.values());
  } else if (Array.isArray(worldGraph.entities)) {
    rawList = worldGraph.entities;
  } else if (worldGraph.entities && typeof worldGraph.entities === 'object') {
    rawList = Object.entries(worldGraph.entities).map(([k, v]) => ({ id: k, ...v }));
  } else if (worldGraph.nodes instanceof Map) {
    rawList = Array.from(worldGraph.nodes.values());
  } else if (Array.isArray(worldGraph.nodes)) {
    rawList = worldGraph.nodes;
  }

  return rawList
    .filter(Boolean)
    .map((e) => ({
      entityId: String(e.entityId ?? e.id ?? e.name ?? ''),
      name: String(e.name ?? e.label ?? e.id ?? ''),
      aliases: Array.isArray(e.aliases) ? e.aliases.map(String) : [],
      type: String(e.type ?? e.kind ?? 'unknown').toLowerCase(),
      role: String(e.role ?? '').toLowerCase(),
      tags: Array.isArray(e.tags) ? e.tags.map((t) => String(t).toLowerCase()) : [],
      genderHint: String(e.genderHint ?? e.gender ?? 'unknown').toLowerCase(),
      raw: e,
    }))
    .filter((e) => e.entityId && e.name);
}

function extractGraphEdges(worldGraph) {
  if (!worldGraph) return [];
  if (typeof worldGraph.getAllEdges === 'function') return worldGraph.getAllEdges();
  if (typeof worldGraph.getEdges === 'function') return worldGraph.getEdges();
  if (Array.isArray(worldGraph.edges)) return worldGraph.edges;
  if (worldGraph.edges instanceof Map) return Array.from(worldGraph.edges.values());
  if (Array.isArray(worldGraph.relations)) return worldGraph.relations;
  return [];
}

function buildGraphLexicon(entities, edges) {
  const vocab = new Set();
  for (const ent of entities) {
    for (const tok of tokenize(ent.name)) vocab.add(tok);
    for (const al of ent.aliases) {
      for (const tok of tokenize(al)) vocab.add(tok);
    }
    for (const tok of tokenize(ent.type)) vocab.add(tok);
    for (const tok of tokenize(ent.role)) vocab.add(tok);
    for (const tag of ent.tags) {
      for (const tok of tokenize(tag)) vocab.add(tok);
    }
  }
  for (const edge of edges) {
    const fields = [edge.relation, edge.predicate, edge.type, edge.label, edge.summary, edge.fact];
    for (const f of fields) {
      if (typeof f === 'string') {
        for (const tok of tokenize(f)) vocab.add(tok);
      }
    }
  }
  return vocab;
}

function isHostileEntity(entity, edges, npcSelfId) {
  if (!entity) return false;
  if (HOSTILE_ENTITY_HINTS.has(entity.type) || HOSTILE_ENTITY_HINTS.has(entity.role)) return true;
  for (const tag of entity.tags) {
    if (HOSTILE_ENTITY_HINTS.has(tag)) return true;
  }
  for (const edge of edges) {
    const from = String(edge.subjectId ?? edge.from ?? edge.source ?? '');
    const to = String(edge.objectId ?? edge.to ?? edge.target ?? '');
    const rel = String(edge.relation ?? edge.predicate ?? edge.type ?? '').toLowerCase();
    const involvesEntity = from === entity.entityId || to === entity.entityId;
    if (!involvesEntity) continue;
    if (
      rel.includes('rival') ||
      rel.includes('enemy') ||
      rel.includes('threat') ||
      rel.includes('hostile') ||
      rel.includes('attack') ||
      rel.includes('oppos') ||
      rel.includes('antagon')
    ) {
      if (!npcSelfId || from === npcSelfId || to === npcSelfId || rel.includes('threat') || rel.includes('crisis')) {
        return true;
      }
    }
  }
  return false;
}

function isTokenNegated(tokens, idx, windowSize = 4, includeDeescalation = false) {
  const start = Math.max(0, idx - windowSize);
  for (let j = start; j < idx; j++) {
    if (NEGATION_CUES.has(tokens[j])) return true;
    if (includeDeescalation && DEESCALATION_CUES.has(tokens[j])) return true;
  }
  return false;
}

function isWordInCommonLexicon(word) {
  if (COMMON_ENGLISH_WORDS.has(word) || ALL_CUE_WORDS.has(word) || NEGATION_CUES.has(word) || ROLE_NOUNS.has(word)) {
    return true;
  }
  // Simple morphological stemming for plurals/past/gerund/adverb forms
  if (word.endsWith('ies') && word.length > 4 && COMMON_ENGLISH_WORDS.has(word.slice(0, -3) + 'y')) return true;
  if (word.endsWith('es') && word.length > 4 && COMMON_ENGLISH_WORDS.has(word.slice(0, -2))) return true;
  if (word.endsWith('s') && word.length > 4 && COMMON_ENGLISH_WORDS.has(word.slice(0, -1))) return true;
  if (word.endsWith('ed') && word.length > 4) {
    if (COMMON_ENGLISH_WORDS.has(word.slice(0, -2)) || COMMON_ENGLISH_WORDS.has(word.slice(0, -1))) return true;
  }
  if (word.endsWith('ing') && word.length > 5) {
    const stem = word.slice(0, -3);
    if (COMMON_ENGLISH_WORDS.has(stem) || COMMON_ENGLISH_WORDS.has(stem + 'e')) return true;
  }
  if (word.endsWith('ly') && word.length > 4 && COMMON_ENGLISH_WORDS.has(word.slice(0, -2))) return true;
  return false;
}

function computeEmbedding(text) {
  if (typeof charTrigramVector === 'function') {
    const vec = charTrigramVector(text, EMBEDDING_DIM);
    if (vec instanceof Float32Array && vec.length === EMBEDDING_DIM) return vec;
    if (ArrayBuffer.isView(vec) || Array.isArray(vec)) {
      const out = new Float32Array(EMBEDDING_DIM);
      for (let i = 0; i < Math.min(EMBEDDING_DIM, vec.length); i++) out[i] = vec[i];
      return out;
    }
  }
  // Fallback deterministic trigram vector
  const out = new Float32Array(EMBEDDING_DIM);
  const padded = ` ${text} `;
  for (let i = 0; i <= padded.length - 3; i++) {
    const tri = padded.slice(i, i + 3);
    const h = typeof hashString === 'function' ? Math.abs(hashString(tri)) : tri.charCodeAt(0) * 31 + tri.charCodeAt(1) * 7 + tri.charCodeAt(2);
    out[h % EMBEDDING_DIM] += 1;
  }
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) out[i] /= norm;
  return out;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export class PragmaticPerceiver {
  constructor(options = {}) {
    this.options = options;
    this.translator = options.translator || new InputTranslator();
  }

  parse(rawText, { worldGraph = null, workingMemory = null, npcSelfId = null } = {}) {
    const raw = String(rawText ?? '');
    const translation = this.translator.translate(raw, { worldGraph, workingMemory });
    const normalized = translation.canonicalText;
    const allTokens = translation.tokens;
    const rawClauses = translation.clauses;

    const entities = extractGraphEntities(worldGraph);
    const edges = extractGraphEdges(worldGraph);
    const graphLexicon = buildGraphLexicon(entities, edges);

    // 1. Prompt injection detection
    const promptInjectionAttempt = PROMPT_INJECTION_PATTERNS.some((re) => re.test(raw));

    // 2. Hypothetical & Conditional polarity detection
    const isHypothetical = HYPOTHETICAL_PATTERNS.some((re) => re.test(normalized));
    const isConditional = !isHypothetical && CONDITIONAL_PATTERNS.some((re) => re.test(normalized));

    // 3. Entity resolution (explicit -> coreference -> ellipsis)
    const { resolvedEntities, coreferenceResolutions, matchedEntityTokens } = this._resolveEntities(
      normalized,
      allTokens,
      entities,
      workingMemory
    );

    // 4. Direct answer binding
    const directAnswer = this._detectDirectAnswer(normalized, allTokens, workingMemory);

    // 5. Player claim extraction
    const playerClaims = this._extractPlayerClaims(raw, normalized, resolvedEntities);

    // 6. Agency binding
    const agency = this._analyzeAgency(
      normalized,
      allTokens,
      resolvedEntities,
      entities,
      edges,
      npcSelfId,
      isHypothetical
    );

    // 7. Clause-level speech acts, negation scope, and aggregation
    const negatedActsSet = new Set();
    const aggregateScores = new Map();
    const clauseFrames = [];
    let negatedClauseCount = 0;

    for (let cIdx = 0; cIdx < rawClauses.length; cIdx++) {
      const clauseText = rawClauses[cIdx];
      const cTokens = tokenize(clauseText);
      const clauseResult = this._scoreClause(
        clauseText,
        cTokens,
        agency,
        resolvedEntities,
        entities,
        edges,
        npcSelfId,
        isHypothetical,
        isConditional,
        raw.includes('?')
      );

      for (const act of clauseResult.negatedActs) negatedActsSet.add(act);
      if (clauseResult.negated) negatedClauseCount++;

      for (const { act, score } of clauseResult.speechActs) {
        // If clause 0 is a leading phatic greeting followed by substantive clauses,
        // cap its GREET score so it does not drown out the actual question/request.
        const effectiveScore =
          cIdx === 0 && translation.hasLeadingGreeting && act === 'GREET'
            ? Math.min(score, 0.35)
            : score;
        const prev = aggregateScores.get(act) ?? 0;
        aggregateScores.set(act, Math.max(prev, effectiveScore));
      }

      clauseFrames.push({
        text: clauseText,
        tokens: cTokens,
        negated: clauseResult.negated,
        speechActs: clauseResult.speechActs,
        polarity: clauseResult.polarity,
      });
    }

    // Direct answer boost
    if (directAnswer.isDirectAnswer) {
      if (directAnswer.kind === 'choice_index' || directAnswer.kind === 'choice_match' || directAnswer.kind === 'both' || directAnswer.kind === 'neither') {
        aggregateScores.set('SELECT_CHOICE', Math.max(aggregateScores.get('SELECT_CHOICE') ?? 0, 0.9));
      } else if (directAnswer.kind === 'yes') {
        aggregateScores.set('AFFIRM', Math.max(aggregateScores.get('AFFIRM') ?? 0, 0.88));
      } else if (directAnswer.kind === 'no') {
        aggregateScores.set('NEGATE', Math.max(aggregateScores.get('NEGATE') ?? 0, 0.88));
      }
    }

    // Player claims boost CLAIM_IDENTITY / ASSERT_FACT
    if (playerClaims.some((c) => c.type === 'name' || c.type === 'role' || c.type === 'allegiance')) {
      aggregateScores.set('CLAIM_IDENTITY', Math.max(aggregateScores.get('CLAIM_IDENTITY') ?? 0, 0.84));
    }
    if (playerClaims.some((c) => c.type === 'fact')) {
      aggregateScores.set('ASSERT_FACT', Math.max(aggregateScores.get('ASSERT_FACT') ?? 0, 0.76));
    }

    // Prompt injection -> META_COMMENT
    if (promptInjectionAttempt) {
      aggregateScores.set('META_COMMENT', Math.max(aggregateScores.get('META_COMMENT') ?? 0, 0.95));
    }

    // Hypothetical act boost
    if (isHypothetical) {
      aggregateScores.set('ASK_WHAT_IF', Math.max(aggregateScores.get('ASK_WHAT_IF') ?? 0, 0.85));
    }

    // Ensure negated hostile acts are suppressed from active speechActs
    for (const negAct of negatedActsSet) {
      if (negAct === 'THREATEN' || negAct === 'INSULT' || negAct === 'ACCUSE') {
        aggregateScores.delete(negAct);
      }
    }

    // Unknown / out-of-world concept detection (done before finalizing speechActs so CONFUSE_OOV can score)
    const claimedNames = new Set(
      playerClaims
        .filter((c) => c.type === 'name')
        .flatMap((c) => tokenize(c.value))
    );
    const unknownConcepts = this._detectUnknownConcepts(
      allTokens,
      graphLexicon,
      matchedEntityTokens,
      claimedNames
    );
    const hasExplicitEntity = resolvedEntities.some((e) => e.source === 'explicit');
    const topNonOov = Array.from(aggregateScores.entries()).sort((a, b) => b[1] - a[1])[0];
    const suppressOov =
      (topNonOov && (topNonOov[0] === 'APOLOGIZE' || topNonOov[0] === 'COMPLIMENT') && topNonOov[1] >= 0.65) ||
      hasExplicitEntity;
    if (unknownConcepts.length > 0 && !promptInjectionAttempt && !suppressOov) {
      aggregateScores.set('CONFUSE_OOV', Math.max(aggregateScores.get('CONFUSE_OOV') ?? 0, 0.68));
    }

    // Sort speech acts descending (strictly restricted to SPEECH_ACTS)
    let speechActs = Array.from(aggregateScores.entries())
      .filter(([act, score]) => score >= 0.25 && SPEECH_ACT_ID[act] !== undefined)
      .map(([act, score]) => ({ act, score: Number(score.toFixed(3)) }))
      .sort((a, b) => b.score - a.score);

    if (speechActs.length === 0) {
      const fallbackAct = raw.includes('?') ? 'CLARIFY' : 'ASSERT_FACT';
      speechActs = [{ act: fallbackAct, score: 0.4 }];
    }

    const primaryAct = speechActs[0].act;
    const secondaryAct = speechActs.length > 1 ? speechActs[1].act : null;

    // Overall polarity
    let polarity = 'affirmative';
    if (isHypothetical) {
      polarity = 'hypothetical';
    } else if (isConditional) {
      polarity = 'conditional';
    } else if (
      negatedClauseCount > 0 &&
      (negatedClauseCount >= Math.ceil(clauseFrames.length / 2) || primaryAct === 'NEGATE' || negatedActsSet.size > 0)
    ) {
      polarity = 'negative';
    }

    // 9. Affective signals
    const affectiveSignals = this._computeAffectiveSignals(
      raw,
      normalized,
      allTokens,
      speechActs,
      negatedActsSet,
      agency,
      promptInjectionAttempt
    );

    // 10. Embedding
    const embedding = computeEmbedding(normalized);

    return {
      rawText: raw,
      normalizedText: normalized,
      clauses: clauseFrames,
      speechActs,
      primaryAct,
      secondaryAct,
      polarity,
      negatedActs: Array.from(negatedActsSet),
      agency,
      resolvedEntities,
      coreferenceResolutions,
      unknownConcepts,
      playerClaims,
      affectiveSignals,
      directAnswer,
      promptInjectionAttempt,
      embedding,
    };
  }

  _resolveEntities(normalized, tokens, entities, workingMemory) {
    const resolvedMap = new Map();
    const matchedEntityTokens = new Set();
    const coreferenceResolutions = [];

    // 1. Explicit matching (names + aliases, multi-word first, with typo tolerance)
    const candidates = [];
    for (const ent of entities) {
      const forms = [ent.name, ...ent.aliases].filter(Boolean);
      for (const form of forms) {
        const fTokens = tokenize(form);
        if (fTokens.length > 0) {
          candidates.push({ ent, formTokens: fTokens });
        }
      }
    }
    candidates.sort((a, b) => b.formTokens.length - a.formTokens.length);

    for (const { ent, formTokens } of candidates) {
      const m = formTokens.length;
      if (m > tokens.length) continue;

      for (let i = 0; i <= tokens.length - m; i++) {
        let totalScore = 0;
        let allMatched = true;
        for (let k = 0; k < m; k++) {
          const s = fuzzyTokenMatch(tokens[i + k], formTokens[k]);
          if (s === 0) {
            allMatched = false;
            break;
          }
          totalScore += s;
        }
        if (allMatched) {
          const avgScore = totalScore / m;
          const prev = resolvedMap.get(ent.entityId);
          if (!prev || avgScore > prev.score) {
            resolvedMap.set(ent.entityId, {
              entityId: ent.entityId,
              name: ent.name,
              type: ent.type,
              source: 'explicit',
              score: Number(avgScore.toFixed(3)),
            });
          }
          for (let k = 0; k < m; k++) matchedEntityTokens.add(tokens[i + k]);
        }
      }
    }

    // 2. Coreference resolution via workingMemory.resolvePronoun
    if (workingMemory && typeof workingMemory.resolvePronoun === 'function') {
      const phrasePronouns = ['this place', 'that place', 'that person', 'that thing', 'the man', 'the woman', 'the guy'];
      const seenPronouns = new Set();

      for (const p of phrasePronouns) {
        const re = new RegExp(`\\b${p}\\b`, 'i');
        if (re.test(normalized)) {
          const resolved = workingMemory.resolvePronoun(p);
          if (resolved && resolved.entityId) {
            seenPronouns.add(p);
            coreferenceResolutions.push({
              pronoun: p,
              resolvedEntityId: resolved.entityId,
              resolvedName: resolved.name,
            });
            if (!resolvedMap.has(resolved.entityId)) {
              resolvedMap.set(resolved.entityId, {
                entityId: resolved.entityId,
                name: resolved.name,
                type: resolved.type ?? 'unknown',
                source: 'coreference',
                score: 0.8,
              });
            }
          }
        }
      }

      const singlePronouns = new Set([
        'he', 'him', 'his', 'himself',
        'she', 'her', 'hers', 'herself',
        'it', 'its', 'itself',
        'they', 'them', 'their', 'theirs',
        'there', 'that',
      ]);

      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (!singlePronouns.has(tok) || seenPronouns.has(tok)) continue;
        // Skip "that" when used as a conjunction or determiner before a noun (e.g. "know that you", "that place")
        if (tok === 'that') {
          const prev = tokens[i - 1] ?? '';
          const next = tokens[i + 1] ?? '';
          if (['think', 'know', 'said', 'say', 'hear', 'heard', 'believe', 'sure', 'so', 'means', 'mean', 'hope', 'fear'].includes(prev)) {
            continue;
          }
          if (next && !['is', 'was', 'were', 'are', 'will', 'would', 'can', 'could', 'sounds', 'seems', 'makes', 'means', 'happened'].includes(next) && i < tokens.length - 1) {
            continue;
          }
        }
        // Skip "it" in dummy-subject idioms like "is it true", "make it", "take it easy"
        if (tok === 'it' && (tokens[i + 1] === 'easy' || (tokens[i - 1] === 'take' && tokens[i + 1] === 'easy'))) {
          continue;
        }

        const resolved = workingMemory.resolvePronoun(tok);
        if (resolved && resolved.entityId) {
          seenPronouns.add(tok);
          coreferenceResolutions.push({
            pronoun: tok,
            resolvedEntityId: resolved.entityId,
            resolvedName: resolved.name,
          });
          if (!resolvedMap.has(resolved.entityId)) {
            resolvedMap.set(resolved.entityId, {
              entityId: resolved.entityId,
              name: resolved.name,
              type: resolved.type ?? 'unknown',
              source: 'coreference',
              score: 0.78,
            });
          }
        }
      }
    }

    // 3. Ellipsis resolution for bare follow-ups
    if (resolvedMap.size === 0 && workingMemory) {
      const isBareFollowup =
        /^(?:why|how|where|who|what|when|really|seriously|explain|elaborate|go\s+on|continue|more|tell\s+me\s+more|how\s+much|how\s+so|what\s+else|anything\s+else|like\s+what|for\s+real|and|so)\b/i.test(normalized) &&
        tokens.length <= 5;

      if (isBareFollowup) {
        const salient = Array.isArray(workingMemory.salientEntities) ? workingMemory.salientEntities : [];
        const top = salient[0] ?? null;
        if (top && top.entityId) {
          resolvedMap.set(top.entityId, {
            entityId: top.entityId,
            name: top.name,
            type: top.type ?? 'unknown',
            source: 'ellipsis',
            score: 0.7,
          });
        }
      }
    }

    const resolvedEntities = Array.from(resolvedMap.values()).sort((a, b) => b.score - a.score);
    return { resolvedEntities, coreferenceResolutions, matchedEntityTokens };
  }

  _detectDirectAnswer(normalized, tokens, workingMemory) {
    const empty = { isDirectAnswer: false, kind: null, choiceIndex: null, matchedOption: null };
    const q = workingMemory?.lastOpenQuestion;
    if (!q) return empty;

    const options = Array.isArray(q.options) ? q.options : [];

    // Both / Neither
    if (/\b(?:both|both\s+of\s+them|all\s+of\s+them)\b/i.test(normalized)) {
      return { isDirectAnswer: true, kind: 'both', choiceIndex: null, matchedOption: null };
    }
    if (/\b(?:neither|neither\s+one|none\s+of\s+them)\b/i.test(normalized)) {
      return { isDirectAnswer: true, kind: 'neither', choiceIndex: null, matchedOption: null };
    }

    // Choice index matching
    if (q.type === 'CHOICE' || options.length > 0) {
      const indexMatchers = [
        [0, /\b(?:first|the\s+first|first\s+one|option\s*1|number\s*1|#1)\b|^1$|^one$/i],
        [1, /\b(?:second|the\s+second|second\s+one|option\s*2|number\s*2|#2)\b|^2$|^two$/i],
        [2, /\b(?:third|the\s+third|third\s+one|option\s*3|number\s*3|#3)\b|^3$|^three$/i],
        [3, /\b(?:fourth|the\s+fourth|fourth\s+one|option\s*4|number\s*4|#4)\b|^4$|^four$/i],
      ];
      for (const [idx, re] of indexMatchers) {
        if (re.test(normalized)) {
          return {
            isDirectAnswer: true,
            kind: 'choice_index',
            choiceIndex: idx,
            matchedOption: options[idx] ?? null,
          };
        }
      }
      if (/\b(?:the\s+last|last\s+one)\b/i.test(normalized) && options.length > 0) {
        const idx = options.length - 1;
        return {
          isDirectAnswer: true,
          kind: 'choice_index',
          choiceIndex: idx,
          matchedOption: options[idx],
        };
      }

      // Direct option text match
      for (let i = 0; i < options.length; i++) {
        const opt = String(options[i]);
        const optNorm = opt.toLowerCase();
        if (normalized.includes(optNorm)) {
          return {
            isDirectAnswer: true,
            kind: 'choice_match',
            choiceIndex: i,
            matchedOption: opt,
          };
        }
        // Fuzzy match single-word option
        const optTokens = tokenize(optNorm);
        if (optTokens.length === 1 && tokens.some((t) => fuzzyTokenMatch(t, optTokens[0]) > 0)) {
          return {
            isDirectAnswer: true,
            kind: 'choice_match',
            choiceIndex: i,
            matchedOption: opt,
          };
        }
      }
    }

    // Yes / No
    if (/^(?:yes|yeah|yep|yup|sure|ok|okay|alright|agreed|deal|definitely|absolutely|of\s+course|certainly|indeed|please|i\s+do|i\s+will|affirmative)\b/i.test(normalized)) {
      return { isDirectAnswer: true, kind: 'yes', choiceIndex: null, matchedOption: null };
    }
    if (/^(?:no|nope|nah|never|negative|not\s+really|no\s+thanks|pass|i\s+won't|i\s+don't|i\s+dont)\b/i.test(normalized)) {
      return { isDirectAnswer: true, kind: 'no', choiceIndex: null, matchedOption: null };
    }

    return empty;
  }

  _extractPlayerClaims(rawText, normalized, resolvedEntities) {
    const claims = [];

    // 1. Explicit name patterns: "my name is X", "call me X", "i go by X", "name's X"
    const namePatterns = [
      /\b(?:my\s+name(?:'s|\s+is)|call\s+me|they\s+call\s+me|i\s+go\s+by|name's)\s+([a-z][a-z0-9'\-]*(?:\s+(?!and\b|or\b|but\b|i\b|i'm\b|from\b|here\b|to\b|who\b)[a-z][a-z0-9'\-]*)?)/i,
    ];
    for (const re of namePatterns) {
      const m = rawText.match(re);
      if (m && m[1]) {
        const candidate = m[1].trim().replace(/[.,!?;:]+$/, '');
        const firstWord = candidate.split(/\s+/)[0].toLowerCase();
        if (candidate && !NON_NAME_WORDS.has(firstWord)) {
          claims.push({ type: 'name', value: candidate, negated: false, raw: m[0] });
        }
      }
    }

    // 2. Role claims: "i am (not) a/an/the <role>"
    const roleRe = /\b(?:i\s+am|i'm|im)\s+(not\s+)?(?:a|an|the)\s+([a-z][a-z\-]*(?:\s+(?!and\b|or\b|but\b|who\b|that\b|from\b|in\b|at\b|with\b|for\b|to\b|here\b|there\b)[a-z][a-z\-]*)?)/gi;
    let rm;
    while ((rm = roleRe.exec(normalized)) !== null) {
      const negated = Boolean(rm[1]);
      const val = rm[2].trim();
      if (val && !['bit', 'little', 'lot', 'few'].includes(val.split(/\s+/)[0])) {
        claims.push({ type: 'role', value: val, negated, raw: rm[0] });
      }
    }

    // 3. "I am <Name>" / "I'm <Name>" (when no explicit name already extracted and no article)
    if (!claims.some((c) => c.type === 'name')) {
      const iamRe = /\b(?:i\s+am|i'm)\s+(not\s+)?([A-Za-z][a-z'\-]{1,24})\b/g;
      let im;
      while ((im = iamRe.exec(rawText)) !== null) {
        const negated = Boolean(im[1]);
        const word = im[2];
        const lower = word.toLowerCase();
        if (NON_NAME_WORDS.has(lower) || COMMON_ENGLISH_WORDS.has(lower) || ROLE_NOUNS.has(lower)) {
          if (ROLE_NOUNS.has(lower)) {
            claims.push({ type: 'role', value: lower, negated, raw: im[0] });
          }
          continue;
        }
        if (!negated) {
          claims.push({ type: 'name', value: word, negated: false, raw: im[0] });
          break;
        }
      }
    }

    // 4. Allegiance claims: "<X> sent me", "i work for <X>", "i am with <X>", "i serve <X>"
    const sentMeRe = /\b([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*)?)\s+sent\s+me\b/i;
    const sm = rawText.match(sentMeRe);
    if (sm && sm[1]) {
      const sender = sm[1].trim();
      if (!['who', 'nobody', 'no one', 'someone', 'they', 'he', 'she', 'you'].includes(sender.toLowerCase())) {
        claims.push({ type: 'allegiance', value: sender, negated: false, raw: sm[0] });
      }
    }

    const allegianceRe = /\b(?:i\s+(?:work\s+for|serve|represent|belong\s+to|answer\s+to)|(?:i\s+am|i'm|im)\s+(not\s+)?(?:with|loyal\s+to|working\s+for))\s+(?:the\s+)?([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*)?)/gi;
    let am;
    while ((am = allegianceRe.exec(normalized)) !== null) {
      const negated = Boolean(am[1]) || /\b(?:don't|dont|do\s+not)\s+(?:work\s+for|serve|belong\s+to)\b/i.test(normalized);
      const val = am[2].trim();
      if (val && !['you', 'me', 'him', 'her', 'them', 'it'].includes(val)) {
        claims.push({ type: 'allegiance', value: val, negated, raw: am[0] });
      }
    }

    // 5. Fact claims: "there is no <X>", "<X> doesn't exist", "<X> is dead/alive/your friend/an ally/a traitor"
    const noExistRe = /\b(?:there\s+(?:is|are)\s+no|no\s+such\s+thing\s+as)\s+([a-z0-9][a-z0-9'\-\s]{1,35}?)(?:[.!?,;]|$)/gi;
    let nm;
    while ((nm = noExistRe.exec(normalized)) !== null) {
      claims.push({ type: 'fact', value: nm[1].trim(), negated: true, raw: nm[0].trim() });
    }

    const entityFactRe = /\b([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*)?)\s+(?:is|are|was|were)\s+(not\s+)?(dead|alive|gone|destroyed|your\s+friend|my\s+friend|an?\s+ally|friendly|harmless|peaceful|your\s+enemy|a\s+traitor|guilty|innocent|lying|real|fake)\b/gi;
    let fm;
    while ((fm = entityFactRe.exec(normalized)) !== null) {
      const subj = fm[1].trim();
      if (['i', 'you', 'we', 'this', 'that', 'it', 'there', 'who', 'what'].includes(subj)) continue;
      const negated = Boolean(fm[2]);
      const pred = fm[3].trim();
      claims.push({
        type: 'fact',
        value: `${subj} is ${negated ? 'not ' : ''}${pred}`,
        negated,
        raw: fm[0].trim(),
      });
    }

    // Also capture "<entity> doesn't exist"
    for (const ent of resolvedEntities) {
      const escaped = ent.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\s+(?:doesn't|doesnt|does\\s+not|isn't|isnt|is\\s+not)\\s+(?:exist|real|happening|true)\\b`, 'i');
      const m = normalized.match(re);
      if (m) {
        claims.push({ type: 'fact', value: ent.name, negated: true, raw: m[0] });
      }
    }

    return claims;
  }

  _analyzeAgency(normalized, tokens, resolvedEntities, allEntities, edges, npcSelfId, isHypothetical) {
    const thirdParties = resolvedEntities.filter((e) => !npcSelfId || e.entityId !== npcSelfId);
    const primaryThird = thirdParties[0] ?? null;

    let actor = 'unknown';
    let target = 'unknown';
    let thirdPartyEntityId = primaryThird ? primaryThird.entityId : null;
    let relation = 'neutral';

    // Locate positions of first-person, second-person, and primary third-party entity in tokens
    let firstIdx = -1;
    let secondIdx = -1;
    let thirdIdx = -1;
    let actionVerbIdx = -1;

    const actionVerbs = new Set([
      ...COMBAT_OR_STOP_VERBS,
      'threaten', 'threatened', 'hurt', 'harm', 'rob', 'robbed', 'stole', 'steal',
      'betray', 'betrayed', 'attacked', 'killed', 'help', 'helped', 'save', 'saved',
      'buy', 'sell', 'give', 'hand', 'tell', 'ask', 'trust', 'lie', 'lied', 'blame',
    ]);

    const thirdTokens = primaryThird ? tokenize(primaryThird.name) : [];

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (firstIdx === -1 && FIRST_PERSON.has(t)) firstIdx = i;
      if (secondIdx === -1 && SECOND_PERSON.has(t)) secondIdx = i;
      if (thirdIdx === -1 && thirdTokens.length > 0 && fuzzyTokenMatch(t, thirdTokens[0]) > 0) thirdIdx = i;
      if (actionVerbIdx === -1 && actionVerbs.has(t)) actionVerbIdx = i;
    }

    // Determine actor and target from word order relative to action verb
    if (thirdIdx !== -1 && (actionVerbIdx === -1 || thirdIdx < actionVerbIdx) && (firstIdx === -1 || thirdIdx < firstIdx)) {
      // Third party appears before the verb (e.g. "[Rival] threatened me")
      actor = 'third_party';
      if (firstIdx !== -1 && firstIdx > thirdIdx) {
        target = 'player';
        relation = 'third_to_player';
      } else if (secondIdx !== -1 && secondIdx > thirdIdx) {
        target = 'npc';
        relation = 'neutral';
      } else {
        target = 'unknown';
        relation = 'neutral';
      }
    } else if (firstIdx !== -1 && (secondIdx === -1 || firstIdx < secondIdx) && (thirdIdx === -1 || firstIdx < thirdIdx)) {
      // Player is actor
      actor = 'player';
      if (thirdIdx !== -1 && (actionVerbIdx === -1 || thirdIdx > actionVerbIdx) && (secondIdx === -1 || thirdIdx < secondIdx)) {
        target = 'third_party';
        relation = 'player_to_third';
      } else if (secondIdx !== -1) {
        target = 'npc';
        relation = 'player_to_npc';
      } else if (thirdIdx !== -1) {
        target = 'third_party';
        relation = 'player_to_third';
      } else {
        target = 'npc';
        relation = 'player_to_npc';
      }
    } else if (secondIdx !== -1) {
      // Second person first (e.g. "can you help me", "you lied to me", "you're an idiot")
      if (/\b(?:you(?:'re|\s+are)\s+(?:an?\s+)?(?:idiot|fool|coward|liar|useless|pathetic|scum|stupid|kind|wise|brave|great|helpful))\b/i.test(normalized)) {
        actor = 'player';
        target = 'npc';
        relation = 'player_to_npc';
      } else {
        actor = 'npc';
        target = firstIdx !== -1 ? 'player' : thirdIdx !== -1 ? 'third_party' : 'unknown';
        relation = target === 'player' ? 'npc_to_player' : 'neutral';
      }
    } else if (thirdIdx !== -1) {
      // Imperative or question about third party
      actor = 'player';
      target = 'third_party';
      relation = 'player_to_third';
    } else if (/^(?:hand\s+over|give\s+me|shut\s+up|tell\s+me|help\s+me|show\s+me)/i.test(normalized)) {
      actor = 'player';
      target = 'npc';
      relation = 'player_to_npc';
    }

    if (isHypothetical) {
      relation = 'hypothetical';
    }

    return {
      actor,
      target,
      thirdPartyEntityId,
      relation,
    };
  }

  _scoreClause(clauseText, tokens, agency, resolvedEntities, allEntities, edges, npcSelfId, isHypothetical, isConditional, hasQuestionMark) {
    const scores = new Map();
    const negatedActs = new Set();
    let clauseNegated = false;

    const addScore = (act, val) => {
      scores.set(act, Math.max(scores.get(act) ?? 0, val));
    };

    // Check if third-party entity is hostile/rival/threat
    const thirdEnt = agency.thirdPartyEntityId
      ? allEntities.find((e) => e.entityId === agency.thirdPartyEntityId)
      : null;
    const thirdIsHostile = isHostileEntity(thirdEnt, edges, npcSelfId);
    const targetingThirdParty = agency.relation === 'player_to_third' || agency.target === 'third_party';
    const thirdActingOnPlayer = agency.relation === 'third_to_player';

    // Phrase matching
    for (const [act, cfg] of Object.entries(SPEECH_ACT_CUES)) {
      for (const [re, weight] of cfg.phrases) {
        const m = clauseText.match(re);
        if (!m) continue;
        // Find token index where match starts
        const prefixTokens = tokenize(clauseText.slice(0, m.index));
        const matchIdx = prefixTokens.length;
        const isHostileAct = act === 'THREATEN' || act === 'INSULT' || act === 'ACCUSE';
        const negated = isTokenNegated(tokens, matchIdx, 4, isHostileAct);

        if (isHostileAct && negated) {
          negatedActs.add(act);
          clauseNegated = true;
          addScore('APOLOGIZE', 0.72);
          continue;
        }

        // Agency guard: don't treat player fighting/stopping a third party or third party threatening player as THREATEN against NPC
        if (act === 'THREATEN' && (targetingThirdParty || thirdActingOnPlayer)) {
          if (targetingThirdParty) {
            addScore(thirdIsHostile ? 'OFFER_HELP' : 'ASSERT_FACT', 0.8);
          } else {
            addScore('ASSERT_FACT', 0.8);
          }
          continue;
        }

        if (negated) clauseNegated = true;
        addScore(act, weight);
      }
    }

    // Single-word cue matching with Levenshtein typo tolerance & negation scope
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (NEGATION_CUES.has(tok)) {
        clauseNegated = true;
      }

      for (const [act, cfg] of Object.entries(SPEECH_ACT_CUES)) {
        for (const [cueWord, weight] of cfg.words) {
          const matchQuality = fuzzyTokenMatch(tok, cueWord);
          if (matchQuality === 0) continue;

          const isHostileAct = act === 'THREATEN' || act === 'INSULT' || act === 'ACCUSE';
          const negated = isTokenNegated(tokens, i, 4, isHostileAct);

          if (isHostileAct) {
            if (negated) {
              negatedActs.add(act);
              clauseNegated = true;
              addScore('APOLOGIZE', 0.7);
              continue;
            }
            if (act === 'THREATEN' && (targetingThirdParty || thirdActingOnPlayer)) {
              if (targetingThirdParty) {
                addScore(thirdIsHostile || COMBAT_OR_STOP_VERBS.has(cueWord) ? 'OFFER_HELP' : 'ASSERT_FACT', 0.78);
              } else {
                addScore('ASSERT_FACT', 0.78);
              }
              continue;
            }
          }

          if (negated && (act === 'OFFER_HELP' || act === 'AFFIRM' || act === 'COMPLIMENT')) {
            clauseNegated = true;
            addScore('NEGATE', 0.6);
            continue;
          }

          addScore(act, weight * matchQuality);
        }
      }
    }

    // Special check: "I want to stop [Rival]" / "I'll fight [Crisis]" -> OFFER_HELP
    if (targetingThirdParty && tokens.some((t) => COMBAT_OR_STOP_VERBS.has(t)) && !clauseNegated) {
      addScore('OFFER_HELP', thirdIsHostile ? 0.88 : 0.76);
      scores.delete('THREATEN');
    }

    // Question mark boost for ASK_* acts
    if (hasQuestionMark && tokens.length > 0) {
      const first = tokens[0];
      if (first === 'who') addScore('ASK_WHO', 0.85);
      else if (first === 'where') addScore('ASK_WHERE', 0.85);
      else if (first === 'why') addScore('ASK_WHY', 0.85);
      else if (first === 'how') addScore('ASK_HOW', 0.8);
      else if (first === 'what') addScore('CLARIFY', 0.75);
    }

    const speechActs = Array.from(scores.entries())
      .filter(([, s]) => s >= 0.25)
      .map(([act, score]) => ({ act, score: Number(score.toFixed(3)) }))
      .sort((a, b) => b.score - a.score);

    const polarity = isHypothetical
      ? 'hypothetical'
      : isConditional
        ? 'conditional'
        : clauseNegated
          ? 'negative'
          : 'affirmative';

    return {
      negated: clauseNegated,
      negatedActs: Array.from(negatedActs),
      speechActs,
      polarity,
    };
  }

  _detectUnknownConcepts(tokens, graphLexicon, matchedEntityTokens, claimedNames) {
    const unknown = [];
    const seen = new Set();

    for (const tok of tokens) {
      // Only alphabetic content words of length >= 4 (no contractions, no numbers)
      if (tok.length < 4 || !/^[a-z]+$/.test(tok)) continue;
      if (seen.has(tok)) continue;
      if (matchedEntityTokens.has(tok)) continue;
      if (claimedNames.has(tok)) continue;
      if (isWordInCommonLexicon(tok)) continue;
      if (this.translator.isKnownEnglishWord(tok)) continue;
      if (graphLexicon.has(tok)) continue;

      // Check fuzzy match against graph lexicon (typo in a world entity/term)
      let matchesGraph = false;
      for (const gw of graphLexicon) {
        if (fuzzyTokenMatch(tok, gw) > 0) {
          matchesGraph = true;
          break;
        }
      }
      if (matchesGraph) continue;

      // Check fuzzy match against cue words (typo in a pragmatic verb like "apologze")
      let matchesCue = false;
      for (const cw of ALL_CUE_WORDS) {
        if (fuzzyTokenMatch(tok, cw) > 0) {
          matchesCue = true;
          break;
        }
      }
      if (matchesCue) continue;

      seen.add(tok);
      unknown.push(tok);
    }

    return unknown;
  }

  _computeAffectiveSignals(raw, normalized, tokens, speechActs, negatedActsSet, agency, promptInjectionAttempt) {
    const actMap = new Map(speechActs.map((s) => [s.act, s.score]));

    let politeness = 0.35;
    let aggression = 0.0;
    let sincerity = 0.55;
    let urgency = 0.1;
    let curiosity = 0.15;
    let deceptionCue = 0.0;

    // Politeness
    if (/\b(?:please|thank|thanks|grateful|appreciate|sorry|pardon|excuse\s+me|kind|respect)\b/i.test(normalized)) {
      politeness += 0.35;
    }
    if (actMap.has('GREET') || actMap.has('FAREWELL') || actMap.has('COMPLIMENT') || actMap.has('APOLOGIZE')) {
      politeness += 0.2;
    }
    if (negatedActsSet.has('THREATEN') || negatedActsSet.has('INSULT') || actMap.has('APOLOGIZE')) {
      politeness += 0.25;
      sincerity += 0.15;
    }

    // Aggression
    if (actMap.has('THREATEN')) aggression += 0.75 * actMap.get('THREATEN');
    if (actMap.has('INSULT')) aggression += 0.65 * actMap.get('INSULT');
    if (actMap.has('ACCUSE')) aggression += 0.45 * actMap.get('ACCUSE');

    const letters = raw.replace(/[^a-zA-Z]/g, '');
    const upper = raw.replace(/[^A-Z]/g, '');
    if (letters.length >= 6 && upper.length / letters.length > 0.65) {
      aggression += 0.25;
      urgency += 0.25;
    }
    const exclamations = (raw.match(/!/g) || []).length;
    if (exclamations >= 2) {
      aggression += 0.15;
      urgency += 0.25;
    } else if (exclamations === 1) {
      urgency += 0.1;
    }

    if (negatedActsSet.has('THREATEN') || negatedActsSet.has('INSULT') || negatedActsSet.has('ACCUSE')) {
      aggression = Math.min(aggression, 0.1);
    }
    if (agency.relation === 'player_to_third' || agency.relation === 'third_to_player') {
      aggression *= 0.35;
    }
    if (aggression > 0.4) {
      politeness -= 0.35;
    }

    // Urgency
    if (/\b(?:now|hurry|quick|quickly|fast|urgent|immediately|emergency|right\s+now|danger|run)\b/i.test(normalized)) {
      urgency += 0.45;
    }
    if (actMap.has('REQUEST_HELP')) urgency += 0.25;

    // Curiosity
    if (raw.includes('?')) curiosity += 0.4;
    for (const askAct of ['ASK_WHO', 'ASK_WHERE', 'ASK_WHY', 'ASK_HOW', 'ASK_WHAT_IF', 'ASK_SECRET', 'ASK_RUMOR', 'CLARIFY']) {
      if (actMap.has(askAct)) curiosity += 0.35 * actMap.get(askAct);
    }
    if (/\b(?:curious|wonder|interesting|tell\s+me|explain)\b/i.test(normalized)) {
      curiosity += 0.2;
    }

    // Deception cues
    if (/\b(?:trust\s+me|honestly|believe\s+me|i\s+swear|no\s+reason|just\s+asking|for\s+a\s+friend|nothing\s+to\s+hide|don't\s+worry\s+about\s+it)\b/i.test(normalized)) {
      deceptionCue += 0.45;
      sincerity -= 0.2;
    }
    if (/\b(?:bribe|look\s+the\s+other\s+way|pay\s+you\s+extra)\b/i.test(normalized)) {
      deceptionCue += 0.35;
      sincerity -= 0.2;
    }
    if (promptInjectionAttempt) {
      deceptionCue += 0.6;
      sincerity -= 0.4;
    }

    // Sincerity boosts
    if (actMap.has('APOLOGIZE') || actMap.has('OFFER_HELP') || actMap.has('COMPLIMENT')) {
      sincerity += 0.15;
    }

    return {
      politeness: Number(clamp01(politeness).toFixed(3)),
      aggression: Number(clamp01(aggression).toFixed(3)),
      sincerity: Number(clamp01(sincerity).toFixed(3)),
      urgency: Number(clamp01(urgency).toFixed(3)),
      curiosity: Number(clamp01(curiosity).toFixed(3)),
      deceptionCue: Number(clamp01(deceptionCue).toFixed(3)),
    };
  }
}

export default PragmaticPerceiver;
