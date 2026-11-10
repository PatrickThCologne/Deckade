namespace RotationRadar.Search.Cards;

/// <summary>A card as printed in one set, the shape it has in the pipeline snapshot.</summary>
public sealed record CardPrinting
{
    public required string SetCode { get; init; }
    public required string SetName { get; init; }
    public required DateOnly ReleasedAt { get; init; }
    public required string OracleId { get; init; }
    public required string Name { get; init; }
    public required string Colors { get; init; }
    public required string ManaCost { get; init; }
    public required double ManaValue { get; init; }
    public required string TypeLine { get; init; }
    public required string Text { get; init; }
    public decimal? PriceEur { get; init; }
    public string? ImageUrl { get; init; }
    public required string ScryfallUrl { get; init; }
    public string? NameDe { get; init; }
    public string? TextDe { get; init; }
    public string? ImageUrlDe { get; init; }
    public string? ScryfallUrlDe { get; init; }
}

public static class CardCatalog
{
    /// <summary>
    /// One entry per Oracle card, the same rules as the website's card list
    /// (web/src/lib/cards/catalog.ts): the newest printing is shown, German texts come from
    /// the newest German printing, the price is the cheapest of all printings.
    /// </summary>
    public static IReadOnlyList<SearchCard> Build(IEnumerable<CardPrinting> printings)
    {
        ArgumentNullException.ThrowIfNull(printings);
        return printings
            .GroupBy(p => p.OracleId, StringComparer.Ordinal)
            .Select(ToCard)
            .OrderBy(c => c.Name, StringComparer.Ordinal)
            .ToList();
    }

    private static SearchCard ToCard(IEnumerable<CardPrinting> group)
    {
        var newestFirst = group
            .OrderByDescending(p => p.ReleasedAt)
            .ThenBy(p => p.SetCode, StringComparer.Ordinal)
            .ToList();
        var shown = newestFirst[0];
        var german = newestFirst.FirstOrDefault(p => p.NameDe is not null);
        return new SearchCard
        {
            OracleId = shown.OracleId,
            Name = shown.Name,
            NameDe = german?.NameDe,
            ManaCost = shown.ManaCost,
            ManaValue = shown.ManaValue,
            Colors = ManaColors.Normalize(shown.Colors),
            TypeLine = shown.TypeLine,
            Types = CardTypes.FromTypeLine(shown.TypeLine),
            Text = shown.Text,
            TextDe = german?.TextDe,
            PriceEur = newestFirst.Min(p => p.PriceEur),
            ImageUrl = shown.ImageUrl,
            ImageUrlDe = german?.ImageUrlDe,
            ScryfallUrl = shown.ScryfallUrl,
            ScryfallUrlDe = german?.ScryfallUrlDe,
            SetCode = shown.SetCode,
            SetName = shown.SetName,
        };
    }
}
