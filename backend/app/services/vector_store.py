"""The resume embedding index (PGVector) behind one small interface.

PostgreSQL only.  On SQLite (local development / tests) every operation
degrades to a logged no-op so the rest of the application keeps working.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text

from app.core.config import DATABASE_URL, IS_POSTGRES
from app.core.logging import get_logger

logger = get_logger(__name__)

COLLECTION_NAME = "resume_embeddings"
_CHUNK_SIZE = 1000
_CHUNK_OVERLAP = 100


def is_enabled() -> bool:
    return IS_POSTGRES


def _connection_string() -> str:
    return DATABASE_URL.render_as_string(hide_password=False)


def _embeddings() -> Any:
    from app.services.ai_clients import get_models

    embeddings, _ = get_models()
    return embeddings


def _store():
    from langchain_community.vectorstores import PGVector

    embeddings = _embeddings()
    if embeddings is None:
        raise RuntimeError("No embedding backend is configured")
    return PGVector(
        connection_string=_connection_string(),
        embedding_function=embeddings,
        collection_name=COLLECTION_NAME,
    )


def index_documents(docs: list, source: str) -> bool:
    """Replace ``source``'s embeddings with ``docs``; returns success."""
    if not is_enabled():
        return False
    embeddings = _embeddings()
    if embeddings is None:
        logger.warning("Skipping vector indexing of %s: no embedding backend", source)
        return False
    try:
        from langchain_community.vectorstores import PGVector
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        delete_by_source(source)
        for doc in docs:
            doc.metadata["source"] = source
        chunks = RecursiveCharacterTextSplitter(chunk_size=_CHUNK_SIZE, chunk_overlap=_CHUNK_OVERLAP).split_documents(docs)
        PGVector.from_documents(
            documents=chunks,
            embedding=embeddings,
            connection_string=_connection_string(),
            collection_name=COLLECTION_NAME,
        )
        return True
    except Exception:
        logger.exception("Vector indexing failed for %s", source)
        return False


def delete_by_source(source: str) -> None:
    if not is_enabled() or not source:
        return
    from app.db.engine import get_engine

    try:
        with get_engine().begin() as connection:
            connection.execute(
                text("DELETE FROM langchain_pg_embedding WHERE cmetadata->>'source' = :source"),
                {"source": source},
            )
    except Exception:
        logger.debug("Embedding delete skipped for %s", source, exc_info=True)


def has_vectors() -> bool:
    if not is_enabled():
        return False
    from app.db.engine import get_engine

    try:
        with get_engine().connect() as connection:
            return bool(connection.execute(text("SELECT COUNT(*) FROM langchain_pg_embedding")).scalar())
    except Exception:
        return False


def similarity_search(query: str, k: int = 15) -> list:
    return _store().similarity_search(query, k=k)


def as_retriever(k: int = 6):
    return _store().as_retriever(search_kwargs={"k": k})


def delete_collection() -> None:
    if not is_enabled():
        return
    try:
        _store().delete_collection()
    except Exception:
        logger.debug("Vector collection delete skipped", exc_info=True)
