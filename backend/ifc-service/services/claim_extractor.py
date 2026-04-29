"""
Heuristic Claim Extractor (Phase 6, Sprint 6.2).

Pattern-based extraction of normative statements from markdown. High
precision, lower recall. Sprint 6.3 will add LLM extraction on top for the
chunks heuristics miss; for 6.2 the bar is "if a sentence has a clear NB or
EN normative verb plus a measurable subject/value, surface it."

Output: ``ClaimCandidate`` list with verbatim ``statement``, parsed
``normalized`` form, ``claim_type``, ``confidence``, and ``source_location``
(char offsets within the markdown). Persistence is Django's job.

The extractor is deliberately conservative — false positives flood the
inbox and erode user trust faster than missed claims. Confidence drops as
the match gets fuzzier; the inbox UI can choose to hide < 0.6 by default.

Bilingual: Norwegian normative verbs (skal, må, minst, minimum) and English
(must, shall, at least, minimum). Past-tense / descriptive forms (was, had,
were) are deliberately rejected.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class ClaimCandidate:
    """One normative statement candidate. Persistence is the caller's job."""
    statement: str = ""
    normalized: Dict[str, Any] = field(default_factory=dict)
    claim_type: str = "rule"
    confidence: float = 0.0
    source_location: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ClaimExtractionResult:
    """Result of running heuristics over one markdown body."""
    success: bool = False
    claims: List[ClaimCandidate] = field(default_factory=list)
    log_entries: List[Dict[str, Any]] = field(default_factory=list)
    quality_report: Dict[str, Any] = field(default_factory=dict)
    duration_seconds: float = 0.0
    error: Optional[str] = None


LogFn = Callable[..., None]


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

# Normative-verb anchors — match within a sentence to qualify it as a claim.
# Word-boundary anchors keep "shall" from matching "shallow"; the patterns
# all assume the surrounding sentence will be tested against past-tense
# rejectors below.
_NORMATIVE_VERBS_EN = (
    r"shall(?:\s+be|\s+have|\s+meet|\s+provide|\s+comply|\s+include)?",
    r"must(?:\s+be|\s+have|\s+meet|\s+provide|\s+comply|\s+include)?",
    r"required\s+to\s+be",
    r"is\s+required",
    r"are\s+required",
    r"at\s+least",
    r"no\s+less\s+than",
    r"minimum",
    r"maximum",
    r"not\s+exceed",
)
_NORMATIVE_VERBS_NB = (
    r"skal(?:\s+vaere|\s+være|\s+ha|\s+oppfylle|\s+oppfylles|\s+leveres)?",
    r"må(?:\s+vaere|\s+være|\s+ha|\s+oppfylle)?",
    r"minst",
    r"minimum",
    r"maksimum",
    r"ikke\s+overstige",
)
_NORMATIVE_VERB_RE = re.compile(
    r"\b(?:" + "|".join(_NORMATIVE_VERBS_EN + _NORMATIVE_VERBS_NB) + r")\b",
    re.IGNORECASE,
)

# Past-tense / descriptive forms that should NOT trigger normative classification.
# Order matters — these win over normative verbs when a sentence has both.
_PAST_TENSE_REJECT = re.compile(
    r"\b(?:was|were|had been|has been|var|hadde|tidligere)\b",
    re.IGNORECASE,
)

# Sentence splitter — naive but sufficient. Markdown tables and lists are
# split on newlines + bullet markers separately so a "shall" inside a list
# item stays intact.
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÆØÅ])")

# Subject + value patterns. Each pattern carries the predicate name we'll
# emit in `normalized`. Run in order — first match wins.
_VALUE_PATTERNS = [
    # Fire resistance class: REI60, EI30, R120, RE45, REI 60, EI-30
    {
        "name": "fire_resistance_class",
        "regex": re.compile(
            r"\b(REI|EI|R|RE)\s*[-]?\s*(\d{1,3})\b",
            re.IGNORECASE,
        ),
        "extract": lambda m: {
            "value": f"{m.group(1).upper()}{m.group(2)}",
            "units": "class",
        },
    },
    # Acoustic dB rating: 50 dB, 35 dB(A), 40 dB
    {
        "name": "acoustic_db",
        "regex": re.compile(r"\b(\d{1,3})\s*dB(?:\(A\))?\b", re.IGNORECASE),
        "extract": lambda m: {"value": float(m.group(1)), "units": "dB"},
    },
    # U-value: 0.18 W/m2K, 0.18 W/(m²K), W/m²K
    {
        "name": "u_value",
        "regex": re.compile(
            r"\b(\d+(?:[.,]\d+)?)\s*W/?\(?m[²2](?:[*·]?\s*K)?\)?",
            re.IGNORECASE,
        ),
        "extract": lambda m: {
            "value": float(m.group(1).replace(",", ".")),
            "units": "W/m2K",
        },
    },
    # Ventilation rate: 7 l/s, 7.0 L/s, 1.2 m3/h, m³/h per person
    {
        "name": "flow_rate",
        "regex": re.compile(
            r"\b(\d+(?:[.,]\d+)?)\s*(l/s|L/s|m[³3]/h|m3/h)\b",
            re.IGNORECASE,
        ),
        "extract": lambda m: {
            "value": float(m.group(1).replace(",", ".")),
            "units": m.group(2).lower().replace("³", "3"),
        },
    },
    # Distance / dimension: 100 mm, 1.5 m, 3 cm
    {
        "name": "dimension",
        "regex": re.compile(
            r"\b(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b",
            re.IGNORECASE,
        ),
        "extract": lambda m: {
            "value": float(m.group(1).replace(",", ".")),
            "units": m.group(2).lower(),
        },
    },
    # Pressure: 50 Pa, 0.5 kPa
    {
        "name": "pressure",
        "regex": re.compile(
            r"\b(\d+(?:[.,]\d+)?)\s*(Pa|kPa|bar)\b",
        ),
        "extract": lambda m: {
            "value": float(m.group(1).replace(",", ".")),
            "units": m.group(2),
        },
    },
]


# Subject extraction: pull the noun phrase that comes BEFORE the normative
# verb in the same sentence. Heuristic: take up to ~6 words preceding the
# first normative verb match.
_SUBJECT_TRIM_RE = re.compile(r"^[\W_]+|[\W_]+$")


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------


def extract_claims(markdown: str) -> ClaimExtractionResult:
    """
    Extract claim candidates from a markdown body.

    Args:
        markdown: Document body (markdown). Lines, headings, lists, tables
            all welcome — patterns work on raw text after a light strip.

    Returns:
        ClaimExtractionResult with one ClaimCandidate per matched
        normative sentence.
    """
    result = ClaimExtractionResult()
    start = time.time()

    def log(level: str, stage: str, message: str, **details: Any) -> None:
        result.log_entries.append({
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "stage": stage,
            "message": message,
            **details,
        })

    if not markdown or not markdown.strip():
        result.success = True
        result.quality_report = {"claim_count": 0, "by_type": {}}
        log("info", "complete", "Empty markdown — no claims to extract")
        result.duration_seconds = time.time() - start
        return result

    try:
        sentences = _split_sentences(markdown)
        for sent_meta in sentences:
            cand = _extract_from_sentence(sent_meta)
            if cand is not None:
                result.claims.append(cand)

        result.success = True
        by_type: Dict[str, int] = {}
        for c in result.claims:
            by_type[c.claim_type] = by_type.get(c.claim_type, 0) + 1
        result.quality_report = {
            "claim_count": len(result.claims),
            "by_type": by_type,
            "sentence_count": len(sentences),
        }
        log(
            "info", "complete",
            f"Extracted {len(result.claims)} claim(s) from {len(sentences)} sentence(s) "
            f"in {time.time() - start:.3f}s",
        )
    except Exception as exc:  # pragma: no cover
        result.success = False
        result.error = str(exc)
        log("error", "fatal", f"Extraction failed: {exc}", error=str(exc))

    result.duration_seconds = time.time() - start
    return result


# ---------------------------------------------------------------------------
# Sentence splitting — keep char offsets for source_location
# ---------------------------------------------------------------------------


def _split_sentences(markdown: str) -> List[Dict[str, Any]]:
    """
    Split markdown into sentences with char offsets back to the original.

    Strategy: walk line by line so we keep accurate char offsets, strip the
    markdown decorations on each line (heading hashes, list bullets, blockquote
    angle brackets), then break each cleaned line on sentence punctuation. A
    bullet item with multiple sentences therefore yields multiple candidates.
    """
    sentences: List[Dict[str, Any]] = []

    pos = 0
    for line in markdown.splitlines(keepends=True):
        line_start = pos
        pos += len(line)
        cleaned, prefix_len = _strip_line_prefix(line)
        cleaned = cleaned.rstrip()
        if not cleaned:
            continue
        # split inside the cleaned line; map sub-offsets back into the
        # original markdown via line_start + prefix_len + offset_in_cleaned.
        cursor = 0
        for sub in _SENTENCE_RE.split(cleaned):
            sub_stripped = sub.strip()
            if not sub_stripped:
                cursor += len(sub) + 1
                continue
            local_idx = cleaned.find(sub, cursor)
            if local_idx < 0:
                local_idx = cursor
            char_start = line_start + prefix_len + local_idx
            char_end = char_start + len(sub_stripped)
            sentences.append({
                "text": sub_stripped,
                "raw": sub_stripped,
                "char_start": char_start,
                "char_end": char_end,
            })
            cursor = local_idx + len(sub)
    return sentences


def _strip_line_prefix(line: str) -> tuple[str, int]:
    """
    Remove leading markdown decoration (heading, bullet, blockquote, table).

    Returns the cleaned text plus the number of characters consumed by the
    prefix so the caller can keep accurate char offsets relative to the
    original markdown body.
    """
    m = re.match(r"^(\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+|\|\s*))", line)
    if not m:
        return line, 0
    return line[m.end():], m.end()


# ---------------------------------------------------------------------------
# Per-sentence extraction
# ---------------------------------------------------------------------------


def _extract_from_sentence(sent_meta: Dict[str, Any]) -> Optional[ClaimCandidate]:
    """Test one sentence; return a ClaimCandidate if it looks normative."""
    text = sent_meta["text"]
    if not text:
        return None

    if _PAST_TENSE_REJECT.search(text):
        return None

    verb_match = _NORMATIVE_VERB_RE.search(text)
    if not verb_match:
        return None

    # Detect the value first — without a measurable value we drop it. Past
    # versions of this extractor surfaced bare "must comply" claims and the
    # inbox got noisy fast; require a value+unit triple.
    value_info = None
    value_match_offset = None
    for spec in _VALUE_PATTERNS:
        m = spec["regex"].search(text)
        if m:
            value_info = {"predicate": spec["name"], **spec["extract"](m)}
            value_match_offset = m.start()
            break
    if value_info is None:
        return None

    # Subject: take up to 6 words preceding the normative verb.
    pre_verb = text[: verb_match.start()].strip()
    subject = _last_words(pre_verb, max_words=6)
    subject = _SUBJECT_TRIM_RE.sub("", subject) or "(unspecified)"

    # Language detection: presence of NB normative verbs
    lang = "nb" if re.search(
        r"\b(?:skal|må|minst|minimum|maksimum)\b", text, re.IGNORECASE,
    ) else "en"

    # Confidence: start at 0.85 (high — heuristic match), bump up if the
    # subject has substance, drop if value match comes before the verb.
    confidence = 0.85
    if len(subject.split()) >= 2 and subject != "(unspecified)":
        confidence = 0.92
    if value_match_offset is not None and value_match_offset < verb_match.start():
        # "Minimum 7 L/s per person ventilation" — value ahead of verb is
        # still valid but a touch fuzzier.
        confidence -= 0.05

    return ClaimCandidate(
        statement=text,
        normalized={
            "predicate": value_info["predicate"],
            "subject": subject,
            "value": value_info["value"],
            "units": value_info["units"],
            "lang": lang,
        },
        claim_type="rule",
        confidence=round(confidence, 3),
        source_location={
            "char_start": sent_meta["char_start"],
            "char_end": sent_meta["char_end"],
        },
    )


def _last_words(text: str, max_words: int) -> str:
    """Return the last `max_words` words of `text`, joined by single spaces."""
    words = re.findall(r"[\w/-]+", text)
    if not words:
        return ""
    tail = words[-max_words:]
    return " ".join(tail)
