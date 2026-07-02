from typing import AsyncGenerator, List

from .base import LLMService, build_chat_messages

try:
    import openai
except ImportError:
    openai = None


class OpenAIService(LLMService):
    def __init__(self, model_name: str, api_key: str):
        if openai is None:
            raise RuntimeError("The 'openai' package is not installed (pip install openai)")
        self.client = openai.OpenAI(api_key=api_key)
        self.model_name = model_name

    def _messages(self, message, history, context, system_prompt):
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.extend(build_chat_messages(message, history, context))
        return messages

    def generate_response(
        self,
        message: str,
        history: List[dict] = None,
        context: str = None,
        system_prompt: str = None,
    ) -> str:
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=self._messages(message, history, context, system_prompt),
        )
        return response.choices[0].message.content or ""

    async def generate_response_stream(
        self,
        message: str,
        history: List[dict] = None,
        context: str = None,
        system_prompt: str = None,
    ) -> AsyncGenerator[str, None]:
        stream = self.client.chat.completions.create(
            model=self.model_name,
            messages=self._messages(message, history, context, system_prompt),
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta
