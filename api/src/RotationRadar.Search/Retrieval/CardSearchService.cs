using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using RotationRadar.Search.Queries;

namespace RotationRadar.Search.Retrieval;

public sealed record SearchResult(string Query, QueryInterpretation Interpretation, IReadOnlyList<CardHit> Hits);

/// <summary>
/// Free-text card search: read the request, embed it, and let the database return the
/// nearest cards that pass the hard filters.
/// </summary>
public sealed class CardSearchService(
    IQueryInterpreter interpreter,
    IEmbeddingGenerator<string, Embedding<float>> embeddings,
    ICardIndex index,
    IOptions<SearchOptions> options
)
{
    public async Task<SearchResult> SearchAsync(string query, int? limit, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(query);
        var settings = options.Value;
        var interpretation = await interpreter.InterpretAsync(query.Trim(), cancellationToken);
        var vector = await embeddings.GenerateVectorAsync(
            settings.FormatEmbeddingQuery(interpretation.SemanticQuery),
            cancellationToken: cancellationToken
        );
        var count = Math.Clamp(limit ?? settings.DefaultLimit, 1, settings.MaxLimit);
        var hits = await index.SearchAsync(vector, interpretation.Filter, count, cancellationToken);
        return new SearchResult(query.Trim(), interpretation, hits);
    }
}
