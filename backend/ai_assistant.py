"""In-app AI assistant — OpenAI when configured, FAQ fallback otherwise."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from assistant_knowledge import build_system_prompt, faq_fallback
from deps import get_current_user, requires_feature
from platform_db import get_tenant_by_slug, normalize_features

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1, max_length=20)
    lang: Optional[str] = "auto"
    page_context: Optional[str] = None


def _resolve_lang(req_lang: str | None, user: dict) -> str:
    if req_lang in ("ar", "en"):
        return req_lang
    return "ar"


def _tenant_features(user: dict) -> list[str]:
    slug = user.get("tenant_slug")
    if not slug:
        return []
    tenant = get_tenant_by_slug(slug)
    if not tenant:
        return []
    return normalize_features(tenant.get("features"))


def _call_openai(system: str, messages: list[dict]) -> str | None:
    key = os.getenv("OPENAI_API_KEY") or os.getenv("AI_API_KEY")
    if not key:
        return None
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    base = (os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system}] + messages,
        "max_tokens": int(os.getenv("OPENAI_MAX_TOKENS", "900")),
        "temperature": float(os.getenv("OPENAI_TEMPERATURE", "0.35")),
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip() or None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        raise HTTPException(status_code=502, detail=f"AI provider error: {body}")
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"AI service unreachable: {e}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/chat", dependencies=[Depends(requires_feature("ai_assistant"))])
def assistant_chat(body: ChatRequest, current_user=Depends(get_current_user)):
    lang = _resolve_lang(body.lang, current_user)
    features = _tenant_features(current_user)
    system = build_system_prompt(
        lang,
        features,
        current_user.get("role") or "user",
        (body.page_context or "").strip() or None,
    )

    history = [{"role": m.role, "content": m.content.strip()} for m in body.messages[-12:]]
    last_user = next((m["content"] for m in reversed(history) if m["role"] == "user"), "")

    from feature_access import user_feature_option
    use_openai = user_feature_option(current_user, "ai_assistant", "openai")
    reply = _call_openai(system, history) if use_openai else None
    source = "ai"
    if not reply:
        reply = faq_fallback(last_user, lang)
        source = "faq"

    return {"reply": reply, "source": source, "lang": lang}


@router.get("/status", dependencies=[Depends(requires_feature("ai_assistant"))])
def assistant_status(current_user=Depends(get_current_user)):
    from feature_access import user_feature_option
    has_key = bool(os.getenv("OPENAI_API_KEY") or os.getenv("AI_API_KEY"))
    openai_allowed = user_feature_option(current_user, "ai_assistant", "openai")
    ai_on = has_key and openai_allowed
    return {
        "ai_enabled": ai_on,
        "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini") if ai_on else None,
        "mode": "ai" if ai_on else "faq",
        "has_server_key": has_key,
        "openai_option_enabled": openai_allowed,
    }
