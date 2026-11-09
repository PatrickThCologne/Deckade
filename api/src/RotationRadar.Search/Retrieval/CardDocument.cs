using System.Security.Cryptography;
using System.Text;
using RotationRadar.Search.Cards;

namespace RotationRadar.Search.Retrieval;

/// <summary>The text a card is embedded with, and a fingerprint to notice when it changes.</summary>
public static class CardDocument
{
    /// <summary>
    /// Name, cost, type line and rules text. The German text is added when there is one, so
    /// German requests find their words even without the model translating them.
    /// </summary>
    public static string For(SearchCard card)
    {
        ArgumentNullException.ThrowIfNull(card);
        var text = new StringBuilder()
            .Append(card.Name).Append(" | ").Append(card.ManaCost).Append(" | ").Append(card.TypeLine).Append('\n')
            .Append(card.Text);
        if (card.NameDe is not null && card.TextDe is not null)
        {
            text.Append("\n\n").Append(card.NameDe).Append('\n').Append(card.TextDe);
        }
        return text.ToString();
    }

    /// <summary>Changes when the text or the embedding model changes.</summary>
    public static string Fingerprint(string text, string model) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes($"{model}\n{text}")))[..32];
}
