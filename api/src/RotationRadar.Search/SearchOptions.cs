namespace RotationRadar.Search;

/// <summary>Settings of the search, bound from the "Search" configuration section.</summary>
public sealed class SearchOptions
{
    public const string Section = "Search";

    public int DefaultLimit { get; set; } = 24;
    public int MaxLimit { get; set; } = 48;
    public int MaxQueryLength { get; set; } = 300;

    /// <summary>Let the language model read the request. Off: rule-based filters only.</summary>
    public bool UseLanguageModel { get; set; } = true;

    /// <summary>After this the search continues without the model's answer.</summary>
    public TimeSpan LanguageModelTimeout { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>How many of the best hits the model may choose recommendations from.</summary>
    public int RecommendationCandidates { get; set; } = 12;

    public int MaxRecommendations { get; set; } = 5;

    /// <summary>
    /// How a request is wrapped before it is embedded; "{query}" is replaced by the text.
    /// Card texts are embedded without a wrapper. The default is the instruction format of
    /// Qwen3-Embedding; other embedding models want other prefixes or none.
    /// </summary>
    public string EmbeddingQueryTemplate { get; set; } =
        "Instruct: Given a search request for Magic: The Gathering cards, retrieve cards whose rules text fulfils it\nQuery: {query}";

    public string FormatEmbeddingQuery(string query) =>
        EmbeddingQueryTemplate.Replace("{query}", query, StringComparison.Ordinal);
}
