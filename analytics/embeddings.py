from __future__ import annotations

from typing import Protocol, Sequence

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIMENSION = 384


class Embedder(Protocol):
    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        """Return one embedding vector for each input text."""


class LocalSentenceTransformerEmbedder:
    """Local open source embedder for offline glossary seeding."""

    def __init__(self, model_name: str = EMBEDDING_MODEL_NAME) -> None:
        from sentence_transformers import SentenceTransformer

        self.model_name = model_name
        self.model = SentenceTransformer(model_name)

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        vectors = self.model.encode(
            list(texts),
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

        if vectors.shape[1] != EMBEDDING_DIMENSION:
            raise ValueError(
                "Embedding dimension mismatch. Changing the model requires "
                "a matching migration and a glossary re-embed."
            )

        return [[float(value) for value in row] for row in vectors]


def get_default_embedder() -> Embedder:
    return LocalSentenceTransformerEmbedder()
