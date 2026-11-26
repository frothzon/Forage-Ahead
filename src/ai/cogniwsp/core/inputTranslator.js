// ============================================================================
// CogniWSP General NPC Intelligence (GNI) Core — Semantic Input Translator
// Stage 1: Idiom/slang/contraction normalization, morphological stemming,
// everyday English anchor bank, semantic synonym hints, and clause splitting.
// Zero-dependency ES Module. Contains ZERO hardcoded world lore.
// ============================================================================

// Stage A: Contraction, slang, and idiom normalization rules (order matters).
// Preserves original entity names and negations.
const CONTRACTION_AND_SLANG_RULES = [
  [/[\u2018\u2019\u201A\u201B]/g, "'"],
  [/[\u201C\u201D]/g, '"'],
  [/[\u2013\u2014]/g, ' — '],

  // Negated contractions -> explicit "not" so negation scope is unambiguous
  [/\bwasn't\s+gonna\b/gi, 'was not going to'],
  [/\bwasnt\s+gonna\b/gi, 'was not going to'],
  [/\bweren't\s+gonna\b/gi, 'were not going to'],
  [/\bwerent\s+gonna\b/gi, 'were not going to'],
  [/\bain't\b/gi, 'is not'],
  [/\baint\b/gi, 'is not'],
  [/\bwon't\b/gi, 'will not'],
  [/\bwont\b/gi, 'will not'],
  [/\bcan't\b/gi, 'cannot'],
  [/\bcant\b/gi, 'cannot'],
  [/\bcouldn't\b/gi, 'could not'],
  [/\bcouldnt\b/gi, 'could not'],
  [/\bwouldn't\b/gi, 'would not'],
  [/\bwouldnt\b/gi, 'would not'],
  [/\bshouldn't\b/gi, 'should not'],
  [/\bshouldnt\b/gi, 'should not'],
  [/\bdidn't\b/gi, 'did not'],
  [/\bdidnt\b/gi, 'did not'],
  [/\bdoesn't\b/gi, 'does not'],
  [/\bdoesnt\b/gi, 'does not'],
  [/\bdon't\b/gi, 'do not'],
  [/\bdont\b/gi, 'do not'],
  [/\bisn't\b/gi, 'is not'],
  [/\bisnt\b/gi, 'is not'],
  [/\baren't\b/gi, 'are not'],
  [/\barent\b/gi, 'are not'],
  [/\bwasn't\b/gi, 'was not'],
  [/\bwasnt\b/gi, 'was not'],
  [/\bweren't\b/gi, 'were not'],
  [/\bwerent\b/gi, 'were not'],
  [/\bhaven't\b/gi, 'have not'],
  [/\bhavent\b/gi, 'have not'],
  [/\bhasn't\b/gi, 'has not'],
  [/\bhasnt\b/gi, 'has not'],
  [/\bhadn't\b/gi, 'had not'],
  [/\bhadnt\b/gi, 'had not'],

  // Informal reductions
  [/\bgonna\b/gi, 'going to'],
  [/\bwanna\b/gi, 'want to'],
  [/\bgotta\b/gi, 'got to'],
  [/\bdunno\b/gi, 'do not know'],
  [/\blemme\b/gi, 'let me'],
  [/\bgimme\b/gi, 'give me'],
  [/\bkinda\b/gi, 'kind of'],
  [/\bsorta\b/gi, 'sort of'],
  [/\bwhatcha\b/gi, 'what are you'],
  [/\bwatcha\b/gi, 'what are you'],
  [/\by'all\b/gi, 'you all'],
  [/\byall\b/gi, 'you all'],
];

const IDIOM_RULES = [
  // Apology / de-escalation idioms
  [/\bmy\s+bad\b/gi, 'apologize'],
  [/\bdid\s+not\s+mean\s+to\b/gi, 'apologize'],
  [/\bno\s+offense\b/gi, 'apologize'],
  [/\bchill\s+out\b/gi, 'relax calm'],
  [/\bno\s+worries\b/gi, 'relax calm'],
  [/\bno\s+problem\b/gi, 'relax calm'],
  [/\btake\s+it\s+easy\b/gi, 'relax calm'],

  // Secret / probing idioms
  [/\bspill\s+the\s+beans\b/gi, 'tell me your secret'],
  [/\bwhat\s+are\s+you\s+hiding\b/gi, 'tell me your secret'],
  [/\bcome\s+clean\b/gi, 'tell me your secret'],

  // Trade / commerce idioms
  [/\bhow\s+much\b/gi, 'trade price'],
  [/\bfor\s+sale\b/gi, 'trade price'],
  [/\bgot\s+(?:any\s+)?wares\b/gi, 'trade price'],
  [/\bselling\b/gi, 'trade price'],

  // Ruler / authority idioms
  [/\bwho(?:'s|\s+is)\s+in\s+charge\b/gi, 'who rules'],
  [/\bwho\s+runs\s+(?:this|the)\b/gi, 'who rules'],
  [/\bwho\s+runs\b/gi, 'who rules'],

  // Rumor / news idioms
  [/\bwhat(?:'s|\s+is)\s+the\s+word\b/gi, 'any rumors'],
  [/\bheard\s+the\s+latest\b/gi, 'any rumors'],

  // Farewell idioms
  [/\bpeace\s+out\b/gi, 'farewell'],
  [/\bcatch\s+you\s+later\b/gi, 'farewell'],
];

// Stage B: Everyday English Anchor Bank (~1,500+ common non-anachronistic words)
// Organized by category so ordinary English words never trigger CONFUSE_OOV.
const EVERYDAY_ENGLISH_RAW = `
a about above abroad absent absolute absolutely accept access accident accord account accurate accuse
ache achieve across act action active actual actually add addition address adjust admire admit
adopt adult advance advantage adventure advice advise affair affect afford afraid after afternoon
again against age agency agent ago agree agreed agreement ahead aid aim air alive all allow
almost alone along already alright also alter although altogether always amazing among amount
ancient and anger angle angry animal announce another answer anxious any anybody anyhow anyone
anything anytime anyway anywhere apart apparent apparently appeal appear appearance apple apply
appoint approach appropriate approve area argue argument arm arms army around arrange arrest
arrive arrow art article aside ask asleep aspect assault assemble assert assess assist assistance
associate assume assure at attach attack attempt attend attention attitude attract audience aunt
author authority autumn available average avoid awake aware away awful awhile
back background backward backwards bad badly bag balance ball band bandit bang bank bar bare
barely bargain bark barrel barrier base basic basically basis basket bath battle be bear beard
beast beat beautiful beauty became because become becoming bed been before began begin beginning
behalf behave behavior behind being belief believe bell belong below belt bench bend beneath
benefit beside besides best bet better between beyond big bill bind bird birth bit bite bitter
black blade blame blank blast blaze bleed blend bless blind block blood bloody bloom blow blue
board boast boat body boil bold bolt bomb bond bone book boot border bore born borrow boss both
bother bottle bottom bought bound boundary bow bowl box boy brain branch brand brave bravery bread
break breakfast breath breathe breed breeze brew bribe brick bridge brief briefly bright brilliant
bring broad broke broken bronze brother brought brown brush bubble buck bucket bud buddy budget
build building built bulk bullet bump bunch bundle burden burn burst bury bus bush business busy
but butter button buy buyer buying by
cabin cabinet cage cake calculate call called calling calm came camp campaign can canal cancel
candle candy capable capacity capital captain capture car card care career careful carefully
careless cargo carpet carry cart carve case cash cast castle casual cat catch category cause
caution cautious cease ceiling celebrate cell center central century certain certainly chain chair
challenge chamber champion chance change channel chaos chapter character charge charm chase chat
cheap cheat check cheek cheer cheerful cheese chest chew chief child childhood children chill chin
choice choose chose chosen church circle circumstance citizen city civil claim clan clap clarify
clash class classic clean clear clearly clerk clever client cliff climate climb cling clinic clip
cloak clock close closely closer closest cloth clothes clothing cloud cloudy club clue cluster
coal coast coat cobble code coffee coin coins cold collapse collar collect college colony color
column comb combat combine come comfort comfortable command commander comment commerce commit
common commonly companion company compare comparison compete competition complain complaint
complete completely complex comply compose compound conceal concentrate concept concern concerned
concernment conclude conclusion concrete condition conduct confer confess confidence confident
confirm conflict conform confuse confusion connect connection conquer conscience conscious consent
consequence conservative consider considerable considerably consist consistent constant constantly
construct consult consume contact contain content contest context continue continuous contract
contrast contribute control convenient convention conversation convert convince cook cool cooperate
cope copper copy cord core corn corner correct correctly correspond cost cottage cotton couch
could couldn count counter country countryside county couple courage course court cousin cover
cow coward crack cradle craft craftsman crash crate crawl crazy creak cream create creation
creature credit creek creep crew crime criminal crisis crisp critic critical criticize crop cross
crowd crown crucial crude cruel cruise crumb crush cry crystal cub cube cuff cultivate culture
cup cupboard cure curiosity curious curl current currently curse curtain curve cushion custom
customer cut cute cycle
dad daily damage damp dance danger dangerous dare dark darkness darling dash data date daughter
dawn day days dead deal dealer dealing dear death debate debt decade decay decent decide decision
deck declare decline decorate decrease dedicate deed deep deeply defeat defend defense define
definite definitely definition degree delay deliberate delicate delight deliver delivery demand
demolish demonstrate denial dense deny depart department depend dependent deposit depth derive
describe description desert deserve design desire desk despair desperate despite destroy detail
detect determine develop device devil devise devote dialogue diamond diary dice did didn die died
diet differ difference different differently difficult difficulty dig dignity dim dimension dine
dinner dip direct direction directly director dirt dirty disagree disappear disappoint disaster
disciple discipline disclose discount discover discovery discuss discussion disease disgust dish
dismiss disorder display dispute distance distant distinct distinguish distract distribute district
disturb dive diverse divide divine division do doctor doctrine document does doesn dog doing doll
dollar domain domestic dominate done don dont door dose dot double doubt dough down downstairs
dozen draft drag dragon drain drama dramatic draw drawer drawn dread dream dress drew drift
drill drink drip drive driver drop drown drug drum dry duck due dull dumb dump during dusk dust
dusty duty dwarf dwell dying
each eager ear earlier earliest early earn earnest earth ease easily east eastern easy eat echo
edge edit educate effect effective effectively effort egg eight either elaborate elbow elder
elect element elevate eleven else elsewhere embark embarrass embrace emerge emergency emotion
emotional emphasis emphasize empire employ employee employer empty enable enclose encounter
encourage end endless endorse endure enemy enemies energy enforce engage engine engineer enhance
enjoy enormous enough enrich ensure enter enterprise entertain entire entirely entitle entrance
entry envelope environment envy equal equally equip equipment era erase error escape especially
essay essential essentially establish estate estimate eternal even evening event eventually ever
every everybody everyday everyone everything everywhere evidence evident evil exact exactly
exaggerate examine example exceed excellent except exception exchange excite excited excitement
exclude excuse execute executive exercise exhaust exhibit exist existence exit expand expect
expense expensive experience experiment expert explain explanation explode explore export expose
express expression extend extent external extra extraordinary extreme extremely eye eyes
fabric face fact factor factory fade fail failure faint fair fairly faith faithful fake fall
fallen false fame familiar family famine famous fan fancy far fare farewell farm farmer farther
fashion fast fasten fat fatal fate father fault favor favorite fear fearful feast feather feature
federal fee feed feel feeling feet fell fellow female fence ferry fertile festival fetch fever
few fiber fiction field fierce fifteen fifth fifty fight fighting figure file fill film filter
final finally finance financial find finding fine finger finish fire firm firmly first fish
fist fit five fix flag flame flash flat flavor flaw flee fleet flesh flew flexible flight fling
flip float flock flood floor flour flow flower fluid flush flute fly foam focus fog fold folk
folks follow follower following fond food fool foolish foot forbid force forecast foreign forest
forever forget forgive forgot forgotten fork form formal former formerly fort forth fortune forty
forward fought foul found foundation founder four fourth fox fraction fragile frame frank frankly
fraud free freedom freeze frequent frequently fresh friend friendly friends friendship fright
frighten frog from front frontier frost frown froze frozen fruit frustrate fry fuel fulfill full
fully fun function fund fundamental funny fur furious furnace furnish furniture further furthermore
fury fuse future
gain galaxy gale gallery gamble game gang gap garage garden garlic garment gasp gate gather gauge
gave gaze gear general generally generate generation generous gentle gently genuine get ghost
giant gift giggle girl give given giving glad glance glare glass gleam glide glimpse glitter globe
gloom gloomy glory glove glow glue go goal goat god goes going gold golden gone good goodbye
goods goose gossip got gotten govern government governor grab grace graceful grade gradual
gradually grain grand grandfather grandmother grant grape grasp grass grateful grave gravel
gravity gray graze great greatly greed greedy green greet greeting greetings grew grief grieve
grim grin grind grip groan grocery groom ground group grow growl grown growth grudge grumble
guard guardian guards guess guest guide guild guilt guilty guitar gulf gulp gun guy guys gym
habit habitat had hadn hail hair half hall halt hammer hand handle hands handsome hang happen
happened happily happiness happy harbor hard hardly hardship harm harmless harmony harsh harvest
haste hasty hat hatch hate hatred haul haunt have haven having hawk hay hazard he head headache
heal healer health healthy heap hear heard hearing heart heat heaven heavy hedge heel height
heir held hell hello helmet help helped helper helpful helping helpless hence her herb herbs herd
here hero hers herself hesitate hide hiding high highly highway hike hill him himself hint hip
hire his history hit hitch hive hoard hoarse hobby hold holder hole holiday hollow holy home
homeland honest honestly honesty honey honor honorable hood hoof hook hoop hope hopeful hopefully
hopeless horizon horn horrible horror horse host hostile hot hotel hour hours house household
hover how however howl hug huge human humble humor hundred hung hunger hungry hunt hunter hurl
hurry hurt hurting husband hush hut hybrid
ice idea ideal identify identity idle if ignore ill illness illusion illustrate image imagine
immediate immediately immense immune impact impair impatient implement imply import importance
important impose impossible impress impressive improve impulse in incident include including
income increase indeed independent index indicate individual induce industry inevitable infant
infect infer influence inform information ingredient inhabit initial initially initiate injure
injury ink inn inner innocent input inquire inquiry insect insert inside insight insist inspect
inspire install instance instant instead instinct instruct instruction instrument insult insure
intact intend intense intent intention interact interest interesting interfere interior internal
interpret interrupt interval intimate into introduce invade invalid invent invest investigate
invite involve iron ironic island isolate issue it item items its itself
jacket jail jam jar jaw jazz jealous jeans jelly jewel job join joint joke jolly journal journey
joy judge judgment jug juice jump junction junior junk jury just justice justify
keen keep keeper kept kernel kettle key keys kick kid kidnap kill killed killing kin kind kindly
kindness king kingdom kiss kit kitchen kite knee kneel knew knife knight knit knock knot know
knowing knowledge known
label labor lace lack lad ladder lady laid lake lamb lame lamp land landing landlord landscape
lane language lantern lap large largely laser last late lately later latest latter laugh laughter
launch laundry law lawful laws lawyer lay layer lazy lead leader leadership leading leaf league
leak lean leap learn learned learning least leather leave leaving lecture led ledge left leg legacy
legal legend leisure lemon lend length lens less lesson let letter level lever liable liar
liberal liberty library license lick lid lie lied lies life lift light lighten lightning like
likely limb limit limitation limited limp line linen linger link lion lip liquid list listen
listener literal literally literary literature little live lively liver living load loaf loan
lobby local locate location lock lodge loft log logic lonely long look looking loose loosen loot
lord lore lose losing loss lost lot lots loud loudly lounge love lovely lover low lower loyal
loyalty luck lucky luggage lumber lump lunch lung lure lurk luxury lying
mad madam made magic magical magistrate maid mail main mainly maintain major majority make
maker making male mall mama manage management manager manifest manipulate manner manor mansion
manual manufacture many map maps marble march margin marine mark market marriage marry marvel
mask mass massive master match mate material math matter mature maximum may maybe mayor maze
me meadow meal mean meaning means meant meanwhile measure meat mechanic medal medical medicine
medium meet meeting melody melt member memory men mend mental mention menu merchant mercy
mere merely merge merit merry mess message messenger metal meter method middle midnight might
mighty mild mile military milk mill million mind mine miner mineral minimal minimum minister
minor minority minute miracle mirror misery miss missile missing mission mist mistake mix
mixture moan mob mobile mock mode model moderate modern modest modify moist moisture mold
molecule moment Monday money monitor monk monkey monster month monthly mood moon moral
morale more moreover morning moron mortal mortar moss most mostly mother motion motive motor
mount mountain mourn mouse mouth move movement movie much mud muddy mug multiple multiply
murder murmur muscle museum music musical must mustard mute mutter mutual my myself mysterious
mystery
nail naive name namely nap narrow nation national native natural naturally nature naught naughty
naval navigate navy near nearby nearly neat necessary necessity neck need needed needle negative
neglect negotiate neighbor neighborhood neither nephew nerve nervous nest net network neutral
never nevertheless new newly news next nice nicely nick nickname niece night nightmare nine
nineteen ninety ninth noble nobody nod noise noisy nominal none nonetheless nonsense noon nor
norm normal normally north northern nose not notable note nothing notice notify notion novel
now nowadays nowhere nuclear nudge nuisance numb number numerous nurse nut
oak oar oath obey object objection objective oblige obscure observe obtain obvious obviously
occasion occasional occasionally occupy occur ocean odd oddly odds odor of off offend offense
offer office officer official often oh oil okay old older oldest olive omen omit on once one
oneself ongoing onion online only onto open openly opera operate operation opinion opponent
opportunity oppose opposite option or oral orange orbit orchard order ordinary organ organic
orient origin original originally other others otherwise ought our ours ourselves out outcome
outdoor outer outfit outlet outline output outrage outside oval oven over overall overcome
overlook overnight overseas owe owing owl own owner ownership ox
pace pack package pact pad page paid pail pain painful paint painter painting pair palace pale
palm pan panel panic pant paper parade parallel parcel pardon parent park part partial partially
participate particular particularly partly partner partnership party pass passage passenger passion
passive past paste pat patch path patience patient patrol patron pattern pause pave paw pay
payment pea peace peaceful peak peanut pear peasant pebble peculiar pedal peel peep peer peg
pen penalty pencil pending penetrate penny people pepper per perceive percent percentage perch
perfect perfectly perform performance perhaps peril period permanent permission permit persist
person personal personality personally persuade pest pet petition petty phase phenomenon
philosophy phrase physical physician pick pickle picnic picture pie piece pier pierce pig
pigeon pile pilgrim pill pillar pillow pilot pin pinch pine pink pint pioneer pipe pistol pit
pitch pity pizza place placid plain plainly plan plane planet plank plant plaster plastic plate
plateau platform play player playing pleasant please pleased pleasure pledge plenty plot plow
pluck plug plum plumb plume plump plunder plunge plural plus pocket poem poet poetry point
pointed poison poke pole policy polish polite politely political politics poll pollute pond
ponder pony pool poor poorly pop popular population porch pore pork port portable portal porter
portion portrait pose position positive possess possession possible possibly post pot potato
potential pound pour poverty powder power powerful practical practically practice praise pray
prayer preach precede precious precise precisely predict prefer preference pregnant premise
prepare presence present preserve preside press pressure pretend pretty prevail prevent previous
previously prey price pride priest primary prime primitive prince princess principal principle
print prior prison prisoner privacy private privilege prize pro probable probably problem proceed
process proclaim produce product profession professional professor profile profit profound program
progress project prominent promise promote prompt prone proof proper properly property prophecy
prophet proportion proposal propose prospect protect protection protest proud proudly prove
provide provided province provision provisions provoke prowler pry public publication publish
pudding puff pull pulse pump pumpkin punch punctual punish punishment pupil puppet purchase pure
purely purple purpose purse pursue pursuit push put puzzle
quaint qualify quality quantity quarrel quarry quarter queen queer quest question quick quickly
quiet quietly quilt quit quite quiver quiz quota quote
rabbit race racial rack radar radiant radical radio raft rage raid rail rain rainbow raise rake
rally ramble ranch random range rank ransom rapid rapidly rare rarely rash rat rate rather
ratio ration rational rations rattle raven raw ray razor reach react reaction read reader readily
reading ready real realistic reality realize really realm reap rear reason reasonable reasonably
rebel rebellion rebuild recall receipt receive recent recently recipe reckon recognize recommend
record recover recovery recruit red reduce refer reference refine reflect reform refuge refugee
refund refuse regard regardless regime region register regret regular regularly regulate reign
reject relate relation relationship relative relatively relax release relevant reliable relief
relieve religion religious rely remain remainder remark remarkable remedy remember remind
remnant remote remove render renew rent repair repeat replace reply report represent
representative republic reputation request require rescue research resemble reserve reside
resident resign resist resistance resolve resort resource resources respect respective
respectively respond response responsibility responsible rest restaurant restore restrain
restrict result resume retail retain retire retreat return reveal revenge revenue reverse review
revise revive reward rhythm rib ribbon rice rich rid riddle ride rider ridge ridiculous rifle
right rightly rights rigid rim ring rinse riot rip ripe ripple rise risk rite ritual rival
rivals river road roads roam roar roast rob robber robbery robe robin rock rocket rod rode role
roll roof room root rope rose rot rotate rotten rough roughly round route routine row royal
rub rubber rubbish rude rug ruin ruins rule ruler rules rumble rumor rumors run runner running
rural rush rust rustic
sack sacred sacrifice sad sadly safe safely safety sage said sail sailor saint sake salad salary
sale salt salutations salvation same sample sand sandwich sane sanity sap sash sat satisfy
sauce saucer savage save saving saw say saying scale scalp scan scandal scar scarce scarcely
scare scared scarf scatter scene scent schedule scheme scholar school science scientific
scientist scissors scold scoop scope score scorn scout scowl scramble scrap scrape scratch
scream screen screw script scroll scrub scum sea seal seam search season seat second secondary
secret secretly secrets sect section sector secure security see seed seek seeker seem seemed
seems seen seize seldom select self selfish sell seller senate send sender senior sense sensible
sensitive sent sentence separate separately sequence serene series serious seriously servant
serve service session set settle settlement settler seven seventeen seventy several severe
severely sew shade shadow shaft shake shall shallow sham shame shape share sharp sharply shatter
shave she shear shed sheep sheer sheet shelf shell shelter shepherd shield shift shine shiny
ship shipment shirt shiver shock shoe shoot shop shore short shortage shortly shot should
shouldn shoulder shout shove show shower shred shriek shrill shrimp shrine shrink shroud shrub
shrug shudder shuffle shun shut shutter shy sick side siege sigh sight sign signal signature
silence silent silently silk silly silver similar similarly simple simply sin since sincere
sincerely sing single sink sip sir sister sit site situation six sixteen sixty size sketch sketchy
ski skill skilled skin skip skirt skull sky slab slack slam slander slap slash slate slave
slay sled sleek sleep sleeve slender slice slick slid slide slight slightly slim slime sling
slip slipper slippery slit slogan slope slot slow slowly slug slum slumber slump sly smack
small smart smash smear smell smile smirk smoke smooth smoothly smuggle smuggler snack snag
snail snake snap snare snarl snatch sneak sneer sneeze sniff snip snob snoop snore snort snout
snow snug so soak soap soar sob sober social society sock socket sod soda sofa soft softly
soil solar sold soldier soldiers sole solely solemn solid solitary solution solve somber some
somebody somehow someone something sometimes somewhat somewhere son song soon soothe sore
sorrow sorry sort soul sound soup sour source south southern space spade span spare spark
sparkle sparrow sparse spatial speak speaker speaking spear special specialist species specific
specifically specify specimen spectacle speech speed spell spend spent sphere spice spicy
spider spike spill spin spine spiral spirit spiritual spit spite splash splendid split spoil
spoke spoken sponge sponsor spontaneous spoon sport spot spouse sprawl spray spread spring
sprinkle sprint sprout spur spurn spy squad square squash squat squeak squeal squeeze squint
squirm squirrel stab stable stack staff stage stagger stain stair stairs stake stale stalk
stall stammer stamp stand standard staple star starch stare stark stars start startle starve
state statement static station statue status stay steady steak steal steam steel steep steer
stem step stern steward stick sticky stiff still stillness stimulate sting stink stint stir
stitch stock stocking stomach stone stood stool stoop stop storage store stork storm story
stories stout stove stow straight strain strait strand strange stranger strap strategy straw
stray streak stream street strength strengthen stress stretch strict strictly stride strife
strike striking string strip stripe strive stroke stroll strong strongly struck structure
struggle strum strut stub stubble stubborn stuck student study stuff stumble stump stun stunt
stupid sturdy stutter style subject submit subscribe subsequent substance substantial substitute
subtle subtract succeed success successful successfully such suck sudden suddenly sue suffer
suffice sufficient sugar suggest suggestion suit suitable suite sulfur sullen sum summarize
summary summer summit summon summons sun sunday sung sunk sunlight sunny sunrise sunset
sunshine super superb superior supervise supper supplement supply support suppose supposed
suppress supreme sure surely surface surge surgeon surplus surprise surrender surround survey
survival survive survivor suspect suspend suspicion suspicious sustain swallow swamp swan swap
swarm sway swear sweat sweep sweet swell swept swift swiftly swim swing swirl switch
sword swords swore sworn symbol sympathetic sympathy symptom system
table tablet tackle tactic tag tail tailor taint take taken taking tale talent talk talking tall
tallow tame tan tangle tank tap tape tar target tariff task taste taught tavern tax taxes tea
teach teacher team tear tears tease technical technique tedious teen teeth tell telling temper
temple temporary tempt ten tenant tend tendency tender tense tension tent tenth term terms
terrain terrible terribly territory terror test testify testimony text texture than thank
thankful thanks that the theater theft their theirs them theme themselves then theory therapy
there thereby therefore these they thick thief thieves thin thing things think thinking third
thirst thirsty thirteen thirty this thorn thorough thoroughly those though thought thoughtful
thoughts thousand thread threat threaten threatened threats three threshold threw thrift thrill
thrive throat throb throne throng throttle through throughout throw thrown thrust thud thumb
thump thunder thus tick ticket tickle tide tidy tie tiger tight tightly tile till tilt timber
time timely times timid tin tinder tingle tint tiny tip tiptoe tire tired tissue title to toad
toast tobacco today toddle toe together toil toilet token told tolerate toll tomb tome tomorrow
ton tone tongue tonight too took tool tools tooth top topic torch torment torn tornado torrent
torture toss total totally touch tough tour tournament tow toward towards towel tower town
toy trace track tracks tract trade trader tradition traditional traffic tragedy trail train
trait traitor tramp trample trance tranquil transact transfer transform transit translate
transmit transparent transport trap trash travel traveler tray tread treasure treasury treat
treaty tree trees trek tremble tremendous tremor trench trend trial tribe tribute trick trickle
trifle trigger trim trinity trinket trio trip triple triumph trivial trod troop troops trophy
trot trouble troublesome trough troupe trousers trout truce truck true truly trump trumpet
trunk trust trusty truth try trying tub tube tuck tuft tug tumble tune tunic tunnel turf turkey
turmoil turn turtle tusk tutor twelve twenty twice twig twilight twin twine twinkle twirl twist
two type typical typically tyrant
ugly ultimate ultimately umbrella unable unaware unbroken uncertain uncle unclear uncomfortable
uncommon under undergo underground underneath understand understanding undertake undo uneasy
unfair unfortunate unfortunately unhappy uniform union unique unit unite unity universe
university unknown unless unlike unlikely unlimited unload unlock unlucky unnecessary unpleasant
unusual unveil unwilling up update upgrade uphold upon upper upright uproar upset upside
upstairs upstream upstart uptight upward urban urge urgent us usage use used useful useless
user usual usually utter utterly
vacant vacation vague vain vale valid valley valor valuable value valve vanish vanity vapor
variable variety various vary vase vast vault veer vegetable veil vein velvet vendor vengeance
venom vent venture verb verbal verdict verge verify vermin verse version versus vessel vest
veteran veto vex via viable vibrant vice vicinity vicious victim victory video view vigil vigor
vile villa village villager villain vine vinegar vintage violate violence violent violet violin
virgin virtual virtue visible vision visit visitor visual vital vivid vocal voice void volume
volunteer vortex vote vouch vow vowel voyage vulgar vulnerable
wad wade wafer wag wage wager wages wagon waist wait waiter waiting waive wake walk wall
walls wallet wallow walnut wander wanderer wane want wanted wanting war ward warden ware wares
warehouse warfare warm warmth warn warning warrant warrior wart wary was wash wasp waste
watch watcher water waters waterproof wave waves wax way ways we weak weaken weakness wealth
wealthy weapon weapons wear weary weather weave weaver web wedding wedge weed week weeks weep
weigh weight weird welcome welfare well went were weren west western wet whale wharf what
whatever wheat wheel wheeze when whenever where whereas whereby wherever whether which whiff
while whim whimper whine whip whirl whisker whisper whispers whistle white whittle who whoever
whole wholesale wholesome whom whose why wick wicked wide widely widen widespread widow width
wield wife wig wild wilderness wildly wilds will willing willow wilt wily win wince winch wind
winding window windy wine wing wings wink winner winter wipe wire wisdom wise wish wisp wit
witch with withdraw wither withhold within without witness witty wizard wobble woe woke wolf
wolves woman women won wonder wonderful wont woo wood wooden woods wool word words work worker
world worm worn worry worse worship worst worth worthless worthy would wouldn wound wove woven
wow wrap wrath wreak wreath wreck wrench wrest wrestle wretch wring wrinkle wrist writ write
writer writing written wrong wrote wry
yard yarn yawn yeah year years yeast yell yellow yes yesterday yet yield yoke yolk you young
your yours yourself yourselves youth
zeal zero zest zinc zone zoo
`;

const EVERYDAY_ENGLISH = new Set(
  EVERYDAY_ENGLISH_RAW.trim().split(/\s+/).map((w) => w.toLowerCase())
);

// Stage B: Semantic synonym hints (category -> cue/context hints)
const SEMANTIC_SYNONYMS = {
  // Weapon / threat context
  dagger: 'weapon', blade: 'weapon', sword: 'weapon', knife: 'weapon',
  axe: 'weapon', spear: 'weapon', bow: 'weapon', club: 'weapon',
  // Trade / currency context
  cash: 'trade', coins: 'trade', coin: 'trade', bucks: 'trade',
  gold: 'trade', silver: 'trade', price: 'trade', cost: 'trade', fee: 'trade',
  wares: 'trade', goods: 'trade', barter: 'trade',
  // Ruler / authority context
  mayor: 'ruler', boss: 'ruler', chief: 'ruler', king: 'ruler',
  queen: 'ruler', governor: 'ruler', lord: 'ruler', lady: 'ruler',
  magistrate: 'ruler', warden: 'ruler', commander: 'ruler',
  // Suspicious / rumor context
  sketchy: 'suspicious', shady: 'suspicious', fishy: 'suspicious',
  crooked: 'suspicious', corrupt: 'suspicious', gossip: 'rumor',
};

// Pure phatic openers that should not drown out a substantive second clause
const PHATIC_GREET_SET = new Set([
  'hi', 'hey', 'hello', 'yo', 'hiya', 'howdy', 'greetings', 'salutations', 'hail',
]);

/**
 * Light Porter-style suffix stripper for everyday English word recognition.
 * Returns candidate stems to check against the anchor bank.
 * @param {string} word
 * @returns {string[]}
 */
export function stemWord(word) {
  const w = String(word || '').toLowerCase();
  if (w.length <= 3) return [w];
  const stems = [w];

  if (w.endsWith('ies') && w.length > 4) {
    stems.push(w.slice(0, -3) + 'y');
  }
  if (w.endsWith('ied') && w.length > 4) {
    stems.push(w.slice(0, -3) + 'y');
  }
  if (w.endsWith('es') && w.length > 4) {
    stems.push(w.slice(0, -2));
  }
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) {
    stems.push(w.slice(0, -1));
  }
  if (w.endsWith('ing') && w.length > 5) {
    const base = w.slice(0, -3);
    stems.push(base);
    stems.push(base + 'e');
    if (base.length >= 2 && base[base.length - 1] === base[base.length - 2]) {
      stems.push(base.slice(0, -1));
    }
  }
  if (w.endsWith('ed') && w.length > 4) {
    const base = w.slice(0, -2);
    stems.push(base);
    stems.push(base + 'e');
    if (base.length >= 2 && base[base.length - 1] === base[base.length - 2]) {
      stems.push(base.slice(0, -1));
    }
  }
  if (w.endsWith('ly') && w.length > 4) {
    const base = w.slice(0, -2);
    stems.push(base);
    if (base.endsWith('i')) stems.push(base.slice(0, -1) + 'y');
  }
  if (w.endsWith('ness') && w.length > 6) {
    const base = w.slice(0, -4);
    stems.push(base);
    if (base.endsWith('i')) stems.push(base.slice(0, -1) + 'y');
  }
  if (w.endsWith('ment') && w.length > 6) {
    stems.push(w.slice(0, -4));
  }
  if (w.endsWith('ful') && w.length > 5) {
    const base = w.slice(0, -3);
    stems.push(base);
    if (base.endsWith('i')) stems.push(base.slice(0, -1) + 'y');
  }
  if (w.endsWith('less') && w.length > 6) {
    stems.push(w.slice(0, -4));
  }
  if (w.endsWith('able') && w.length > 6) {
    const base = w.slice(0, -4);
    stems.push(base);
    stems.push(base + 'e');
  }
  if (w.endsWith('er') && w.length > 4) {
    const base = w.slice(0, -2);
    stems.push(base);
    stems.push(base + 'e');
    if (base.length >= 2 && base[base.length - 1] === base[base.length - 2]) {
      stems.push(base.slice(0, -1));
    }
  }
  if (w.endsWith('est') && w.length > 5) {
    const base = w.slice(0, -3);
    stems.push(base);
    stems.push(base + 'e');
  }
  return stems;
}

export class InputTranslator {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Check whether a word (or its morphological stem) belongs to everyday English.
   * @param {string} word
   * @returns {boolean}
   */
  isKnownEnglishWord(word) {
    const w = String(word || '').toLowerCase();
    if (!w) return true;
    const stems = stemWord(w);
    for (let i = 0; i < stems.length; i++) {
      if (EVERYDAY_ENGLISH.has(stems[i])) return true;
    }
    return false;
  }

  /**
   * Translate raw messy player input into canonical cue-friendly text,
   * semantic hints, and priority-tagged clauses.
   *
   * @param {string} rawText
   * @param {object} [ctx={}]
   */
  translate(rawText, ctx = {}) {
    const raw = String(rawText ?? '');
    let text = raw.toLowerCase();

    // Stage A1: Contractions & slang
    for (const [re, rep] of CONTRACTION_AND_SLANG_RULES) {
      text = text.replace(re, rep);
    }

    // Stage A2: Idioms
    for (const [re, rep] of IDIOM_RULES) {
      text = text.replace(re, rep);
    }

    // Clean whitespace
    const canonicalText = text.replace(/\s+/g, ' ').trim();

    // Tokenize for Stage B semantic hints
    const tokens = canonicalText.match(/[a-z0-9]+(?:'[a-z]+)?/gi) || [];
    const semanticHints = [];
    const seenHints = new Set();
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i].toLowerCase();
      const cat = SEMANTIC_SYNONYMS[t];
      if (cat && !seenHints.has(cat)) {
        seenHints.add(cat);
        semanticHints.push({ token: t, category: cat });
      }
    }

    // Stage C: Clause splitting & leading-phatic detection
    const clauses = this.splitClauses(canonicalText);
    const hasLeadingGreeting =
      clauses.length > 1 && this.isPureGreetingClause(clauses[0]);

    return {
      rawText: raw,
      canonicalText,
      tokens: tokens.map((t) => t.toLowerCase()),
      clauses,
      hasLeadingGreeting,
      semanticHints,
      ctxUsed: Boolean(ctx && (ctx.worldGraph || ctx.workingMemory)),
    };
  }

  /**
   * Split text into clauses on punctuation and coordinating/contrastive conjunctions.
   * @param {string} text
   * @returns {string[]}
   */
  splitClauses(text) {
    if (!text) return [];
    const sentences = text
      .split(/(?:[.!?;]+)+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const clauses = [];
    for (const sent of sentences) {
      const parts = sent.split(
        /\s*(?:,\s*(?=(?:but|yet|so|and|or|though|although|however|can|could|would|will|do|did|who|what|where|why|how|tell|give|i|you|we|he|she|they)\b)|\s*—\s*|\s*--\s*|\s*,\s+|\b(?:but|however|although|though)\b)\s*/i
      );
      for (const part of parts) {
        const cleaned = part.replace(/^[,:\-\s]+|[,:\-\s]+$/g, '').trim();
        if (cleaned) clauses.push(cleaned);
      }
    }
    return clauses.length > 0 ? clauses : [text];
  }

  /**
   * True when a clause is purely a short greeting opener (e.g. "hey", "hello there").
   * @param {string} clause
   * @returns {boolean}
   */
  isPureGreetingClause(clause) {
    const toks = (clause.match(/[a-z0-9]+/gi) || []).map((t) => t.toLowerCase());
    if (toks.length === 0 || toks.length > 3) return false;
    if (PHATIC_GREET_SET.has(toks[0])) {
      if (toks.length === 1) return true;
      if (toks.length === 2 && (toks[1] === 'there' || toks[1] === 'friend' || toks[1] === 'stranger')) {
        return true;
      }
    }
    return false;
  }
}

export function translateInput(rawText, ctx = {}) {
  return new InputTranslator().translate(rawText, ctx);
}

export default InputTranslator;
