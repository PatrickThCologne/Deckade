namespace RotationRadar.Search.Cards;

/// <summary>
/// One card as the search knows it: a single entry per Oracle card, shown with its newest
/// printing. Colors are the color identity in WUBRG order, as in the pipeline snapshot.
/// </summary>
public sealed record SearchCard
{
    public required string OracleId { get; init; }
    public required string Name { get; init; }
    public string? NameDe { get; init; }
    public required string ManaCost { get; init; }
    public required double ManaValue { get; init; }
    public required string Colors { get; init; }
    public required string TypeLine { get; init; }
    public required IReadOnlyList<string> Types { get; init; }
    public required string Text { get; init; }
    public string? TextDe { get; init; }
    /// <summary>Cheapest Cardmarket trend price over all printings, in euro.</summary>
    public decimal? PriceEur { get; init; }
    public string? ImageUrl { get; init; }
    public string? ImageUrlDe { get; init; }
    public required string ScryfallUrl { get; init; }
    public string? ScryfallUrlDe { get; init; }
    public required string SetCode { get; init; }
    public required string SetName { get; init; }
}
