using System.Globalization;
using System.Text.RegularExpressions;
using RotationRadar.Search.Cards;

namespace RotationRadar.Search.Queries;

/// <summary>
/// Reads the obvious filters from a German or English request with regular expressions:
/// colors, mana value, card types and a price limit. It runs without a model, so the search
/// still works when none is available, and it is deterministic, so it is easy to test.
/// The whole request stays the semantic query.
/// </summary>
public sealed partial class RuleBasedQueryParser : IQueryInterpreter
{
    // German adjectives take endings (grüne, grünen, grüner); "rot" must not match "Rotation".
    private static readonly (string Color, Regex Pattern)[] ColorWords =
    [
        ("W", WordRegex(@"wei(ß|ss)(e|en|er|es)?|white")),
        ("U", WordRegex(@"blau(e|en|er|es)?|blue")),
        ("B", WordRegex(@"schwarz(e|en|er|es)?|black")),
        ("R", WordRegex(@"rot(e|en|er|es)?|red")),
        ("G", WordRegex(@"gr(ü|ue)n(e|en|er|es)?|green")),
    ];

    // Two-color groups have fixed names in Magic; they mean exactly these two colors.
    private static readonly Dictionary<string, string> GuildColors = new(StringComparer.OrdinalIgnoreCase)
    {
        ["azorius"] = "WU",
        ["dimir"] = "UB",
        ["rakdos"] = "BR",
        ["gruul"] = "RG",
        ["selesnya"] = "WG",
        ["orzhov"] = "WB",
        ["izzet"] = "UR",
        ["golgari"] = "BG",
        ["boros"] = "WR",
        ["simic"] = "UG",
    };

    private static readonly (string Type, Regex Pattern)[] TypeWords =
    [
        (CardTypes.Creature, WordRegex(@"kreatur(en)?|creatures?")),
        (CardTypes.Instant, WordRegex(@"spontanzauber|instants?")),
        (CardTypes.Sorcery, WordRegex(@"hexerei(en)?|sorcery|sorceries")),
        (CardTypes.Enchantment, WordRegex(@"verzauberung(en)?|enchantments?")),
        (CardTypes.Artifact, WordRegex(@"artefakte?n?|artifacts?")),
        (CardTypes.Planeswalker, WordRegex(@"planeswalkers?")),
        (CardTypes.Land, WordRegex(@"l(ä|ae)nder|lands?|land")),
        (CardTypes.Battle, WordRegex(@"schlacht(en)?|battles?")),
    ];

    public Task<QueryInterpretation> InterpretAsync(string query, CancellationToken cancellationToken) =>
        Task.FromResult(Parse(query));

    public static QueryInterpretation Parse(string query)
    {
        ArgumentNullException.ThrowIfNull(query);
        var filter = ReadColors(query) with
        {
            Types = TypeWords.Where(t => t.Pattern.IsMatch(query)).Select(t => t.Type).ToList(),
            MaxPriceEur = ReadMaxPrice(query),
        };
        filter = ReadManaValue(query, filter);
        return new QueryInterpretation(filter.Sanitized(), query.Trim(), InterpretationSource.Rules);
    }

    private static CardFilter ReadColors(string query)
    {
        if (ColorlessRegex().IsMatch(query))
        {
            return new CardFilter { ExactColors = true };
        }
        var guild = GuildRegex().Match(query);
        if (guild.Success)
        {
            return new CardFilter { Colors = GuildColors[guild.Value], ExactColors = true };
        }
        var colors = string.Concat(ColorWords.Where(c => c.Pattern.IsMatch(query)).Select(c => c.Color));
        return new CardFilter { Colors = colors, ExactColors = colors.Length > 0 && MonoRegex().IsMatch(query) };
    }

    private static CardFilter ReadManaValue(string query, CardFilter filter)
    {
        if (LowManaRegex().IsMatch(query))
        {
            return filter with { MaxManaValue = 2 };
        }
        var atMost = AtMostManaRegex().Match(query);
        if (atMost.Success)
        {
            var value = Number(atMost.Groups["n"].Value);
            var below = atMost.Groups["below"].Success;
            return filter with { MaxManaValue = below ? value - 1 : value };
        }
        var drop = DropRegex().Match(query);
        var exact = drop.Success ? drop : ExactManaRegex().Match(query);
        if (exact.Success)
        {
            var value = Number(exact.Groups["n"].Value);
            return filter with { MinManaValue = value, MaxManaValue = value };
        }
        return filter;
    }

    private static decimal? ReadMaxPrice(string query)
    {
        var match = MaxPriceRegex().Match(query);
        return match.Success
            ? decimal.Parse(match.Groups["n"].Value.Replace(',', '.'), CultureInfo.InvariantCulture)
            : null;
    }

    private static double Number(string text) => double.Parse(text, CultureInfo.InvariantCulture);

    // The group makes both boundaries apply to every alternative, not only the first and last
    private static Regex WordRegex(string words) =>
        new($@"(?<![\p{{L}}])(?:{words})(?![\p{{L}}])", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    [GeneratedRegex(@"\b(farblos\w*|colorless)\b", RegexOptions.IgnoreCase)]
    private static partial Regex ColorlessRegex();

    [GeneratedRegex(@"\b(azorius|dimir|rakdos|gruul|selesnya|orzhov|izzet|golgari|boros|simic)\b", RegexOptions.IgnoreCase)]
    private static partial Regex GuildRegex();

    [GeneratedRegex(@"\b(mono|nur|only|rein)\b", RegexOptions.IgnoreCase)]
    private static partial Regex MonoRegex();

    // "Low-Mana", "lowmana", spoken as "Lomana", "wenig Mana", "günstig zu spielen"
    [GeneratedRegex(@"\b(low?[\s-]?mana|wenig\w*\s+mana|günstig\w*\s+(zu\s+)?(spielen|casten)|cheap\s+to\s+cast)\b", RegexOptions.IgnoreCase)]
    private static partial Regex LowManaRegex();

    // "bis 3 Mana", "max. 3 Mana", "höchstens 3 Mana", "unter 3 Mana", "3 mana or less", "≤3 mana"
    [GeneratedRegex(@"(?:(?:bis|max\.?|maximal|höchstens|at\s+most|up\s+to|≤|<=)\s*(?<n>\d{1,2})\s*mana)|(?:(?<below>unter|weniger\s+als|below|under|less\s+than|<)\s*(?<n>\d{1,2})\s*mana)|(?:(?<n>\d{1,2})\s*mana\s+(?:oder\s+weniger|or\s+less))", RegexOptions.IgnoreCase)]
    private static partial Regex AtMostManaRegex();

    [GeneratedRegex(@"\b(?<n>\d{1,2})[\s-]?drops?\b", RegexOptions.IgnoreCase)]
    private static partial Regex DropRegex();

    [GeneratedRegex(@"\b(?<n>\d{1,2})\s*mana\b", RegexOptions.IgnoreCase)]
    private static partial Regex ExactManaRegex();

    // "unter 2 €", "bis 1,50 Euro", "under $3" is not handled: prices are in euro
    [GeneratedRegex(@"(?:unter|bis|max\.?|maximal|höchstens|under|below|up\s+to|<|≤)\s*(?<n>\d+(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euro\b)", RegexOptions.IgnoreCase)]
    private static partial Regex MaxPriceRegex();
}
