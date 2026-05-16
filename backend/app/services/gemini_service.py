import os
from typing import List, AsyncGenerator
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


class GeminiService:
    def __init__(self):
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        self.model_name = "gemini-2.0-flash"

    def generate_response(
        self,
        message: str,
        history: List[dict] = None,
        context: str = None,
        system_prompt: str = None,
    ) -> str:
        chat_history = []
        if history:
            for msg in history:
                role = "user" if msg["role"] == "user" else "model"
                chat_history.append(
                    types.Content(role=role, parts=[types.Part(text=msg["content"])])
                )

        prompt = message
        if context:
            prompt = f"""Use the following context to help answer the question:

<context>
{context}
</context>

User question: {message}"""

        config = types.GenerateContentConfig(system_instruction=system_prompt) if system_prompt else None
        chat = self.client.chats.create(model=self.model_name, history=chat_history, config=config)
        response = chat.send_message(prompt)

        return response.text

    async def generate_response_stream(
        self,
        message: str,
        history: List[dict] = None,
        context: str = None,
        system_prompt: str = None,
    ) -> AsyncGenerator[str, None]:
        chat_history = []
        if history:
            for msg in history:
                role = "user" if msg["role"] == "user" else "model"
                chat_history.append(
                    types.Content(role=role, parts=[types.Part(text=msg["content"])])
                )

        prompt = message
        if context:
            prompt = f"""Use the following context to help answer the question:

<context>
{context}
</context>

User question: {message}"""

        config = types.GenerateContentConfig(system_instruction=system_prompt) if system_prompt else None
        chat = self.client.chats.create(model=self.model_name, history=chat_history, config=config)
        response = chat.send_message_stream(prompt)

        for chunk in response:
            if chunk.text:
                yield chunk.text


gemini_service = GeminiService()
