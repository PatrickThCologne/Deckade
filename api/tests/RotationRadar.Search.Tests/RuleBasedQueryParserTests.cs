using RotationRadar.Search.Cards;
using RotationRadar.Search.Queries;
using Xunit;

namespace RotationRadar.Search.Tests;

public sealed class RuleBasedQueryParserTests
{
    [Theory]
    [InlineData("grüne Kreaturen mit Trample", "G")]
    [InlineData("green creatures with trample", "G")]
    [InlineData("weiße und blaue Flieger", "WU")]
    [InlineData("rote Hexerei", "R")]
    public void ReadsColorsInBothLanguages(string query, string colors)
    {
        var filter = RuleBasedQueryParser.Parse(query).Filter;

        Assert.Equal(colors, filter.Colors);
        Assert.False(filter.ExactColors);
    }

    [Theory]
    [InlineData("Karten vor der Rotation")]
    [InlineData("a hundred tokens")]
    [InlineData("Weißwurst")]
    public void ColorWordsInsideOtherWordsAreNoColors(string query)
    {
        Assert.Equal("", RuleBasedQueryParser.Parse(query).Filter.Colors);
    }

    [Fact]
    public void TypeWordsInsideOtherWordsAreNoTypes()
    {
        Assert.Empty(RuleBasedQueryParser.Parse("Kreaturtypen und Landscape").Filter.Types);
    }

    [Theory]
    [InlineData("mono grüne Kreaturen", "G")]
    [InlineData("Selesnya Lebensgewinn", "WG")]
    [InlineData("izzet spells", "UR")]
    public void MonoAndGuildNamesMeanExactlyTheseColors(string query, string colors)
    {
        var filter = RuleBasedQueryParser.Parse(query).Filter;

        Assert.Equal(colors, filter.Colors);
        Assert.True(filter.ExactColors);
    }

    [Fact]
    public void ColorlessMeansExactlyNoColor()
    {
        var filter = RuleBasedQueryParser.Parse("farblose Artefakte").Filter;

        Assert.Equal("", filter.Colors);
        Assert.True(filter.ExactColors);
        Assert.Equal(CardTypes.Artifact, Assert.Single(filter.Types));
    }

    [Theory]
    [InlineData("Kreaturen bis 3 Mana", null, 3.0)]
    [InlineData("creatures under 3 mana", null, 2.0)]
    [InlineData("3 mana or less", null, 3.0)]
    [InlineData("Low-Mana Removal", null, 2.0)]
    [InlineData("2-drops", 2.0, 2.0)]
    [InlineData("4 Mana Kreatur", 4.0, 4.0)]
    public void ReadsManaValueLimits(string query, double? min, double? max)
    {
        var filter = RuleBasedQueryParser.Parse(query).Filter;

        Assert.Equal(min, filter.MinManaValue);
        Assert.Equal(max, filter.MaxManaValue);
    }

    [Theory]
    [InlineData("Removal unter 2 €", 2.0)]
    [InlineData("Karten bis 1,50 Euro", 1.5)]
    [InlineData("cards under 3 eur", 3.0)]
    public void ReadsPriceLimitsInEuro(string query, double price)
    {
        Assert.Equal((decimal)price, RuleBasedQueryParser.Parse(query).Filter.MaxPriceEur);
    }

    [Fact]
    public void DollarPricesAreNotReadAsEuro()
    {
        Assert.Null(RuleBasedQueryParser.Parse("cards under $3").Filter.MaxPriceEur);
    }

    [Fact]
    public void TheWholeRequestStaysTheSemanticQuery()
    {
        var interpretation = RuleBasedQueryParser.Parse("  Karten, die Kreaturen zurückholen  ");

        Assert.Equal("Karten, die Kreaturen zurückholen", interpretation.SemanticQuery);
        Assert.Equal(InterpretationSource.Rules, interpretation.Source);
    }
}
