from docling.document_converter import DocumentConverter

def test_docling():
    converter = DocumentConverter()
    pdf_path = "../Source/documents/DOC-001.pdf"
    print(f"Converting {pdf_path} using Docling...")
    result = converter.convert(pdf_path)
    print("Conversion successful.")
    
    markdown_text = result.document.export_to_markdown()
    print("--- Extracted Markdown ---")
    print(markdown_text[:500])
    print("--------------------------")

if __name__ == "__main__":
    test_docling()
