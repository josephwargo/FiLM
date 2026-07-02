from typing import AsyncGenerator, List

from google import genai
from google.genai import types

from .base import LLMService, build_prompt


def _build_history(history: List[dict] = None) -> List:
    chat_history = []
    if history:
        for msg in history:
            role = "user" if msg["role"] == "user" else "model"
            chat_history.append(
                types.Content(role=role, parts=[types.Part(text=msg["content"])])
            )
    return chat_history


class GeminiService(LLMService):
    def __init__(self, model_name: str, api_key: str):
        self.client = genai.Client(api_key=api_key)
        self.model_name = model_name

    def generate_response(
        self,
        message: str,
        history: List[dict] = None,
        context: str = None,
        system_prompt: str = None,
    ) -> str:
        config = types.GenerateContentConfig(system_instruction=system_prompt) if system_prompt else None
        chat = self.client.chats.create(model=self.model_name, history=_build_history(history), config=config)
        response = chat.send_message(build_prompt(message, context))
        return response.text

    async def generate_response_stream(
        self,
        message: str,
        history: List[dict] = None,
        context: str = None,
        system_prompt: str = None,
    ) -> AsyncGenerator[str, None]:
        config = types.GenerateContentConfig(system_instruction=system_prompt) if system_prompt else None
        chat = self.client.chats.create(model=self.model_name, history=_build_history(history), config=config)
        response = chat.send_message_stream(build_prompt(message, context))

        for chunk in response:
            if chunk.text:
                yield chunk.text
