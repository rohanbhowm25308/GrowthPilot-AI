"""
Thin wrapper around the Groq chat-completions API.

Every call is wrapped in try/except: if GROQ_API_KEY is missing, the network
is unreachable, or the API errors out, we fall back to a clearly-labelled
templated response instead of breaking the demo. `used_ai` in the response
tells the frontend which happened, so nothing is silently faked as "live AI"
when it wasn't.
"""
import os
import json
from groq import Groq

MODEL = "openai/gpt-oss-120b"

_api_key = os.environ.get("GROQ_API_KEY", "").strip()
_client = Groq(api_key=_api_key) if _api_key else None


def is_configured():
    return _client is not None


def chat(system_prompt: str, user_prompt: str, json_mode: bool = False, max_tokens: int = 700):
    """Returns (text_or_dict, used_ai: bool)."""
    if not _client:
        return None, False
    try:
        kwargs = dict(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.6,
        )
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        resp = _client.chat.completions.create(**kwargs)
        content = resp.choices[0].message.content
        if json_mode:
            try:
                return json.loads(content), True
            except json.JSONDecodeError:
                return None, False
        return content, True
    except Exception:
        return None, False
