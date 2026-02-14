"""Markdown report generation helpers for Typora -> PDF workflow."""

from __future__ import annotations

from pathlib import Path
from typing import Any


def markdown_table(headers: list[str], rows: list[list[Any]]) -> str:
    """Generate a markdown table string.

    Args:
        headers: Column headers.
        rows: List of rows, each a list of cell values.

    Returns:
        Markdown table as a string.
    """
    if not headers:
        return ""

    # Convert all values to strings
    str_rows = [[str(v) if v is not None else "" for v in row] for row in rows]

    # Calculate column widths
    widths = [len(h) for h in headers]
    for row in str_rows:
        for i, cell in enumerate(row):
            if i < len(widths):
                widths[i] = max(widths[i], len(cell))

    # Build table
    header_line = "| " + " | ".join(h.ljust(widths[i]) for i, h in enumerate(headers)) + " |"
    separator = "| " + " | ".join("-" * w for w in widths) + " |"
    data_lines = []
    for row in str_rows:
        padded = []
        for i, cell in enumerate(row):
            w = widths[i] if i < len(widths) else len(cell)
            padded.append(cell.ljust(w))
        data_lines.append("| " + " | ".join(padded) + " |")

    return "\n".join([header_line, separator] + data_lines)


def markdown_report(title: str, sections: list[dict[str, Any]]) -> str:
    """Generate a markdown report with title and sections.

    Each section dict should have:
    - heading (str): Section heading
    - body (str, optional): Text content
    - table (dict, optional): {headers: [...], rows: [[...], ...]}

    Args:
        title: Report title (H1).
        sections: List of section dicts.

    Returns:
        Complete markdown document as a string.
    """
    parts = [f"# {title}", ""]

    for section in sections:
        heading = section.get("heading", "")
        parts.append(f"## {heading}")
        parts.append("")

        body = section.get("body")
        if body:
            parts.append(body)
            parts.append("")

        table = section.get("table")
        if table:
            parts.append(markdown_table(table["headers"], table["rows"]))
            parts.append("")

    return "\n".join(parts)


def save_report(content: str, path: str | Path) -> Path:
    """Save markdown content to a file.

    Args:
        content: Markdown string.
        path: Output file path.

    Returns:
        Path to the saved file.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path
