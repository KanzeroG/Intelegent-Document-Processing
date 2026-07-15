"""Document loading: turn an uploaded PDF or image into a model-readable PNG.

The vision model consumes a base64-encoded image. PDFs are rasterized to PNG
with PyMuPDF — up to the first 5 pages, stitched vertically into one image so a
multi-page document is read in a single pass; image uploads are normalized to
PNG via Pillow so the model always receives a consistent format.

Note: PyMuPDF imports as `fitz`.
"""

from __future__ import annotations

import base64
import io

import os

import fitz  # PyMuPDF
from PIL import Image

# Rasterization zoom for PDFs. 3.0 ≈ 216 DPI: empirically needed for qwen2.5vl:3b
# to read small table digits (qty / unit price) and document numbers reliably.
# Higher (4.0) gave no gain and cost more tokens/time on the 16GB target machine.
#
# Overridable so the zoom/latency/accuracy trade-off can be swept against the
# eval harness — the current model (qwen3-vl-4b) reads better than the qwen2.5vl
# this was tuned for, and latency scales with pixel count.
_PDF_ZOOM = float(os.getenv("PDF_ZOOM", "3.0"))


def _png_to_base64(png_bytes: bytes) -> str:
    """Encode raw PNG bytes as a base64 ASCII string (no data-URI prefix)."""
    return base64.b64encode(png_bytes).decode("ascii")


def _pdf_to_png(data: bytes) -> bytes:
    """Render pages of a PDF (up to 5 pages) and stitch them vertically into a single PNG."""
    with fitz.open(stream=data, filetype="pdf") as doc:
        if doc.page_count == 0:
            raise ValueError("PDF has no pages.")
        
        images = []
        # Stitch up to 5 pages to avoid context limits
        for i in range(min(doc.page_count, 5)):
            page = doc.load_page(i)
            pix = page.get_pixmap(matrix=fitz.Matrix(_PDF_ZOOM, _PDF_ZOOM))
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            images.append(img)

        if not images:
            raise ValueError("PDF has no readable pages.")

        total_height = sum(img.height for img in images)
        max_width = max(img.width for img in images)

        canvas = Image.new("RGB", (max_width, total_height), "white")
        current_y = 0
        for img in images:
            canvas.paste(img, (0, current_y))
            current_y += img.height
            img.close()

        buf = io.BytesIO()
        canvas.save(buf, format="PNG")
        return buf.getvalue()


def _image_to_png(data: bytes) -> bytes:
    """Normalize any Pillow-readable image to PNG bytes."""
    with Image.open(io.BytesIO(data)) as img:
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="PNG")
        return buf.getvalue()


def load_document_as_base64_png(data: bytes, content_type: str | None, filename: str | None) -> str:
    """Convert an uploaded file to a base64-encoded PNG for the vision model.

    Routing is by MIME type first, then file extension as a fallback, since
    browsers don't always set a reliable content_type on upload.
    """
    name = (filename or "").lower()
    is_pdf = (content_type == "application/pdf") or name.endswith(".pdf")

    png = _pdf_to_png(data) if is_pdf else _image_to_png(data)
    return _png_to_base64(png)
