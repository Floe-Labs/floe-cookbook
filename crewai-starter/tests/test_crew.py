"""Exercise the starter's real CrewAI wiring without contacting external providers."""

import asyncio
import importlib.util
from pathlib import Path
from types import ModuleType
from unittest.mock import AsyncMock, Mock

import pytest


@pytest.fixture
def starter(monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-offline-test")
    monkeypatch.setenv("CREWAI_TELEMETRY_DISABLED", "true")
    monkeypatch.setenv("OTEL_SDK_DISABLED", "true")
    monkeypatch.setenv("LITELLM_LOCAL_MODEL_COST_MAP", "True")
    # dotenv must not load a developer's credentials during an offline test.
    monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **k: None)
    import litellm

    monkeypatch.setattr(litellm, "callbacks", [])
    spec = importlib.util.spec_from_file_location(
        "starter_crew", Path(__file__).resolve().parents[1] / "crew.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_both_agents_refuse_provider_dispatch_at_zero_budget(
    starter: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from crewai import LLM
    from floe_guard import BudgetExceeded, BudgetGuard

    provider = Mock(side_effect=AssertionError("provider must not run"))
    monkeypatch.setattr(LLM, "call", provider)
    crew = starter.build_crew(BudgetGuard(limit_usd=0))
    for agent in crew.agents:
        with pytest.raises(BudgetExceeded):
            agent.llm.call("hello")
    provider.assert_not_called()


def test_agents_share_budget_and_stop_after_spend(
    starter: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from crewai import LLM
    from floe_guard import BudgetExceeded, BudgetGuard

    provider = Mock(return_value="offline response")
    monkeypatch.setattr(LLM, "call", provider)
    guard = BudgetGuard(limit_usd=1)
    crew = starter.build_crew(guard)
    assert crew.agents[0].llm.call("hello") == "offline response"
    guard.record_tool("synthetic-spend", 1)
    with pytest.raises(BudgetExceeded):
        crew.agents[1].llm.call("hello")
    assert provider.call_count == 1


def test_async_dispatch_is_also_blocked(
    starter: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from crewai import LLM
    from floe_guard import BudgetExceeded, BudgetGuard

    provider = AsyncMock(side_effect=AssertionError("provider must not run"))
    monkeypatch.setattr(LLM, "acall", provider)
    crew = starter.build_crew(BudgetGuard(limit_usd=0))
    with pytest.raises(BudgetExceeded):
        asyncio.run(crew.agents[0].llm.acall("hello"))
    provider.assert_not_called()


def test_kickoff_propagates_budget_failure_without_provider_dispatch(
    starter: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from crewai import LLM
    from floe_guard import BudgetExceeded, BudgetGuard

    provider = Mock(side_effect=AssertionError("provider must not run"))
    monkeypatch.setattr(LLM, "call", provider)
    crew = starter.build_crew(BudgetGuard(limit_usd=0))
    with pytest.raises(BudgetExceeded):
        crew.kickoff()
    provider.assert_not_called()


def test_successful_http_usage_is_metered_before_the_next_agent_call(
    starter: ModuleType,
) -> None:
    """Use the real LLM client and callbacks against a loopback HTTP fixture."""
    import json
    import time
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from threading import Thread

    from floe_guard import BudgetExceeded, BudgetGuard
    from floe_guard.pricing import ManualPrice

    requests = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _format: str, *_args: object) -> None:
            pass

        def do_POST(self) -> None:
            self.rfile.read(int(self.headers.get("Content-Length", "0")))
            requests.append(self.path)
            payload = json.dumps(
                {
                    "id": "chatcmpl-local",
                    "object": "chat.completion",
                    "created": 1,
                    "model": "gpt-4o",
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": "local response",
                            },
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 1000,
                        "completion_tokens": 1000,
                        "total_tokens": 2000,
                    },
                }
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        guard = BudgetGuard(
            limit_usd=0.0125,
            price_overrides={"gpt-4o": ManualPrice(0.0000025, 0.00001)},
        )
        crew = starter.build_crew(guard)
        url = f"http://127.0.0.1:{server.server_port}/v1"
        for agent in crew.agents:
            agent.llm.base_url = url
            agent.llm.api_base = url
            agent.llm.timeout = 10
        messages = [{"role": "user", "content": "hello"}]
        assert crew.agents[0].llm.call(messages) == "local response"
        # LiteLLM may deliver successful-usage callbacks on its worker thread.
        deadline = time.monotonic() + 5
        while guard.spent_usd == 0 and time.monotonic() < deadline:
            time.sleep(0.01)
        assert guard.spent_usd == pytest.approx(0.0125)
        with pytest.raises(BudgetExceeded):
            crew.agents[1].llm.call(messages)
        assert requests == ["/v1/chat/completions"]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
