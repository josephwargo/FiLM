from typing import AsyncGenerator, List


def build_prompt(message: str, context: str = None) -> str:
    if not context:
        return message
    return f"""Use the following context to help answer the question:

<context>
{context}
</context>

User question: {message}"""


def build_chat_messages(message: str, history: List[dict] = None, context: str = None) -> List[dict]:
    """OpenAI-style message list (user/assistant roles) shared by the Anthropic, OpenAI, and Ollama adapters."""
    messages = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in (history or [])
    ]
    messages.append({"role": "user", "content": build_prompt(message, context)})
    return messages


class LLMService:
    """Provider adapter interface. One implementation per provider; instances are per-model."""

    def generate_response(
        self,
        message: str,
        history: List[dict] = None,
        context: str = None,
        system_prompt: str = None,
    ) -> str:
        raise NotImplementedError

    def generate_response_stream(
        self,
        message: str,
        history: List[dict] = None,
        context: str = None,
        system_prompt: str = None,
    ) -> AsyncGenerator[str, None]:
        raise NotImplementedError
