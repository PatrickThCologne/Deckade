import { describe, expect, it } from 'vitest';
import { cardRoles, ROLES } from '../src/lib/search/roles';

describe('cardRoles', () => {
  it('knows the roles in a fixed order', () => {
    expect(ROLES).toEqual(['ramp', 'removal', 'counterspell', 'wipe', 'draw', 'burn']);
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

  it('leaves out reminder text and the card name', () => {
    expect(
      cardRoles('Flying (This creature deals 3 damage to any target.)', 'Card', false),
    ).toEqual([]);
    const name = 'Draw Two Cards';
    expect(cardRoles(`When ${name} enters, you gain 2 life.`, name, false)).toEqual([]);
  });
});
