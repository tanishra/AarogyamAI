import asyncio
import logging
from typing import Any

from agent_worker.agent.tools.base import BaseTool, ToolResult

logger = logging.getLogger(__name__)


class LLMTool(BaseTool):
    """
    Model-agnostic LLM caller.
    Provider is chosen via config — never hardcoded.

    Supports: anthropic | openai | bedrock
    Handles: timeout, retry (up to max_retries), structured output parsing.

    Input:
        {
            "system_prompt": str,
            "user_prompt": str,
            "max_tokens": int       — optional, default from config
        }

    Output (on success):
        {
            "text": str,            — raw LLM response text
            "provider": str,        — which provider was used
            "model": str,           — which model was used
            "attempts": int         — how many attempts were needed
        }
    """

    def __init__(
        self,
        provider: str,
        model_id: str,
        api_key: str,
        timeout_seconds: int = 20,
        max_retries: int = 2,
        max_tokens: int = 1000,
    ) -> None:
        self._provider = provider
        self._model_id = model_id
        self._api_key = api_key
        self._timeout = timeout_seconds
        self._max_retries = max_retries
        self._max_tokens = max_tokens

    @property
    def name(self) -> str:
        return "LLMTool"

    async def run(self, input_data: dict[str, Any]) -> ToolResult:
        system_prompt: str | None = input_data.get("system_prompt")
        user_prompt: str | None = input_data.get("user_prompt")
        max_tokens: int = input_data.get("max_tokens", self._max_tokens)

        if not system_prompt or not user_prompt:
            return ToolResult.fail(
                error="LLMTool: system_prompt and user_prompt are required",
            )

        last_error: str = ""
        for attempt in range(1, self._max_retries + 2):
            try:
                text = await asyncio.wait_for(
                    self._call_provider(
                        system_prompt=system_prompt,
                        user_prompt=user_prompt,
                        max_tokens=max_tokens,
                    ),
                    timeout=self._timeout,
                )
                logger.info(
                    "LLM call succeeded",
                    extra={
                        "provider": self._provider,
                        "model": self._model_id,
                        "attempt": attempt,
                    },
                )
                return ToolResult.ok(
                    output={
                        "text": text,
                        "provider": self._provider,
                        "model": self._model_id,
                        "attempts": attempt,
                    },
                    metadata={"attempt": attempt},
                )

            except asyncio.TimeoutError:
                last_error = (
                    f"LLM timeout after {self._timeout}s "
                    f"(attempt {attempt})"
                )
                logger.warning(last_error)

            except Exception as exc:
                last_error = f"LLM error on attempt {attempt}: {exc}"
                logger.warning(last_error)

            # Wait before retry — exponential backoff
            if attempt <= self._max_retries:
                await asyncio.sleep(2 ** (attempt - 1))

        logger.error(
            "LLM call failed after all retries",
            extra={
                "provider": self._provider,
                "attempts": self._max_retries + 1,
                "last_error": last_error,
            },
        )
        return ToolResult.fail(error=last_error)

    async def _call_provider(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
    ) -> str:
        """
        Dispatch to the configured provider.
        Adding a new provider = add one elif here + install SDK.
        Everything else in the system stays the same.
        """
        if self._provider == "anthropic":
            return await self._call_anthropic(
                system_prompt, user_prompt, max_tokens
            )
        elif self._provider == "openai":
            return await self._call_openai(
                system_prompt, user_prompt, max_tokens
            )
        elif self._provider == "bedrock":
            return await self._call_bedrock(
                system_prompt, user_prompt, max_tokens
            )
        else:
            raise ValueError(f"Unknown LLM provider: {self._provider}")

    async def _call_anthropic(
        self, system_prompt: str, user_prompt: str, max_tokens: int
    ) -> str:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=self._api_key)
        message = await client.messages.create(
            model=self._model_id,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return message.content[0].text

    async def _call_openai(
        self, system_prompt: str, user_prompt: str, max_tokens: int
    ) -> str:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self._api_key)
        response = await client.chat.completions.create(
            model=self._model_id,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        return response.choices[0].message.content or ""

    async def _call_bedrock(
        self, system_prompt: str, user_prompt: str, max_tokens: int
    ) -> str:
        import json
        import boto3

        client = boto3.client("bedrock-runtime", region_name="ap-south-1")
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        })
        response = client.invoke_model(
            modelId=self._model_id,
            body=body,
        )
        result = json.loads(response["body"].read())
        return result["content"][0]["text"]