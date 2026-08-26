"""Shared AI client lifecycle: lazy-loaded Groq LLM + optional HF embeddings.

Moved from app/main.py (original lines ~249-289, plus the module-level
`_processing_lock = threading.Lock()` at original line 255).

This is the single source of truth for `get_models()` / `peek_models()` /
`_processing_lock`. During the router-extraction pass, several independently
built modules each needed this loader and, working in parallel without
visibility into each other, landed three different answers: a duplicate
implementation in `services/matching.py`, a function-local
`from app.main import get_models` bridge in `services/resume_processing.py`
and `services/excel_import.py`, and downstream routers importing `get_models`
from wherever seemed closest. This module consolidates all of that into one
real implementation so there is exactly one embeddings client and one LLM
client cached process-wide, instead of two or three independent caches that
would each pay their own cold-start cost and could disagree with each other
after a Groq API key rotation.
"""

from __future__ import annotations

import os
import threading
from typing import Optional

from dotenv import load_dotenv
from langchain_groq import ChatGroq

from app.core.logging import get_logger

logger = get_logger(__name__)

# Guards resume/Excel processing so only one heavy parse runs at a time
# (protects against memory spikes from concurrent PDF/embedding work on
# small hosting tiers). Original name/semantics preserved from main.py.
_processing_lock = threading.Lock()

_embeddings = None
_llm = None
_models_loading = False
_active_groq_key: Optional[str] = None
_model_lock = threading.Lock()


def get_models():
    """Lazily load and cache the embeddings + Groq LLM clients (blocks while loading)."""
    global _embeddings, _llm, _models_loading, _active_groq_key
    with _model_lock:
        _models_loading = True
        if _embeddings is None:
            try:
                hf_token = os.getenv("HF_TOKEN")
                if hf_token:
                    from langchain_community.embeddings import HuggingFaceInferenceAPIEmbeddings
                    _embeddings = HuggingFaceInferenceAPIEmbeddings(
                        api_key=hf_token, model_name="sentence-transformers/all-MiniLM-L6-v2"
                    )
                else:
                    logger.warning("HF_TOKEN not set. Embeddings disabled to prevent OOM on Render Free Tier.")
                    _embeddings = None
            except Exception as e:
                logger.warning("Failed to load Embeddings: %s", e)
                _embeddings = None

        # Reload env vars dynamically in case the key changed in the file.
        try:
            load_dotenv(override=True)
        except Exception:
            pass
        current_key = os.getenv("GROQ_API_KEY", "")

        if _llm is None or _active_groq_key != current_key:
            _llm = ChatGroq(temperature=0.1, model_name="openai/gpt-oss-120b", groq_api_key=current_key)
            _active_groq_key = current_key

        _models_loading = False
    return _embeddings, _llm


def peek_models():
    """Return the currently cached (embeddings, llm, is_loading) WITHOUT triggering a load.

    Used by routes (e.g. chat) that need to show a "still warming up" message
    instead of blocking the request on a cold model load.
    """
    return _embeddings, _llm, _models_loading
