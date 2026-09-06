from __future__ import annotations

import json
import re
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .config import Settings
from .prompts import load_prompt

ModelT = TypeVar("ModelT", bound=BaseModel)


class AnthropicService:
    endpoint = "https://api.anthropic.com/v1/messages"

    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY is required for LLM stages")
        self.api_key = settings.anthropic_api_key
        self.client = client

    async def structured(self, prompt_name: str, model: str, input_text: str, output_model: type[ModelT]) -> ModelT:
        prompt = load_prompt(prompt_name)
        validation_error: str | None = None
        for _ in range(2):
            suffix = f"\nPrevious validation error: {validation_error}" if validation_error else ""
            response = await self.client.post(self.endpoint, headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}, json={"model": model, "max_tokens": 4096, "system": prompt, "messages": [{"role": "user", "content": f"<input>{input_text}</input>{suffix}\nReturn JSON only."}]})
            response.raise_for_status()
            body = response.json()
            text = self._text(body)
            try:
                return output_model.model_validate(json.loads(text))
            except (json.JSONDecodeError, ValidationError) as error:
                validation_error = str(error)
        raise ValueError(f"LLM output failed validation after one retry: {validation_error}")

    @staticmethod
    def _text(payload: object) -> str:
        if not isinstance(payload, dict):
            raise ValueError("Anthropic response is not an object")
        content = payload.get("content")
        if not isinstance(content, list):
            raise ValueError("Anthropic response has no content array")
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str):
                return re.sub(r"^```(?:json)?\s*|\s*```$", "", block["text"].strip())
        raise ValueError("Anthropic response contains no text block")
