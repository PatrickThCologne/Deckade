namespace RotationRadar.Search.Cards;

/// <summary>The card types a search can filter by, taken from the type line.</summary>
public static class CardTypes
{
    public const string Artifact = "artifact";
    public const string Battle = "battle";
    public const string Creature = "creature";
    public const string Enchantment = "enchantment";
    public const string Instant = "instant";
    public const string Kindred = "kindred";
    public const string Land = "land";
    public const string Planeswalker = "planeswalker";
    public const string Sorcery = "sorcery";

    public static IReadOnlyList<string> All { get; } =
        [Artifact, Battle, Creature, Enchantment, Instant, Kindred, Land, Planeswalker, Sorcery];

    /// <summary>
    /// "Legendary Artifact Creature — Golem // Land" -> artifact, creature, land.
    /// Only the part before the dash counts; supertypes like "Legendary" are skipped.
    /// "Tribal" is the old name of "Kindred".
    /// </summary>
    public static IReadOnlyList<string> FromTypeLine(string typeLine)
    {
        ArgumentNullException.ThrowIfNull(typeLine);
        var types = new List<string>();
        foreach (var face in typeLine.Split("//", StringSplitOptions.TrimEntries))
        {
            var main = face.Split('—', 2)[0];
            foreach (var word in main.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            {
                var type = word.Equals("Tribal", StringComparison.OrdinalIgnoreCase)
                    ? Kindred
                    : All.FirstOrDefault(t => t.Equals(word, StringComparison.OrdinalIgnoreCase));
                if (type is not null && !types.Contains(type))
                {
                    types.Add(type);
                }
            }
        }
        return types;
    }

    public static bool IsKnown(string type) => All.Contains(type);
}
