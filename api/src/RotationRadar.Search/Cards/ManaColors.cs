namespace RotationRadar.Search.Cards;

/// <summary>Color sets as strings in WUBRG order ("" is colorless), like the pipeline.</summary>
public static class ManaColors
{
    public const string Order = "WUBRG";

    /// <summary>Keeps only W, U, B, R and G, once each, in WUBRG order.</summary>
    public static string Normalize(IEnumerable<char> colors)
    {
        ArgumentNullException.ThrowIfNull(colors);
        var set = colors.Select(char.ToUpperInvariant).ToHashSet();
        return string.Concat(Order.Where(set.Contains));
    }

    public static string Normalize(string colors) => Normalize(colors.AsEnumerable());

    /// <summary>
    /// Color letters from what a model may answer: "G", "green", "Grün". Unknown words are
    /// dropped. Blue is "U" in Magic, so the first letter is not enough.
    /// </summary>
    public static string FromNames(IEnumerable<string> names)
    {
        ArgumentNullException.ThrowIfNull(names);
        var letters = names.Select(name => name.Trim().ToUpperInvariant() switch
        {
            "W" or "WHITE" or "WEISS" or "WEIß" => 'W',
            "U" or "BLUE" or "BLAU" => 'U',
            "B" or "BLACK" or "SCHWARZ" => 'B',
            "R" or "RED" or "ROT" => 'R',
            "G" or "GREEN" or "GRÜN" or "GRUEN" => 'G',
            _ => ' ',
        });
        return Normalize(letters);
    }
}
