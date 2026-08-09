/* Shout It! - original phrase categories. 8 categories, 50+ entries each.
 * All content original to GreenGuard Studio. No licensed or trademarked
 * catchphrases, titles, brands or characters appear in any deck.
 * Decks 1-6 carry the prototype's 261 phrases forward unchanged.
 */
'use strict';
var SHOUT_DECKS = [
  {
    id: 'objects',
    name: 'Everyday Objects',
    blurb: 'Things from the junk drawer of life',
    color: '#FFB03A',
    phrases: [
      'rubber band ball', 'squeaky screen door', 'tangled charger cord', 'lint roller',
      'wobbly kitchen chair', 'empty tape dispenser', 'ice cube tray', 'spare button',
      'sticky drawer', 'dusty ceiling fan', 'cracked flower pot', 'laundry basket',
      'broken umbrella', 'shoelace with a knot', 'fridge magnet', 'old shoebox',
      'leaky faucet', 'crumpled receipt', 'stack of coasters', 'travel toothbrush',
      'dented lunchbox', 'folding step stool', 'half melted candle', 'too many keys on one ring',
      'rusty watering can', 'remote with dead batteries', 'clothespin', 'bathroom scale',
      'tape measure', 'doorstop wedge', 'knob on a stove', 'shower curtain ring',
      'loose floorboard', 'pencil sharpener', 'desk lamp with a bent neck', 'tin full of buttons',
      'mismatched sock', 'paper clip chain', 'dish drying rack', 'sleeping bag',
      'mug with a chipped rim', 'velcro strap', 'mop bucket', 'curtain rod',
      'a bag full of other bags', 'stubborn jar lid', 'roll of packing tape', 'the junk drawer',
      'flashlight with weak batteries', 'squeaky office chair', 'a stack of unread mail',
      'a mug used as a pen cup'
    ]
  },
  {
    id: 'movies',
    name: 'Made-Up Movies',
    blurb: 'Films that never got made, thankfully',
    color: '#C48CFF',
    phrases: [
      'Attack of the Sleepy Ferns', 'The Last Bus to Nowhere', 'Revenge of the Mailroom',
      'Midnight at the Laundromat', 'Two Goats and a Truck', 'The Great Sock Heist',
      'Escape from Aunt Hilda', 'The Whispering Elevator', 'Doctor Pickle and the Time Fence',
      'A Very Loud Silence', 'Ballad of the Broken Kettle', 'Ninety Days of Rain',
      'The Boy Who Argued With Bees', 'Return of the Lawn Gnome', 'Ghosts in the Vending Machine',
      'The Accidental Mayor', 'Storm Over Pancake Valley', 'My Neighbor Is a Volcano',
      'Curse of the Second Draft', 'Six Ways to Miss a Train', 'The Last Honest Plumber',
      'Winter of the Angry Duck', 'The Man Who Forgot His Hat', 'Fistful of Paperwork',
      'The Underwater Bakery', 'Prisoner of the Waiting Room', 'A Bridge Made of Spoons',
      'The Loudest Library', 'Chasing the Number Nine', 'The Detective Who Hated Clues',
      'Somewhere Beneath the Parking Lot', 'The Girl With the Copper Bicycle',
      'Attack of the Polite Robots', 'The Long Weekend of Doom', 'Tales From the Broken Toaster',
      'The Wolf Who Ran a Diner', 'Hurricane in a Teacup', 'The Forgotten Floor',
      'Once Upon a Traffic Jam', 'The Quiet War of Apartment Nine', 'Beyond the Blue Fence',
      'The Last Sandwich on Earth', 'Marching Band of the Doomed', 'A Thousand Tiny Doors',
      'The Suspicious Gardener', 'The Museum of Missing Socks', 'Thunder Over the Bake Sale',
      'My Uncle the Pirate', 'The Last Ferry to Marbletown', 'Attack of the Slow Signal',
      'Song of the Rusty Anchor', 'The Committee of Owls'
    ]
  },
  {
    id: 'animals',
    name: 'Animal Situations',
    blurb: 'Creatures behaving badly',
    color: '#5FD97A',
    phrases: [
      'a cat stuck in a paper bag', 'a dog who found the trash', 'a squirrel raiding a bird feeder',
      'a horse wearing a hat', 'a duck crossing a busy road', 'a goldfish watching you eat',
      'a raccoon opening a cooler', 'a parrot repeating a secret', 'a cow blocking the driveway',
      'a hamster on a squeaky wheel', 'a goat standing on a car', 'a pigeon stealing a fry',
      'a turtle racing a snail', 'a bear looking in the window', 'a chicken escaping the yard',
      'a sheep that needs a haircut', 'a monkey holding a phone', 'a frog in a rain boot',
      'a bat loose in the living room', 'a dog howling at a siren', 'a cat knocking things off a shelf',
      'bees swarming a picnic', 'a puppy meeting a mirror', 'a moose in the parking lot',
      'an owl staring right at you', 'a spider in the bathtub', 'a donkey refusing to move',
      'a seagull on your beach towel', 'a kitten climbing the curtain', 'a fox trotting down the sidewalk',
      'a snake in the coiled hose', 'a peacock showing off', 'a rooster crowing at four in the morning',
      'a dolphin following the boat', 'a mouse behind the stove', 'an elephant taking a dust bath',
      'a crab walking sideways away', 'a rabbit in the vegetable patch', 'a wet dog shaking off',
      'a llama that spits', 'a deer eating the flowers', 'a penguin sliding on its belly',
      'a cat sitting on the keyboard', 'a hedgehog rolling into a ball', 'geese honking overhead',
      'a puppy stealing a sock', 'a cat that refuses the new bed', 'a swan guarding the path',
      'a lizard doing pushups on a rock', 'a crow collecting shiny things', 'a dog riding in a truck bed',
      'a flock of sheep crossing the road'
    ]
  },
  {
    id: 'food',
    name: 'Food Mashups',
    blurb: 'Recipes nobody asked for',
    color: '#FF7A9C',
    phrases: [
      'pancake lasagna', 'pickle ice cream', 'spaghetti tacos', 'breakfast pizza',
      'waffle burger', 'soup smoothie', 'chocolate french fries', 'popcorn cereal',
      'grilled cheese donut', 'peanut butter noodles', 'watermelon salsa', 'birthday cake fries',
      'bacon jam', 'mashed potato pie', 'sushi burrito', 'pretzel bread pudding',
      'hot sauce lemonade', 'apple pie nachos', 'noodle omelette', 'cucumber cupcake',
      'garlic milkshake', 'banana chili', 'cornbread waffle', 'macaroni pancakes',
      'marshmallow meatballs', 'pizza dumplings', 'honey pickle chips', 'pumpkin noodle soup',
      'strawberry gravy', 'egg salad tacos', 'coffee barbecue sauce', 'cinnamon pretzel stew',
      'maple bacon donut', 'mango hot dog', 'tomato layer cake', 'curry mashed potatoes',
      'sour cream sundae', 'caramel popcorn chicken', 'basil pesto pancakes', 'blueberry burger',
      'mustard cookie', 'cheddar oatmeal', 'ranch milkshake', 'waffle sandwich cookie',
      'spicy watermelon soup', 'pancake burrito', 'onion ring donut', 'pineapple meatloaf',
      'cereal crusted chicken', 'lime pickle brownie', 'gravy popsicle', 'hot chocolate ramen'
    ]
  },
  {
    id: 'town',
    name: 'Around Town',
    blurb: 'Everything past the front door',
    color: '#4FC9FF',
    phrases: [
      'the long line at the post office', 'a broken parking meter', 'the corner grocery store',
      'a crossing guard', 'the fountain in the square', 'a food truck at lunchtime',
      'the library return slot', 'a pothole nobody fixes', 'the bell on the bakery door',
      'a bus that is always late', 'the barber shop pole', 'an empty movie theater',
      'the farmers market on Saturday', 'a street musician with a bucket', 'the drive-through window',
      'a fire hydrant painted yellow', 'the school pickup line', 'a laundromat at midnight',
      'the town water tower', 'a park bench with a plaque', 'the traffic light that takes forever',
      'the hardware store aisle', 'the sound of a leaf blower', 'a garage sale sign',
      'the ice rink in winter', 'a construction detour', 'the smell from a pizza place',
      'a bike chained to a railing', 'the ferry dock', 'the dog park at sunset',
      'the courthouse steps', 'a vending machine in the lobby', 'the bowling alley on league night',
      'a shortcut through the alley', 'a crowded elevator', 'a mural on a brick wall',
      'the last open gas station', 'a train crossing with the arms down', 'the community pool',
      'a nosy neighbor window', 'the flower stand on the corner', 'a puddle at the curb',
      'the recycling center on a Saturday', 'a mailbox that leans', 'the coffee shop with one outlet',
      'the squeaky gate at the ballfield', 'a car wash with spinning brushes', 'the bell tower at noon',
      'a bench outside the barbershop', 'the crosswalk that beeps', 'a busy taco stand',
      'the hill everyone sleds on'
    ]
  },
  {
    id: 'moods',
    name: 'Feelings and Moods',
    blurb: 'Act it out, do not say it',
    color: '#FFD166',
    phrases: [
      'nervous before a speech', 'relieved after a test', 'hungry and grumpy at once',
      'proud of a small win', 'embarrassed in public', 'homesick',
      'suspicious of a deal', 'giddy with excitement', 'bored in a long meeting',
      'grumpy before coffee', 'lonely in a crowd', 'overwhelmed by too many choices',
      'smug about being right', 'jealous of a friend', 'exhausted but happy',
      'anxious about a phone call', 'content on a rainy day', 'furious at a slow computer',
      'hopeful about tomorrow', 'sheepish after a mistake', 'restless at night',
      'grateful for a favor', 'impatient in traffic', 'confused by directions',
      'starstruck', 'disappointed by an ending', 'cozy under a blanket',
      'panicked about being late', 'amused by a bad pun', 'stubborn about a rule',
      'wistful over old photos', 'spooked by a noise', 'determined to finish',
      'flustered while cooking', 'skeptical of an excuse', 'elated after good news',
      'guilty about a midnight snack', 'curious about a closed door', 'annoyed by a dripping sound',
      'peaceful by the water', 'dizzy after spinning', 'triumphant at the finish line',
      'awkward at a family photo', 'calm after a long walk', 'antsy waiting for results',
      'smitten with a new song', 'sour about losing a bet', 'brave before a dive',
      'nostalgic for a summer job', 'frazzled by a group chat', 'serene in an empty gym',
      'stunned by a plot twist'
    ]
  },
  {
    id: 'sports',
    name: 'Sports and Sillier Sports',
    blurb: 'Real games and invented ones',
    color: '#FF8A5B',
    phrases: [
      'a dunk that shakes the rim', 'the last second free throw', 'a coach yelling from the sideline',
      'a crossover that breaks ankles', 'the wave going around the stadium', 'a soggy hot dog at the game',
      'the referee who misses everything', 'a benchwarmer finally called in', 'overtime in the rain',
      'a bicycle race up a steep hill', 'synchronized swimming in a kiddie pool', 'competitive napping',
      'a three legged race', 'tug of war with a rope that snaps', 'the mascot dancing on the roof',
      'a skater landing a triple jump', 'a marathon runner hitting the wall', 'a pitcher shaking off the sign',
      'a goalie diving the wrong way', 'a rally that never ends', 'a golf ball in the water hazard',
      'the halftime snack line', 'a bowling ball in the gutter', 'a giant foam finger',
      'a photo finish', 'chess with boxing gloves on', 'extreme kite flying', 'office chair racing',
      'a relay baton dropped', 'a swimmer touching the wall first', 'the losing team handshake line',
      'a fan running onto the field', 'a scoreboard stuck at zero', 'a whistle that will not stop',
      'a bench clearing celebration', 'a locker door slammed', 'a trophy too heavy to lift',
      'underwater basket weaving', 'a dodgeball to the face', 'the coin toss',
      'a player faking an injury', 'a home run over the fence', 'a skateboard trick down a rail',
      'the crowd doing a slow clap', 'a puck lost in the lights', 'a sprinter in the starting blocks',
      'a snowboarder wiping out', 'a volleyball spike', 'a pep talk in the huddle',
      'a season ending in a tie', 'a jersey number retired', 'a bracket busted on day one',
      'a water cooler dumped on the coach'
    ]
  },
  {
    id: 'gadgets',
    name: 'Gadgets and Glitches',
    blurb: 'Technology, working as intended',
    color: '#7DE2D1',
    phrases: [
      'a phone at two percent battery', 'the printer that jams every time', 'a smart speaker mishearing you',
      'a laptop fan screaming', 'autocorrect ruining a message', 'a video call with frozen faces',
      'the loading spinner that never stops', 'a password you cannot remember', 'a robot vacuum stuck on a rug',
      'a doorbell camera at three in the morning', 'headphones that work on one side', 'a watch counting fake steps',
      'the update that restarts everything', 'a cable that fits nothing', 'a screen with a cracked corner',
      'a mouse with a sticky wheel', 'an app congratulating you for standing', 'a keyboard missing one key',
      'a drone stuck in a tree', 'the volume jumping to maximum', 'a screenshot sent to the wrong chat',
      'a dashboard full of warning lights', 'a projector showing your desktop', 'a text sent before you finished',
      'the app that begs for a review', 'a game that lags at the worst moment', 'a webcam pointed at the ceiling',
      'a scanner that scans crooked', 'a battery pack that is also dead', 'a search that finds nothing',
      'an album full of blurry pictures', 'a fridge that sends notifications', 'a thermostat with its own plans',
      'a self checkout asking for help', 'a garage door opener that gave up', 'a ringtone in a quiet room',
      'a group chat with four hundred unread', 'a smart bulb stuck on purple', 'the printer out of one color',
      'a computer asking to reboot again', 'a case thicker than the phone', 'earbuds lost in the couch',
      'a tangle of charging bricks', 'a car that will not pair', 'the signal that works in one room',
      'a stylus rolling off the desk', 'a photo taken by accident', 'an assistant answering the wrong question',
      'a treadmill with a broken display', 'a printer that prints one blank page', 'a delivery alert at midnight',
      'a spreadsheet that will not save'
    ]
  }
];

/* Original team identities: name pool + palette. */
var SHOUT_TEAM_COLORS = [
  { key: 'coral', name: 'CORAL', color: 0xff5d73, dim: 0x6d2634, glow: '#ff5d73' },
  { key: 'aqua', name: 'AQUA', color: 0x22d3ee, dim: 0x125a66, glow: '#22d3ee' },
  { key: 'lime', name: 'LIME', color: 0xa3e635, dim: 0x4a661a, glow: '#a3e635' },
  { key: 'amber', name: 'AMBER', color: 0xfbbf24, dim: 0x6d5210, glow: '#fbbf24' }
];

var SHOUT_TEAM_NAMES = [
  'LOUD FERNS', 'SOCK BANDITS', 'PORCH LIONS', 'WAFFLE CREW', 'BUS STOP KINGS',
  'QUIET THUNDER', 'MOP SQUAD', 'RIVER MOTHS', 'TOAST PATROL', 'LAMP GOBLINS',
  'PAPER TIGERS', 'SLOW CLAPS', 'BACKYARD BEARS', 'JAM JAR GANG', 'NIGHT OWLS',
  'CACTUS CLUB', 'PICKLE FLEET', 'ROOF CATS', 'SPOON RIOT', 'DUST BUNNIES'
];
