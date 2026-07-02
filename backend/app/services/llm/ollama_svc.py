import json
from typing import AsyncGenerator, List

import httpx

from .base import LLMService, build_chat_messages

TIMEOUT = httpx.Timeout(300.0, connect=5.0)


class OllamaService(LLMService):
    def __init__(self, model_name: str, base_url: str):
        self.model_name = model_name
        self.base_url = base_url.rstrip("/")

    def _payload(self, message, history, context, system_prompt, stream):
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.extend(build_chat_messages(message, history, context))
        return {"model": self.model_name, "messages": messages, "stream": stream}

    def generate_response(
        self,
        message: str,
        history: List[dict] = None,
        context: str = None,
        system_prompt: str = None,
    ) -> str:
        r = httpx.post(
            f"{self.base_url}/api/chat",
            json=self._payload(message, history, context, system_prompt, stream=False),
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        return r.json()["message"]["content"]

    async def generate_response_stream(
        self,
        message: str,
        history: List[dict] = None,
        context: str = None,
        system_prompt: str = None,
    ) -> AsyncGenerator[str, None]:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json=self._payload(message, history, context, system_prompt, stream=True),
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    data = json.loads(line)
                    chunk = data.get("message", {}).get("content")
                    if chunk:
                        yield chunk
                    if data.get("done"):
                        break
