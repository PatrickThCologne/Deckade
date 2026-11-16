import { describe, expect, it } from 'vitest';
import { cardRoles, ROLES } from '../src/lib/search/roles';

describe('cardRoles', () => {
  it('knows the roles in a fixed order', () => {
    expect(ROLES).toEqual(['ramp', 'removal', 'counterspell', 'wipe', 'draw', 'burn', 'tutor']);
  });

  it.each([
    ['{T}: Add {G}.'],
    ['Flying\n{T}: Add one mana of any color.'],
    ['{T}: Add {C}{C}.'],
    [
      'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    ],
    ['You may play an additional land on each of your turns.'],
  ])('reads ramp in "%s"', (text) => {
    expect(cardRoles(text, 'Card', false)).toEqual(['ramp']);
  });

  it('takes the mana ability of a land for no ramp', () => {
    expect(cardRoles('{T}: Add {G}.', 'Forest', true)).toEqual([]);
  });

  it('takes a land put into the hand for no ramp', () => {
    expect(
      cardRoles(
        'Search your library for a basic land card, reveal it, put it into your hand, then shuffle.',
        'Card',
        false,
      ),
    ).toEqual([]);
  });

  it.each([
    ['Destroy target creature.', 'removal'],
    ['Exile target nonland permanent.', 'removal'],
    ['Flame Slash deals 4 damage to target creature.', 'removal'],
    ['Counter target spell.', 'counterspell'],
    ['Counter target noncreature spell.', 'counterspell'],
    ["Destroy all creatures. They can't be regenerated.", 'wipe'],
    ['Exile all nonland permanents.', 'wipe'],
    ['All creatures get -3/-3 until end of turn.', 'wipe'],
    ['Anger of the Gods deals 3 damage to each creature.', 'wipe'],
    ['Draw two cards.', 'draw'],
    ['Scry 2, then draw three cards.', 'draw'],
    ['Draw X cards.', 'draw'],
    ['Lightning Bolt deals 3 damage to any target.', 'burn'],
    ['Whenever you cast a spell, this deals 2 damage to each opponent.', 'burn'],
    ['Banefire deals X damage to target player or planeswalker.', 'burn'],
  ])('reads "%s" as %s', (text, role) => {
    expect(cardRoles(text, 'Card', false)).toEqual([role]);
  });

  it('takes drawing a single card for no draw', () => {
    expect(cardRoles('Draw a card.', 'Card', false)).toEqual([]);
  });

  it('lists several roles in the order of ROLES', () => {
    expect(cardRoles('Draw two cards.\nDestroy target creature.', 'Card', false)).toEqual([
      'removal',
      'draw',
    ]);
  });

  // Real texts: the faces of a double-faced card are separated by a blank line in the data
  it.each([
    [
      'Sink into Stupor // Soporific Springs',
      "Return target spell or nonland permanent an opponent controls to its owner's hand.\n\nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {U}.",
    ],
    [
      'Valakut Awakening // Valakut Stoneforge',
      'Put any number of cards from your hand on the bottom of your library, then draw that many cards plus one.\n\nThis land enters tapped.\n{T}: Add {R}.',
    ],
  ])('takes the mana of the land face of "%s" for no ramp', (name, text) => {
    expect(cardRoles(text, name, false)).not.toContain('ramp');
  });

  it.each([
    [
      "Exile target creature you control, then return it to the battlefield under its owner's control.",
    ],
    ['Exile target creature card from a graveyard.'],
    ['Target creature gets -2/-0 until end of turn.'],
  ])('reads no removal in "%s"', (text) => {
    expect(cardRoles(text, 'Card', false)).not.toContain('removal');
  });

  it('reads no wipe in a toughness that stays', () => {
    expect(
      cardRoles('Creatures your opponents control get -1/-0 until end of turn.', 'Card', false),
    ).not.toContain('wipe');
  });

  it('takes an opponent drawing for no draw', () => {
    expect(cardRoles('Target opponent draws two cards.', 'Card', false)).not.toContain('draw');
  });

  it.each([
    ['Target creature gets -3/-3 until end of turn.', 'removal'],
    ['Destroy target attacking or blocking creature.', 'removal'],
    ['Destroy target green or white creature.', 'removal'],
    ['Target player sacrifices a creature.', 'removal'],
    ['Each opponent sacrifices a creature.', 'removal'],
    [
      'Create two 1/1 colorless Eldrazi Spawn creature tokens with "Sacrifice this token: Add {C}."',
      'ramp',
    ],
    ['Counter target enchantment, instant, or sorcery spell.', 'counterspell'],
  ])(
    'reads shrinking, longer targets, edicts, mana tokens and type lists: "%s" as %s',
    (text, role) => {
      expect(cardRoles(text, 'Card', false)).toEqual([role]);
    },
  );

  // Real texts, from the generated card data
  it.each([
    [
      'Demonic Tutor',
      'Search your library for a card, put that card into your hand, then shuffle.',
    ],
    [
      "Eladamri's Call",
      'Search your library for a creature card, reveal that card, put it into your hand, then shuffle.',
    ],
    [
      'Solve the Equation',
      'Search your library for an instant or sorcery card, reveal it, put it into your hand, then shuffle.',
    ],
    [
      'Goblin Matron',
      'When this creature enters, you may search your library for a Goblin card, reveal that card, put it into your hand, then shuffle.',
    ],
    [
      'Card',
      'Search your library for a creature card with mana value 3 or less, put it onto the battlefield, then shuffle.',
    ],
    [
      'Chord of Calling',
      "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nSearch your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle.",
    ],
    // Oracle text; on top of the library is a tutor to players too
    [
      'Mystical Tutor',
      'Search your library for an instant or sorcery card, reveal it, then shuffle and put that card on top.',
    ],
  ])(
    'reads a search for a card into the hand or onto the battlefield as tutor: %s',
    (name, text) => {
      expect(cardRoles(text, name, false)).toEqual(['tutor']);
    },
  );

  it.each([
    [
      'Rampant Growth',
      'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
      ['ramp'],
    ],
    [
      'Farseek',
      'Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.',
      ['ramp'],
    ],
    [
      'Cultivate',
      'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.',
      ['ramp'],
    ],
    [
      'Sylvan Scrying',
      'Search your library for a land card, reveal it, put it into your hand, then shuffle.',
      [],
    ],
  ])('takes a search for a land for no tutor: %s', (name, text, roles) => {
    expect(cardRoles(text, name, false)).toEqual(roles);
  });

  it.each([
    [
      'Path to Exile',
      'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
    ],
    [
      "Assassin's Trophy",
      'Destroy target permanent an opponent controls. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.',
    ],
  ])('takes an opponent searching their library for no tutor: %s', (name, text) => {
    expect(cardRoles(text, name, false)).toEqual(['removal']);
  });

  it.each([
    ['Naturalize', 'Destroy target artifact or enchantment.'],
    ['Erase', 'Exile target enchantment.'],
    [
      'Ancient Grudge',
      'Destroy target artifact.\nFlashback {G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)',
    ],
  ])('takes an answer to artifacts or enchantments only for no removal: %s', (name, text) => {
    expect(cardRoles(text, name, false)).toEqual([]);
  });

  it.each([
    ['Mortify', 'Destroy target creature or enchantment.'],
    [
      'Drag to the Roots',
      'Delirium — This spell costs {2} less to cast as long as there are four or more card types among cards in your graveyard.\nDestroy target nonland permanent.',
    ],
  ])(
    'reads removal when a creature or any nonland permanent can be the target: %s',
    (name, text) => {
      expect(cardRoles(text, name, false)).toEqual(['removal']);
    },
  );

  it.each([
    [
      'Otherworldly Journey',
      "Exile target creature. At the beginning of the next end step, return that card to the battlefield under its owner's control with a +1/+1 counter on it.",
    ],
    [
      'Turn to Mist',
      "Exile target creature. Return that card to the battlefield under its owner's control at the beginning of the next end step.",
    ],
    [
      'Voidwalk',
      "Exile target creature. Return it to the battlefield under its owner's control at the beginning of the next end step.\nCipher (Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost.)",
    ],
    [
      'Flicker',
      "Exile target nontoken permanent, then return it to the battlefield under its owner's control.",
    ],
  ])('takes exiling any creature that comes back by itself for no removal: %s', (name, text) => {
    expect(cardRoles(text, name, false)).toEqual([]);
  });

  it.each([
    ['Card', 'Exile target creature.'],
    [
      'Swords to Plowshares',
      'Exile target creature. Its controller gains life equal to its power.',
    ],
    [
      'Fiend Hunter',
      "When this creature enters, you may exile another target creature.\nWhen this creature leaves the battlefield, return the exiled card to the battlefield under its owner's control.",
    ],
    [
      'Banishing Light',
      'When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.',
    ],
  ])('reads exile that lasts, or lasts as long as a permanent, as removal: %s', (name, text) => {
    expect(cardRoles(text, name, false)).toEqual(['removal']);
  });

  it.each([
    ['Fight to the Death', 'Destroy all blocking creatures and all blocked creatures.'],
    [
      'Battle-Scarred Goblin',
      'Whenever this creature becomes blocked, it deals 1 damage to each creature blocking it.',
    ],
    [
      "Trailblazer's Torch",
      'When this Equipment enters, you take the initiative.\nWhenever equipped creature becomes blocked, it deals 2 damage to each creature blocking it.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)',
    ],
    [
      'Mass Polymorph',
      'Exile all creatures you control, then reveal cards from the top of your library until you reveal that many creature cards. Put all creature cards revealed this way onto the battlefield, then shuffle the rest of the revealed cards into your library.',
    ],
    [
      'Ghostway',
      "Exile each creature you control. Return those cards to the battlefield under their owner's control at the beginning of the next end step.",
    ],
  ])('takes hitting only blocking, blocked or own creatures for no wipe: %s', (name, text) => {
    expect(cardRoles(text, name, false)).not.toContain('wipe');
  });

  it.each([
    ['Wrath of God', "Destroy all creatures. They can't be regenerated."],
    [
      'Massacre Wurm',
      'When this creature enters, creatures your opponents control get -2/-2 until end of turn.\nWhenever a creature an opponent controls dies, that player loses 2 life.',
    ],
    ['Card', 'All creatures your opponents control get -2/-2 until end of turn.'],
  ])('reads clearing every or every opposing creature as wipe: %s', (name, text) => {
    expect(cardRoles(text, name, false)).toEqual(['wipe']);
  });

  it.each([
    ['Card', 'Discard up to two cards, then draw that many cards.'],
    [
      'Kinetic Augur',
      "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nKinetic Augur's power is equal to the number of instant and sorcery cards in your graveyard.\nWhen this creature enters, discard up to two cards, then draw that many cards.",
    ],
  ])('takes rummaging for no draw: %s', (name, text) => {
    expect(cardRoles(text, name, false)).toEqual([]);
  });

  it('reads only the removal of a card that rummages in its other mode', () => {
    expect(
      cardRoles(
        'Choose one —\n• Cathartic Pyre deals 3 damage to target creature or planeswalker.\n• Discard up to two cards, then draw that many cards.',
        'Cathartic Pyre',
        false,
      ),
    ).toEqual(['removal']);
  });

  it('reads drawing two cards and then discarding one as draw', () => {
    expect(cardRoles('Draw two cards, then discard a card.', 'Catalog', false)).toEqual(['draw']);
  });

  it('leaves out reminder text and the card name', () => {
    expect(
      cardRoles('Flying (This creature deals 3 damage to any target.)', 'Card', false),
    ).toEqual([]);
    const name = 'Draw Two Cards';
    expect(cardRoles(`When ${name} enters, you gain 2 life.`, name, false)).toEqual([]);
  });
});
