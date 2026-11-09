namespace RotationRadar.Search.Queries;

public enum InterpretationSource
{
    /// <summary>Only the rule-based parser ran (no model configured, or it failed).</summary>
    Rules,

    /// <summary>The language model read the request.</summary>
    LanguageModel,
}

/// <summary>What the search understood from a request.</summary>
/// <param name="Filter">Hard filters for the database query.</param>
/// <param name="SemanticQuery">The text that is embedded and compared with the cards.</param>
/// <param name="Source">Who produced the interpretation.</param>
public sealed record QueryInterpretation(
    CardFilter Filter,
    string SemanticQuery,
    InterpretationSource Source
);

public interface IQueryInterpreter
{
    Task<QueryInterpretation> InterpretAsync(string query, CancellationToken cancellationToken);
}
