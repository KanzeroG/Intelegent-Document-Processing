import tempfile
import os
# from .extraction import extract_document_text

def extract_with_docling(raw: bytes, doc_type):
    document = None
    try:
        from docling.document_converter import DocumentConverter
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(raw)
            tmp_path = tmp.name
            
        try:
            converter = DocumentConverter()
            doc_result = converter.convert(tmp_path)
            markdown_text = doc_result.document.export_to_markdown()
            # document = extract_document_text(markdown_text, doc_type)
            print("Extracted markdown:")
            print(markdown_text[:500])
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
    except Exception as e:
        print(f"Docling extraction failed: {e}")
        
    return document
