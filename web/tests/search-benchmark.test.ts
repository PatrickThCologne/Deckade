import { describe, expect, it } from 'vitest';
import { normalizeForSearch } from '../src/lib/cards/sort';
import { nameWins, parseQuery, type SearchQuery, understood } from '../src/lib/search/query';
import OVERVIEW_SETS from './fixtures/overview-sets.json';

/**
 * Requests as players type them, in German and English, and what they mean: each row checks
 * only the fields the request is about. The sets are those the site searches
 * (fixtures/overview-sets.json), the creature types a small fixed part of those the site takes
 * from the catalog.
 */
const CREATURE_TYPES = [
  'angel',
  'avatar',
  'bird',
  'cat',
  'dinosaur',
  'dragon',
  'elemental',
  'elf',
  'faerie',
  'goblin',
  'human',
  'knight',
  'merfolk',
  'rat',
  'sliver',
  'spirit',
  'squirrel',
  'vampire',
  'warrior',
  'wizard',
  'zombie',
];

const parse = (request: string) => parseQuery(request, OVERVIEW_SETS, CREATURE_TYPES);

type Row = readonly [request: string, expected: Partial<SearchQuery>];

function benchmark(topic: string, rows: readonly Row[]) {
  describe(`benchmark: ${topic}`, () => {
    it.each(rows)('reads "%s" as a player means it', (request, expected) => {
      expect(parse(request)).toMatchObject(expected);
    });
  });
}

benchmark('colours and guilds', [
  ['rote Kreaturen', { colors: 'R', colorMode: 'all', exactColors: false, types: ['creature'] }],
  ['red creatures', { colors: 'R', colorMode: 'all', types: ['creature'] }],
  ['weiße und blaue Flieger', { colors: 'WU', keywords: ['flying'] }],
  ['white and blue flyers', { colors: 'WU', keywords: ['flying'] }],
  ['schwarze Zauber', { colors: 'B', types: ['instant', 'sorcery'] }],
  ['blue instants', { colors: 'U', types: ['instant'] }],
  ['grüne Länder', { colors: 'G', types: ['land'] }],
  ['green ramp', { colors: 'G', roles: ['ramp'] }],
  ['mono-grün', { colors: 'G', exactColors: true, colorMode: 'exact' }],
  ['mono black creatures', { colors: 'B', exactColors: true, colorMode: 'exact' }],
  ['Izzet', { colors: 'UR', colorMode: 'within', exactColors: false }],
  ['Golgari Friedhof-Synergie', { colors: 'BG', colorMode: 'within', synergies: ['graveyard'] }],
  ['Boros aggro', { colors: 'WR', colorMode: 'within', archetype: 'aggro' }],
  ['Dimir Kontrolle', { colors: 'UB', colorMode: 'within', archetype: 'control' }],
  ['Simic ramp', { colors: 'UG', colorMode: 'within', roles: ['ramp'] }],
  ['Orzhov Lebensgewinn', { colors: 'WB', colorMode: 'within', synergies: ['lifegain'] }],
  [
    'Gruul Kreaturen mit Trampelschaden',
    { colors: 'RG', colorMode: 'within', types: ['creature'], keywords: ['trample'] },
  ],
  ['farblose Artefakte', { colors: '', exactColors: true, types: ['artifact'] }],
  ['colorless artifacts', { colors: '', exactColors: true, types: ['artifact'] }],
]);

benchmark('types and creature types', [
  ['Kreaturen', { types: ['creature'], creatureTypes: [] }],
  ['Spontanzauber und Hexereien', { types: ['instant', 'sorcery'] }],
  ['enchantments', { types: ['enchantment'] }],
  ['Planeswalker', { types: ['planeswalker'] }],
  ['Elfen', { creatureTypes: ['elf'], tribes: [], unknown: [] }],
  ['elves', { creatureTypes: ['elf'], unknown: [] }],
  ['Zombies in Schwarz', { colors: 'B', creatureTypes: ['zombie'], sets: [] }],
  ['black zombies', { colors: 'B', creatureTypes: ['zombie'] }],
  ['Drachen', { creatureTypes: ['dragon'] }],
  ['Late-Game Drachen', { minMana: 5, creatureTypes: ['dragon'] }],
  ['Vampire', { creatureTypes: ['vampire'] }],
  ['Goblins mit Eile', { creatureTypes: ['goblin'], keywords: ['haste'] }],
  ['Engel mit Lebensverknüpfung', { creatureTypes: ['angel'], keywords: ['lifelink'] }],
  ['angels with lifelink', { creatureTypes: ['angel'], keywords: ['lifelink'] }],
  ['Meervolk', { creatureTypes: ['merfolk'] }],
  ['Merfolk', { creatureTypes: ['merfolk'] }],
  ['Dinosaurier', { creatureTypes: ['dinosaur'] }],
  ['dinosaurs with trample', { creatureTypes: ['dinosaur'], keywords: ['trample'] }],
  ['Ratten', { creatureTypes: ['rat'] }],
  ['Eichhörnchen', { creatureTypes: ['squirrel'] }],
  ['squirrels', { creatureTypes: ['squirrel'] }],
  ['Zauberer', { creatureTypes: ['wizard'], types: [] }],
  ['wizards', { creatureTypes: ['wizard'] }],
  ['Ritter', { creatureTypes: ['knight'] }],
  ['Katzen', { creatureTypes: ['cat'] }],
  ['Menschen', { creatureTypes: ['human'] }],
  ['Feen mit Aufblitzen', { creatureTypes: ['faerie'], keywords: ['flash'] }],
  ['Slivers', { creatureTypes: ['sliver'] }],
  ['Lightning Bolt', { creatureTypes: [], unknown: ['lightning', 'bolt'] }],
]);

benchmark('mana value', [
  ['Kreaturen bis 3 Mana', { minMana: null, maxMana: 3 }],
  ['creatures under 3 mana', { minMana: null, maxMana: 2 }],
  ['höchstens 2 Mana', { maxMana: 2 }],
  ['3 mana or less', { minMana: null, maxMana: 3 }],
  ['2-drops', { minMana: 2, maxMana: 2 }],
  ['1-drops', { minMana: 1, maxMana: 1 }],
  ['4 Mana Kreatur', { minMana: 4, maxMana: 4, types: ['creature'] }],
  ['ab 4 Mana', { minMana: 4, maxMana: null }],
  ['at least 5 mana', { minMana: 5, maxMana: null }],
  ['mehr als 4 Mana', { minMana: 5, maxMana: null }],
  ['zwischen 2 und 4 Mana', { minMana: 2, maxMana: 4 }],
  ['2 bis 4 Mana', { minMana: 2, maxMana: 4 }],
  ['2-4 Mana', { minMana: 2, maxMana: 4 }],
  ['2 to 4 mana', { minMana: 2, maxMana: 4 }],
  ['between 2 and 4 mana', { minMana: 2, maxMana: 4 }],
  ['Finisher 6 Mana', { minMana: 6 }],
  ['Late Game ab 7 Mana', { minMana: 7 }],
  ['5 mana dragons', { minMana: 5, maxMana: 5, creatureTypes: ['dragon'] }],
]);

benchmark('price', [
  ['Removal unter 2 €', { maxPrice: 2, roles: ['removal'] }],
  ['Karten bis 1,50 Euro', { maxPrice: 1.5 }],
  ['Karten unter 1 Euro', { maxPrice: 1 }],
  ['cards under 3 eur', { maxPrice: 3 }],
  ['Removal unter 50 Cent', { maxPrice: 0.5, roles: ['removal'] }],
  ['cards under $3', { maxPrice: null }],
  ['günstige Kreaturen', { sort: 'value-asc', types: ['creature'], maxPrice: null }],
  ['cheap creatures', { sort: 'value-asc', types: ['creature'] }],
  ['teure Planeswalker', { sort: 'value-desc', types: ['planeswalker'] }],
  ['expensive lands', { sort: 'value-desc', types: ['land'] }],
]);

benchmark('keywords', [
  ['Kreaturen mit Fliegen', { types: ['creature'], keywords: ['flying'] }],
  ['fliegende Kreaturen', { types: ['creature'], keywords: ['flying'] }],
  ['creatures with flying', { types: ['creature'], keywords: ['flying'] }],
  ['Flieger', { keywords: ['flying'] }],
  ['Eile', { keywords: ['haste'] }],
  ['haste creatures', { types: ['creature'], keywords: ['haste'] }],
  ['Trampelschaden', { keywords: ['trample'] }],
  ['Todesberührung', { keywords: ['deathtouch'] }],
  ['deathtouch', { keywords: ['deathtouch'] }],
  ['Lebensverknüpfung', { keywords: ['lifelink'] }],
  ['Erstschlag und Wachsamkeit', { keywords: ['vigilance', 'first-strike'] }],
  ['Aufblitzen', { keywords: ['flash'] }],
  ['flash creatures', { types: ['creature'], keywords: ['flash'] }],
  ['fluchsichere Kreaturen', { types: ['creature'], keywords: ['hexproof'] }],
  ['hexproof', { keywords: ['hexproof'] }],
  ['unzerstörbare Artefakte', { types: ['artifact'], keywords: ['indestructible'] }],
  ['menace', { keywords: ['menace'] }],
  ['Reichweite', { keywords: ['reach'] }],
  ['Bravour', { keywords: ['prowess'] }],
  ['Verteidiger', { keywords: ['defender'] }],
]);

benchmark('synergies and tribes', [
  ['Synergie mit Artefakten', { synergies: ['artifacts'], types: [] }],
  ['artifact synergy', { synergies: ['artifacts'], types: [] }],
  ['Lebensgewinn', { synergies: ['lifegain'] }],
  ['lifegain', { synergies: ['lifegain'] }],
  ['token makers', { synergies: ['tokens'] }],
  ['Spielsteinerzeuger', { synergies: ['tokens'] }],
  ['synergy with tokens and sacrifice', { synergies: ['tokens', 'sacrifice'] }],
  ['cards that care about graveyards', { synergies: ['graveyard'] }],
  ['Friedhof-Synergie', { synergies: ['graveyard'] }],
  ['Synergie mit +1/+1-Marken', { synergies: ['counters'] }],
  ['Synergie mit Spontanzaubern und Hexereien', { synergies: ['spells'], types: [] }],
  ['Synergie mit Elfen', { tribes: [['elf']], creatureTypes: [] }],
  ['synergy with Elves', { tribes: [['elf']], creatureTypes: [] }],
  ['elf synergy', { tribes: [['elf']], creatureTypes: [] }],
  ['Elfen-Synergie', { tribes: [['elf']], creatureTypes: [] }],
  ['synergiert mit Elementarwesen', { tribes: [['elemental']], creatureTypes: [] }],
  ['cards that care about creatures you control', { archetype: null }],
  ['creatures you control synergy', { archetype: null }],
]);

benchmark('answers', [
  ['Konter gegen Flieger', { answers: ['flying'], roles: [] }],
  ['answers to flyers', { answers: ['flying'] }],
  ['entfernt Fäulnis', { answers: ['blight'] }],
  ['removes blight', { answers: ['blight'] }],
  ['gegen Artefakte', { answers: ['artifacts'], types: [] }],
  ['destroys artifacts', { answers: ['artifacts'], types: [] }],
  ['zerstört Verzauberungen', { answers: ['enchantments'], types: [] }],
  ['hate against graveyards', { answers: ['graveyard'] }],
  ['Karten gegen Spielsteine', { answers: ['tokens'] }],
  ['removal gegen Flieger', { answers: ['flying'], roles: [] }],
]);

benchmark('roles', [
  ['Removal', { roles: ['removal'] }],
  ['Entfernung', { roles: ['removal'] }],
  ['Edikte', { roles: ['removal'] }],
  ['edict effects', { roles: ['removal'] }],
  ['schwarzes Removal', { colors: 'B', roles: ['removal'] }],
  ['Konter', { roles: ['counterspell'], answers: [] }],
  ['Counterspell', { roles: ['counterspell'] }],
  ['Gegenzauber', { roles: ['counterspell'] }],
  ['blue counterspells', { colors: 'U', roles: ['counterspell'] }],
  ['Wipe', { roles: ['wipe'] }],
  ['Wipes', { roles: ['wipe'] }],
  ['Boardwipe', { roles: ['wipe'] }],
  ['Brettfeger', { roles: ['wipe'] }],
  ['Tutor', { roles: ['tutor'] }],
  ['Tutoren', { roles: ['tutor'] }],
  ['Suchzauber', { roles: ['tutor'] }],
  ['mana dorks', { roles: ['ramp'], types: ['creature'] }],
  ['Manabeschleunigung', { roles: ['ramp'] }],
  ['Karten zum Rampen', { roles: ['ramp'] }],
  ['card draw', { roles: ['draw'] }],
  ['Kartenziehen', { roles: ['draw'] }],
  ['Burn', { roles: ['burn'] }],
  ['Direktschaden', { roles: ['burn'] }],
]);

benchmark('archetypes and game phase', [
  ['Aggro', { archetype: 'aggro' }],
  ['aggressive creatures', { archetype: 'aggro', types: ['creature'] }],
  ['Control', { archetype: 'control' }],
  ['Kontroll-Deck', { archetype: 'control', unknown: [] }],
  ['Midrange', { archetype: 'midrange' }],
  ['Kreaturen die Kontrolle übernehmen', { archetype: null }],
  ['gain control', { archetype: null }],
  ['Late Game', { minMana: 5, maxMana: null }],
  ['Spätspiel', { minMana: 5 }],
  ['Bomben', { minMana: 5 }],
  ['Finisher', { minMana: 5 }],
  ['high mana value', { minMana: 5 }],
  ['Early Game Kreaturen', { maxMana: 2, types: ['creature'] }],
  ['Control Finisher', { archetype: 'control', minMana: 5 }],
  ['Aggro 1-drops', { archetype: 'aggro', minMana: 1, maxMana: 1 }],
  ['starke Kreaturen', { sort: 'played', types: ['creature'] }],
  ['strong creatures', { sort: 'played', types: ['creature'] }],
  ['Kreaturen mit hoher Stärke', { sort: null, types: ['creature'] }],
]);

benchmark('sets', [
  ['Karten aus Bloomburrow', { sets: ['blb'] }],
  ['Bloomburrow creatures', { sets: ['blb'], types: ['creature'] }],
  ['Bloomburrow Kreaturen', { sets: ['blb'], types: ['creature'] }],
  ['Bloomburrow removal', { sets: ['blb'], roles: ['removal'] }],
  ['Zendikar lands', { sets: ['zen'], types: ['land'] }],
  ['Kaladesh artifacts', { sets: ['kld'], types: ['artifact'] }],
  ['Theros enchantments', { sets: ['ths'], types: ['enchantment'] }],
  ['Foundations Kreaturen', { sets: ['fdn'], types: ['creature'] }],
  ['Dominaria Kreaturen', { sets: ['dom'], types: ['creature'] }],
  ['Uneasy Alliance', { sets: [] }],
  ['Scourge of Valkas', { sets: [] }],
  ['Dark Ritual', { sets: [] }],
  ['Visions of Beyond', { sets: [] }],
  ['Day of Judgment', { sets: [] }],
  ['Crimson Vow removal', { sets: ['vow'], roles: ['removal'] }],
  ['Midnight Hunt creatures', { sets: ['mid'], types: ['creature'] }],
  ['Neon Dynasty', { sets: ['neo'] }],
  ['Lord of the Rings creatures', { sets: ['ltr'], types: ['creature'] }],
  ['Spider-Man Kreaturen', { sets: ['spm'], types: ['creature'] }],
  ['dragons from Tarkir Dragonstorm', { sets: ['tdm'] }],
  ['Tarkir Dragonstorm dragons', { sets: ['tdm'] }],
  ['Modern Horizons Kreaturen bis 3 Mana', { sets: ['mh1'], maxMana: 3, unknown: [] }],
  ['Kreaturen aus Modern Horizons bis 2 Mana', { sets: ['mh1'], maxMana: 2 }],
  ['2-drops aus Modern Horizons', { sets: ['mh1'], minMana: 2, maxMana: 2 }],
  ['creatures from Modern Horizons with 3 mana', { sets: ['mh1'], minMana: 3, maxMana: 3 }],
  ['Modern Horizons 3 Kreaturen', { sets: ['mh3'], types: ['creature'] }],
  ['MH3 Kreaturen bis 3 Mana', { sets: ['mh3'], maxMana: 3 }],
  ['Kreaturen aus FRA', { sets: ['fra'], types: ['creature'] }],
  ['Karten aus ONE', { sets: ['one'] }],
  ['ONE drop creatures', { sets: [] }],
  ['ZEIG MIR ROTE KREATUREN', { colors: 'R', types: ['creature'], sets: [] }],
  ['ALL CARDS WITH FLYING', { sets: [], keywords: ['flying'] }],
  ['Duskmourn', { sets: ['dsk'] }],
  ['Kreaturen aus Duskmourn', { sets: ['dsk'], types: ['creature'] }],
  ['red creatures from Innistrad', { sets: ['isd'], colors: 'R', unknown: [] }],
  ['Elfen aus Lorwyn', { sets: ['lrw'], creatureTypes: ['elf'] }],
  ['Karten aus Avatar', { sets: ['tla'], creatureTypes: [] }],
  ['Battle for Zendikar', { sets: ['bfz'], types: [] }],
  ['Wilds of Eldraine', { sets: ['woe'] }],
  ['Edge of Eternities Kreaturen', { sets: ['eoe'], types: ['creature'] }],
  ['Final Fantasy', { sets: ['fin'] }],
]);

benchmark('combinations', [
  [
    'günstige rote Kreaturen mit Eile',
    {
      colors: 'R',
      types: ['creature'],
      keywords: ['haste'],
      sort: 'value-asc',
      unknown: [],
    },
  ],
  [
    'cheap red creatures with haste',
    { colors: 'R', types: ['creature'], keywords: ['haste'], sort: 'value-asc' },
  ],
  ['blaue Konter unter 1 €', { colors: 'U', roles: ['counterspell'], maxPrice: 1 }],
  ['schwarze Removal-Zauber bis 2 Mana', { colors: 'B', roles: ['removal'], maxMana: 2 }],
  [
    'green creatures with trample under 2 eur',
    { colors: 'G', types: ['creature'], keywords: ['trample'], maxPrice: 2 },
  ],
  [
    'Izzet Spells mit Bravour',
    {
      colors: 'UR',
      colorMode: 'within',
      types: ['instant', 'sorcery'],
      keywords: ['prowess'],
    },
  ],
  ['Azorius Control', { colors: 'WU', colorMode: 'within', archetype: 'control' }],
  [
    'white flyers from Bloomburrow under 3 mana',
    { colors: 'W', keywords: ['flying'], sets: ['blb'], maxMana: 2 },
  ],
  ['rote Drachen mit Fliegen', { colors: 'R', creatureTypes: ['dragon'], keywords: ['flying'] }],
  ['grüne Elfen bis 2 Mana', { colors: 'G', creatureTypes: ['elf'], maxMana: 2 }],
  ['black zombies under 1 eur', { colors: 'B', creatureTypes: ['zombie'], maxPrice: 1 }],
  ['Gruul aggro 2-drops', { colors: 'RG', archetype: 'aggro', minMana: 2, maxMana: 2 }],
  ['mono red burn under 1 €', { colors: 'R', exactColors: true, roles: ['burn'], maxPrice: 1 }],
  [
    'Selesnya Kreaturen mit Wachsamkeit ab 3 Mana',
    { colors: 'WG', types: ['creature'], keywords: ['vigilance'], minMana: 3 },
  ],
  ['Zombies aus Innistrad', { sets: ['isd'], creatureTypes: ['zombie'] }],
  ['günstiges Removal in Schwarz', { colors: 'B', roles: ['removal'], sort: 'value-asc' }],
]);

benchmark('names that are filter words', [
  ['Flash', { keywords: ['flash'], unknown: [] }],
  ['Lifelink', { keywords: ['lifelink'], unknown: [] }],
  ['Vigilance', { keywords: ['vigilance'], unknown: [] }],
  ['Wachsamkeit', { keywords: ['vigilance'], unknown: [] }],
  ['Aufblitzen', { keywords: ['flash'], unknown: [] }],
  ['Counterspell', { roles: ['counterspell'], unknown: [] }],
]);

// Exact card names, German and English: the search looks for the card, either because the
// request names no filter at all or because nameWins lets the name win over the filters it
// reads in some of the words ("Serra Angel" names the creature type angel).
const CARD_NAMES = [
  'Lightning Bolt',
  'Blitzschlag',
  'Dark Ritual',
  'Schwarzer Ritus',
  'Control Magic',
  'Wrath of God',
  'Zorn Gottes',
  'Serra Angel',
  'Serra-Engel',
  'Shivan Dragon',
  'Shivan-Drache',
  'Goblin Guide',
  'Llanowar Elves',
  'Llanowarelfen',
  'Birds of Paradise',
  'Swords to Plowshares',
  'Schwerter zu Pflugscharen',
  'Elvish Mystic',
  'Sol Ring',
  'Opt',
  'Fatal Push',
  'Day of Judgment',
  'Uneasy Alliance',
  'Scourge of Valkas',
  'Visions of Beyond',
  'Zendikar Resurgent',
  'Sheoldred, the Apocalypse',
];
const NAMES: ReadonlySet<string> = new Set(CARD_NAMES.map((name) => normalizeForSearch(name)));

describe('benchmark: name searches', () => {
  it.each(CARD_NAMES)('searches the card name "%s" as a name', (name) => {
    const query = parse(name);
    expect(!understood(query) || nameWins(query, name, NAMES)).toBe(true);
  });
});
