using RotationRadar.Search.Cards;
using RotationRadar.Search.Queries;
using Xunit;

namespace RotationRadar.Search.Tests;

public sealed class CardFilterTests
{
    private static SearchCard Card(string colors, double manaValue, decimal? price, params string[] types) =>
        new()
        {
            OracleId = "o",
            Name = "Test",
            ManaCost = "",
            ManaValue = manaValue,
            Colors = colors,
            TypeLine = string.Join(' ', types),
            Types = types,
            Text = "",
            PriceEur = price,
            ScryfallUrl = "https://scryfall.com/card/x/1",
            SetCode = "x",
            SetName = "X",
        };

    [Fact]
    public void SanitizedDropsWhatAModelMayHaveMadeUp()
    {
        var filter = new CardFilter
        {
            Colors = "gxw",
            MinManaValue = 5,
            MaxManaValue = 2,
            Types = ["Creature", "wizard", "creature"],
            MaxPriceEur = -1,
        }.Sanitized();

        Assert.Equal("WG", filter.Colors);
        Assert.Equal(2.0, filter.MinManaValue);
        Assert.Equal(5.0, filter.MaxManaValue);
        Assert.Equal(CardTypes.Creature, Assert.Single(filter.Types));
        Assert.Null(filter.MaxPriceEur);
    }

    [Fact]
    public void SanitizedDropsImpossibleManaValues()
    {
        var filter = new CardFilter { MinManaValue = -1, MaxManaValue = 99 }.Sanitized();

        Assert.True(filter.IsEmpty);
    }

    [Fact]
    public void ColorsAreAMinimumUnlessExact()
    {
        var golgari = Card("BG", 3, 1m, CardTypes.Creature);

        Assert.True(new CardFilter { Colors = "G" }.Matches(golgari));
        Assert.False(new CardFilter { Colors = "G", ExactColors = true }.Matches(golgari));
        Assert.True(new CardFilter { Colors = "BG", ExactColors = true }.Matches(golgari));
    }

    [Fact]
    public void ExactWithoutColorsMeansColorless()
    {
        var colorless = new CardFilter { ExactColors = true };

        Assert.True(colorless.Matches(Card("", 2, null, CardTypes.Artifact)));
        Assert.False(colorless.Matches(Card("U", 2, null, CardTypes.Artifact)));
    }

    [Fact]
    public void ManaValueTypeAndPriceAreHardLimits()
    {
        var filter = new CardFilter
        {
            MaxManaValue = 3,
            Types = [CardTypes.Instant, CardTypes.Sorcery],
            MaxPriceEur = 2m,
        };

        Assert.True(filter.Matches(Card("R", 1, 0.5m, CardTypes.Instant)));
        Assert.False(filter.Matches(Card("R", 4, 0.5m, CardTypes.Instant)));
        Assert.False(filter.Matches(Card("R", 1, 0.5m, CardTypes.Creature)));
        Assert.False(filter.Matches(Card("R", 1, 5m, CardTypes.Instant)));
        // Without a known price the card cannot be shown as cheap
        Assert.False(filter.Matches(Card("R", 1, null, CardTypes.Instant)));
    }

    [Theory]
    [InlineData("Legendary Artifact Creature — Golem // Land", "artifact,creature,land")]
    [InlineData("Tribal Instant — Faerie", "kindred,instant")]
    [InlineData("Basic Land — Forest", "land")]
    public void TypesComeFromTheTypeLineBeforeTheDash(string typeLine, string expected)
    {
        Assert.Equal(expected.Split(','), CardTypes.FromTypeLine(typeLine));
    }

    [Fact]
    public void ColorNamesFromAModelBecomeWubrgLetters()
    {
        Assert.Equal("UG", ManaColors.FromNames(["green", "Blau", "purple"]));
    }
}
