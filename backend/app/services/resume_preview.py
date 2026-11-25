"""Browser-friendly preview of a stored resume: PDFs and images are shown as they are, Word files are
rendered to simple HTML (browsers cannot display .docx), anything else gets an explanatory page."""
from __future__ import annotations

import html
import io
from typing import Optional

_PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>{title}</title><style>
body{{font-family:Segoe UI,Arial,sans-serif;color:#1f2937;background:#fff;margin:0;padding:28px 36px;line-height:1.5;font-size:14px}}
h1,h2,h3{{margin:16px 0 6px;color:#111827}} h1{{font-size:20px}} h2{{font-size:16px;border-bottom:1px solid #e5e7eb;padding-bottom:3px}}
h3{{font-size:14px}} p{{margin:4px 0}} table{{border-collapse:collapse;margin:8px 0;width:100%}}
td,th{{border:1px solid #d1d5db;padding:4px 8px;vertical-align:top;font-size:13px}} .note{{color:#6b7280}}
</style></head><body>{body}</body></html>"""


def message_page(title: str, text: str) -> str:
    return _PAGE.format(title=html.escape(title), body=f'<h2>{html.escape(title)}</h2><p class="note">{html.escape(text)}</p>')


def _runs_html(paragraph) -> str:
    parts = []
    for run in paragraph.runs:
        text = html.escape(run.text or "")
        if not text:
            continue
        if run.bold:
            text = f"<b>{text}</b>"
        if run.italic:
            text = f"<i>{text}</i>"
        if run.underline:
            text = f"<u>{text}</u>"
        parts.append(text)
    return "".join(parts) or html.escape(paragraph.text or "")


def docx_to_html(data: bytes, title: str = "Resume") -> str:
    """Headings, paragraphs (bold / italic / underline), simple bullet lists and tables, in document order."""
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    document = docx.Document(io.BytesIO(data))
    body = []
    for child in document.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            paragraph = Paragraph(child, document)
            content = _runs_html(paragraph)
            if not content.strip():
                continue
            style = (paragraph.style.name if paragraph.style is not None else "") or ""
            if style.lower().startswith("title"):
                body.append(f"<h1>{content}</h1>")
            elif style.lower().startswith("heading"):
                level = "".join(ch for ch in style if ch.isdigit()) or "2"
                body.append(f"<h{min(max(int(level), 1), 3) + 0}>{content}</h{min(max(int(level), 1), 3)}>")
            elif "list" in style.lower():
                body.append(f"<p>&bull; {content}</p>")
            else:
                body.append(f"<p>{content}</p>")
        elif tag == "tbl":
            table = Table(child, document)
            rows = []
            for row in table.rows:
                seen, cells = set(), []
                for cell in row.cells:
                    if id(cell._tc) in seen:  # merged cells repeat
                        continue
                    seen.add(id(cell._tc))
                    cells.append(f"<td>{html.escape(cell.text or '')}</td>")
                rows.append("<tr>" + "".join(cells) + "</tr>")
            body.append("<table>" + "".join(rows) + "</table>")
    if not body:
        return message_page(title, "This Word document has no readable text. Download it to open it in Word.")
    return _PAGE.format(title=html.escape(title), body="\n".join(body))


def preview_for(filename: Optional[str], data: bytes) -> tuple[bytes, str]:
    """``(body, media_type)`` to show for a stored file."""
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return data, "application/pdf"
    for ext, media in ((".png", "image/png"), (".jpg", "image/jpeg"), (".jpeg", "image/jpeg")):
        if name.endswith(ext):
            return data, media
    if name.endswith(".docx"):
        try:
            return docx_to_html(data, filename or "Resume").encode("utf-8"), "text/html; charset=utf-8"
        except Exception:
            return message_page("Preview unavailable", "This Word file could not be rendered. Use Download Resume.").encode("utf-8"), "text/html; charset=utf-8"
    return message_page("Preview unavailable", "This file type cannot be shown in the browser (for example an old .doc). Use Download Resume.").encode("utf-8"), "text/html; charset=utf-8"
