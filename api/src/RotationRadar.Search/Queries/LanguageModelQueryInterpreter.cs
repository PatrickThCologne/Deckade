using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RotationRadar.Search.Cards;

namespace RotationRadar.Search.Queries;

/// <summary>
/// Lets the language model read the request: it returns the filters as JSON and writes the
/// rules text a matching card would have. That text is embedded together with the request
/// (the "hypothetical document" idea), which helps when the request uses slang like
/// "Pump-Spell" that never appears on a card. If the model fails or is too slow, the
/// rule-based reading is used instead.
/// </summary>
public sealed partial class LanguageModelQueryInterpreter(
    IChatClient chatClient,
    IOptions<SearchOptions> options,
    ILogger<LanguageModelQueryInterpreter> logger
) : IQueryInterpreter
{
    internal const string Instructions = """
        You read search requests for Magic: The Gathering cards, written in German or English.
        Answer with JSON only. Set a filter only when the request clearly asks for it.
        - colors: color letters W, U, B, R, G. exactColors: true for "mono", "only" or a guild
          name (Selesnya = W and G). Colorless: empty colors and exactColors true.
        - minManaValue, maxManaValue: "low mana", "Low-Mana", "wenig Mana" or "cheap to cast"
          mean maxManaValue 2. "3 mana" means minManaValue 3 and maxManaValue 3.
        - types: any of artifact, battle, creature, enchantment, instant, kindred, land,
          planeswalker, sorcery. A "pump spell" or "combat trick" is an instant. Do not guess
          a type when the request only describes an effect.
        - maxPriceEur: only when the request names an amount of money, like "unter 2 €".
        - rulesText: one or two sentences in English Oracle wording that a matching card would
          have, for example "Target creature gets +3/+3 until end of turn." Never name a card.
        """;

    public async Task<QueryInterpretation> InterpretAsync(string query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var fallback = RuleBasedQueryParser.Parse(query);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(options.Value.LanguageModelTimeout);
        try
        {
            var response = await chatClient.GetResponseAsync<ModelReading>(
                [new ChatMessage(ChatRole.System, Instructions), new ChatMessage(ChatRole.User, query)],
                new ChatOptions { Temperature = 0 },
                cancellationToken: timeout.Token
            );
            if (!response.TryGetResult(out var reading))
            {
                LogUnreadableAnswer(logger, response.Text);
                return fallback;
            }
            return reading.ToInterpretation(query);
        }
        catch (Exception error) when (!cancellationToken.IsCancellationRequested)
        {
            // Includes our own timeout; only a cancelled request is passed on
            LogModelFailed(logger, error);
            return fallback;
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "The model's reading was no valid JSON: {Answer}")]
    private static partial void LogUnreadableAnswer(ILogger logger, string answer);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The model could not read the request, using the rules instead")]
    private static partial void LogModelFailed(ILogger logger, Exception error);
}

/// <summary>The JSON the model answers with. All fields are optional.</summary>
internal sealed record ModelReading(
    IReadOnlyList<string>? Colors,
    bool? ExactColors,
    double? MinManaValue,
    double? MaxManaValue,
    IReadOnlyList<string>? Types,
    decimal? MaxPriceEur,
    string? RulesText
)
{
    public QueryInterpretation ToInterpretation(string query)
    {
        var filter = new CardFilter
        {
            Colors = ManaColors.FromNames(Colors ?? []),
            ExactColors = ExactColors ?? false,
            MinManaValue = MinManaValue,
            MaxManaValue = MaxManaValue,
            Types = Types ?? [],
            MaxPriceEur = MaxPriceEur,
        }.Sanitized();
        var rulesText = RulesText?.Trim();
        var semantic = string.IsNullOrEmpty(rulesText) ? query.Trim() : $"{query.Trim()}\n{rulesText}";
        return new QueryInterpretation(filter, semantic, InterpretationSource.LanguageModel);
    }
}
