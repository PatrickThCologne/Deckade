using System.Globalization;
using System.Text;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RotationRadar.Search.Cards;
using RotationRadar.Search.Retrieval;

namespace RotationRadar.Search.Recommendations;

/// <param name="OracleId">The recommended card, always one of the candidates.</param>
/// <param name="Reason">Why it fits, written by the model from the card text it was given.</param>
public sealed record Recommendation(string OracleId, string Reason);

/// <summary>
/// The retrieval-augmented step: the model gets the request and the real texts of the best
/// hits, picks the cards that fit and says why. It may only choose from the list, so it
/// cannot invent cards; answers that point outside the list are dropped.
/// </summary>
public sealed partial class CardRecommender(
    IChatClient chatClient,
    ICardIndex index,
    IOptions<SearchOptions> options,
    ILogger<CardRecommender> logger
)
{
    public async Task<IReadOnlyList<Recommendation>> RecommendAsync(
        string query,
        string language,
        IReadOnlyList<string> candidateIds,
        CancellationToken cancellationToken
    )
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(query);
        ArgumentNullException.ThrowIfNull(candidateIds);
        var settings = options.Value;
        // The texts come from the database, never from the client
        var candidates = await index.GetAsync(
            candidateIds.Distinct(StringComparer.Ordinal).Take(settings.RecommendationCandidates).ToList(),
            cancellationToken
        );
        if (candidates.Count == 0)
        {
            return [];
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(settings.LanguageModelTimeout);
        try
        {
            var response = await chatClient.GetResponseAsync<ModelPicks>(
                [
                    new ChatMessage(ChatRole.System, Instructions(language, settings.MaxRecommendations)),
                    new ChatMessage(ChatRole.User, Prompt(query, candidates)),
                ],
                new ChatOptions { Temperature = 0 },
                cancellationToken: timeout.Token
            );
            if (!response.TryGetResult(out var picks))
            {
                LogUnreadableAnswer(logger, response.Text);
                return [];
            }
            return Validate(picks, candidates, settings.MaxRecommendations);
        }
        catch (Exception error) when (!cancellationToken.IsCancellationRequested)
        {
            LogModelFailed(logger, error);
            return [];
        }
    }

    internal static string Instructions(string language, int max) => $"""
        You help players find Magic: The Gathering cards. You get a search request and a
        numbered list of cards with their real rules text. Pick up to {max} cards from the
        list that fulfil the request best, best first. Use only numbers from the list. If no
        card fits, return an empty list.
        For each pick, give one short reason (at most 20 words) in {LanguageName(language)},
        based only on the card text shown. Answer with JSON only.
        """;

    internal static string Prompt(string query, IReadOnlyList<SearchCard> candidates)
    {
        var text = new StringBuilder();
        text.Append(CultureInfo.InvariantCulture, $"Request: {query}\n\nCards:\n");
        for (var i = 0; i < candidates.Count; i++)
        {
            var card = candidates[i];
            text.Append(
                CultureInfo.InvariantCulture,
                $"[{i + 1}] {card.Name} {card.ManaCost} | {card.TypeLine}\n{card.Text}\n\n"
            );
        }
        return text.ToString();
    }

    /// <summary>Keeps picks that point into the list, once each, with a non-empty reason.</summary>
    internal static IReadOnlyList<Recommendation> Validate(
        ModelPicks picks,
        IReadOnlyList<SearchCard> candidates,
        int max
    )
    {
        var seen = new HashSet<int>();
        return (picks.Picks ?? [])
            .Where(p => p.Number >= 1 && p.Number <= candidates.Count && !string.IsNullOrWhiteSpace(p.Reason))
            .Where(p => seen.Add(p.Number))
            .Take(max)
            .Select(p => new Recommendation(candidates[p.Number - 1].OracleId, Shorten(p.Reason!.Trim(), 240)))
            .ToList();
    }

    private static string Shorten(string text, int length) => text.Length <= length ? text : text[..length] + "…";

    private static string LanguageName(string language) =>
        language.StartsWith("de", StringComparison.OrdinalIgnoreCase) ? "German" : "English";

    [LoggerMessage(Level = LogLevel.Warning, Message = "The model's picks were no valid JSON: {Answer}")]
    private static partial void LogUnreadableAnswer(ILogger logger, string answer);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The model could not recommend cards")]
    private static partial void LogModelFailed(ILogger logger, Exception error);
}

internal sealed record ModelPicks(IReadOnlyList<ModelPick>? Picks);

/// <param name="Number">The card's number in the list, starting at 1.</param>
/// <param name="Reason">Why the card fits.</param>
internal sealed record ModelPick(int Number, string? Reason);
