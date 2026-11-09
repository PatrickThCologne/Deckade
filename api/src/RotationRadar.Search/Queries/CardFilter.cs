using RotationRadar.Search.Cards;

namespace RotationRadar.Search.Queries;

/// <summary>Hard filters taken from a search request. Everything else is left to the embeddings.</summary>
public sealed record CardFilter
{
    public static CardFilter None { get; } = new();

    /// <summary>Colors the card must have (WUBRG order).</summary>
    public string Colors { get; init; } = "";

    /// <summary>
    /// The card has exactly <see cref="Colors"/> and no others ("mono-green", "Selesnya").
    /// With empty colors this means colorless.
    /// </summary>
    public bool ExactColors { get; init; }

    public double? MinManaValue { get; init; }
    public double? MaxManaValue { get; init; }

    /// <summary>The card has at least one of these types.</summary>
    public IReadOnlyList<string> Types { get; init; } = [];

    public decimal? MaxPriceEur { get; init; }

    public bool IsEmpty =>
        Colors.Length == 0
        && !ExactColors
        && MinManaValue is null
        && MaxManaValue is null
        && Types.Count == 0
        && MaxPriceEur is null;

    /// <summary>Drops values a model may have made up: unknown colors and types, odd ranges.</summary>
    public CardFilter Sanitized()
    {
        var min = MinManaValue is >= 0 and <= 20 ? MinManaValue : null;
        var max = MaxManaValue is >= 0 and <= 20 ? MaxManaValue : null;
        if (min > max)
        {
            (min, max) = (max, min);
        }
        return this with
        {
            Colors = ManaColors.Normalize(Colors),
            MinManaValue = min,
            MaxManaValue = max,
            Types = Types.Select(t => t.ToLowerInvariant()).Where(CardTypes.IsKnown).Distinct().ToList(),
            MaxPriceEur = MaxPriceEur > 0 ? MaxPriceEur : null,
        };
    }

    public bool Matches(SearchCard card)
    {
        ArgumentNullException.ThrowIfNull(card);
        var colorsMatch = ExactColors
            ? card.Colors == Colors
            : Colors.All(card.Colors.Contains);
        return colorsMatch
            && (MinManaValue is null || card.ManaValue >= MinManaValue)
            && (MaxManaValue is null || card.ManaValue <= MaxManaValue)
            && (Types.Count == 0 || Types.Any(card.Types.Contains))
            && (MaxPriceEur is null || card.PriceEur <= MaxPriceEur);
    }
}
