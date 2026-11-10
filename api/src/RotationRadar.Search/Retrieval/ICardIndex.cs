using RotationRadar.Search.Cards;
using RotationRadar.Search.Queries;

namespace RotationRadar.Search.Retrieval;

/// <param name="Card">The card.</param>
/// <param name="Similarity">Cosine similarity between request and card, 1 is identical.</param>
public sealed record CardHit(SearchCard Card, double Similarity);

/// <summary>Where the cards and their embeddings are stored (PostgreSQL with pgvector).</summary>
public interface ICardIndex
{
    /// <summary>The cards closest to the vector among those that pass the filter, closest first.</summary>
    Task<IReadOnlyList<CardHit>> SearchAsync(
        ReadOnlyMemory<float> vector,
        CardFilter filter,
        int limit,
        CancellationToken cancellationToken
    );

    /// <summary>The cards with these ids, in the given order; unknown ids are skipped.</summary>
    Task<IReadOnlyList<SearchCard>> GetAsync(
        IReadOnlyList<string> oracleIds,
        CancellationToken cancellationToken
    );
}
