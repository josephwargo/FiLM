from typing import AsyncGenerator, List

from .base import LLMService, build_chat_messages

try:
    import anthropic
except ImportError:
    anthropic = None

MAX_TOKENS = 8192


class AnthropicService(LLMService):
    def __init__(self, model_name: str, api_key: str):
        if anthropic is None:
            raise RuntimeError("The 'anthropic' package is not installed (pip install anthropic)")
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model_name = model_name

    def _kwargs(self, message, history, context, system_prompt):
        kwargs = {
            "model": self.model_name,
            "max_tokens": MAX_TOKENS,
            "messages": build_chat_messages(message, history, context),
        }
        if system_prompt:
            kwargs["system"] = system_prompt
        return kwargs

    def generate_response(
        self,
        message: str,
        history: List[dict] = None,
        context: str = None,
        system_prompt: str = None,
    ) -> str:
        response = self.client.messages.create(**self._kwargs(message, history, context, system_prompt))
        return "".join(block.text for block in response.content if block.type == "text")

    async def generate_response_stream(
        self,
        message: str,
        history: List[dict] = None,
        context: str = None,
        system_prompt: str = None,
    ) -> AsyncGenerator[str, None]:
        with self.client.messages.stream(**self._kwargs(message, history, context, system_prompt)) as stream:
            for text in stream.text_stream:
                yield text
