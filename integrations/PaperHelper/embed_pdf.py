from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from pypdf import PdfReader

import os
from local_embeddings import LocalHashEmbeddings

def embed_document(file_name, file_folder="pdf", embedding_folder="index"):
    file_path = f"{file_folder}/{file_name}"
    reader = PdfReader(file_path)
    source_pages = []
    for page_index, page in enumerate(reader.pages):
        source_pages.append(
            Document(
                page_content=page.extract_text() or "",
                metadata={
                    "source": file_name,
                    "page": page_index + 1,
                },
            )
        )

    embedding_func = LocalHashEmbeddings()
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=100,
        length_function=len,
        is_separator_regex=False,
        separators=["\n\n", "\n", " ", ""],
    )
    source_chunks = text_splitter.split_documents(source_pages)
    search_index = FAISS.from_documents(source_chunks, embedding_func)
    search_index.save_local(
        folder_path=embedding_folder, index_name=file_name + ".index"
    )


def embed_all_pdf_docs():
    pdf_directory = "pdf"

    if os.path.exists(pdf_directory):
        # List all PDF files in the directory
        pdf_files = [
            file for file in os.listdir(pdf_directory) if file.endswith(".pdf")
        ]

        if pdf_files:
            for pdf_file in pdf_files:
                print(f"Embedding {pdf_file}...")
                embed_document(file_name=pdf_file, file_folder=pdf_directory)
                print("Done!")
        else:
            raise Exception("No PDF files found in the directory.")
    else:
        raise Exception(f"Directory '{pdf_directory}' does not exist.")


def get_all_index_files():
    index_directory = "index"

    if os.path.exists(index_directory):
        postfix = ".index.faiss"
        index_files = [
            file.replace(postfix, "")
            for file in os.listdir(index_directory)
            if file.endswith(postfix)
        ]

        if index_files:
            return index_files
        else:
            raise Exception("No index files found in the directory.")
    else:
        raise Exception(f"Directory '{index_directory}' does not exist.")
