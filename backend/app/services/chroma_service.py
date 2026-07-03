import os
from typing import List
from pathlib import Path
import chromadb
from dotenv import load_dotenv

# Get the backend directory
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BACKEND_DIR / ".env")

from ..models.database import DATA_DIR

DEFAULT_CHROMA_DIR = str(DATA_DIR / "chroma_data")
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", DEFAULT_CHROMA_DIR)


class ChromaService:
    def __init__(self):
        # Use the new persistent client API (ChromaDB 0.4+)
        self.client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
        self.collection = self.client.get_or_create_collection(
            name="film_embeddings",
            metadata={"hnsw:space": "cosine"}
        )

    def add_message(self, message_id: str, content: str, metadata: dict = None):
        """Add a message to the vector store."""
        try:
            self.collection.add(
                ids=[message_id],
                documents=[content],
                metadatas=[metadata or {}]
            )
        except Exception as e:
            # Handle duplicate ID errors gracefully
            if "already exists" in str(e).lower():
                pass
            else:
                raise

    def add_messages(self, ids: List[str], contents: List[str], metadatas: List[dict] = None):
        """Add multiple messages to the vector store."""
        self.collection.add(
            ids=ids,
            documents=contents,
            metadatas=metadatas or [{}] * len(ids)
        )

    def search(self, query: str, n_results: int = 5, filter_metadata: dict = None) -> List[dict]:
        """Search for similar content."""
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            where=filter_metadata
        )

        documents = []
        if results and results["documents"]:
            for i, doc in enumerate(results["documents"][0]):
                documents.append({
                    "id": results["ids"][0][i],
                    "content": doc,
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    "distance": results["distances"][0][i] if results["distances"] else None
                })

        return documents

    def get_chat_context(self, chat_ids: List[str]) -> str:
        """Get all messages from specific chats as context."""
        if not chat_ids:
            return ""

        try:
            results = self.collection.get(
                where={"chat_id": {"$in": chat_ids}}
            )

            if results and results["documents"]:
                return "\n\n".join(results["documents"])
        except Exception:
            pass
        return ""

    def delete_chat_messages(self, chat_id: str):
        """Delete all embeddings for a chat."""
        try:
            self.collection.delete(
                where={"chat_id": chat_id}
            )
        except Exception:
            pass

    def delete_message(self, message_id: str):
        """Delete a specific message embedding."""
        try:
            self.collection.delete(ids=[message_id])
        except Exception:
            pass

    def get_document_by_id(self, doc_id: str) -> str:
        """Get a document by its ID."""
        try:
            results = self.collection.get(ids=[doc_id])
            if results and results["documents"] and len(results["documents"]) > 0:
                return results["documents"][0]
        except Exception:
            pass
        return ""


chroma_service = ChromaService()
