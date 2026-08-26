"""
Shared helper for extracting JSON out of raw LLM text responses.

This consolidates ~7-8 duplicated inline implementations of the same idiom
found throughout `app/main.py` (resume formatting/extraction, JD parsing,
job/candidate matching, chat filter extraction, and follow-up email/resume
processing). Every one of those call sites, despite asking the LLM to
"return only raw JSON, no markdown", still had to defensively:

  1. Strip a ```json ... ``` (or bare ``` ... ```) markdown fence the model
     wrapped the JSON in anyway.
  2. Find the first opening bracket and the last matching closing bracket
     (`{`/`}` for objects, `[`/`]` for the list-returning match/search
     prompts) and slice down to just that span, to drop any leading/trailing
     prose the model added despite instructions.
  3. `json.loads()` the result.

`parse_llm_json` does exactly that in one place. It does NOT catch
`json.JSONDecodeError` itself - every original call site already wraps this
step in its own try/except with its own fallback (raise a generic
"Failed to parse..." error, return `{}`, return `None`, or log-and-continue),
so re-raising here lets each call site keep its existing error-handling
contract unchanged.
"""

from __future__ import annotations

import json
from typing import Any

# Maps the opening bracket to its closing counterpart. Only object/array
# roots are supported since that's the only shape these prompts ever ask for.
_CLOSING_BRACKET = {"{": "}", "[": "]"}


def parse_llm_json(raw_text: str, bracket: str = "{") -> Any:
    """Extract and parse a JSON object/array embedded in an LLM's raw text reply.

    Args:
        raw_text: The raw `resp.content` string from the LLM.
        bracket: `"{"` (default) to extract a JSON object, or `"["` to
            extract a JSON array/list - the matching/search prompts ask the
            model for a list of matches, everything else asks for an object.

    Returns:
        The parsed JSON value (dict or list, depending on `bracket`).

    Raises:
        ValueError: If `bracket` isn't `"{"` or `"["`.
        json.JSONDecodeError: If no valid JSON could be parsed out of the
            text. Left uncaught deliberately - see module docstring.
    """
    if bracket not in _CLOSING_BRACKET:
        raise ValueError(f"bracket must be '{{' or '[', got {bracket!r}")
    closing = _CLOSING_BRACKET[bracket]

    text = raw_text.strip()

    # Strip a ```json ... ``` fence first, falling back to a bare ``` ... ```
    # fence - mirrors the original `if "```json" in raw: ... elif "```" in raw: ...`
    # pattern repeated at every call site.
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[1].split("```")[0].strip()

    # Slice down to the outermost bracket pair to drop any stray prose the
    # model added before/after the JSON despite being told not to.
    start, end = text.find(bracket), text.rfind(closing)
    if start != -1 and end != -1:
        text = text[start : end + 1]

    return json.loads(text)
