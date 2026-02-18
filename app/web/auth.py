"""Telegram WebApp initData HMAC-SHA256 validation.

Implements the verification algorithm described in the
Telegram Bot API documentation for Mini Apps.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs, unquote

from app.config.settings import settings


class AuthError(Exception):
    """Raised when initData validation fails."""


def validate_init_data(init_data: str, max_age_seconds: int = 86400) -> dict:
    """Validate Telegram WebApp ``initData`` string.

    Parameters
    ----------
    init_data:
        The raw ``initData`` query string from the WebApp.
    max_age_seconds:
        Maximum allowed age of the auth_date (default 24 h).

    Returns
    -------
    dict
        Parsed user data from the ``user`` field.

    Raises
    ------
    AuthError
        If validation fails (bad hash, expired, etc.).
    """
    parsed = parse_qs(init_data, keep_blank_values=True)

    # Extract hash
    received_hash = parsed.pop("hash", [None])[0]
    if not received_hash:
        raise AuthError("Missing hash in initData")

    # Build the data-check-string (sorted key=value pairs)
    data_check_pairs = sorted(
        f"{k}={unquote(v[0])}" for k, v in parsed.items()
    )
    data_check_string = "\n".join(data_check_pairs)

    # Compute HMAC-SHA256
    secret_key = hmac.new(
        b"WebAppData",
        settings.hmac_secret.encode(),
        hashlib.sha256,
    ).digest()

    computed_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise AuthError("Invalid hash — data may have been tampered with")

    # Check auth_date freshness
    auth_date_str = parsed.get("auth_date", [None])[0]
    if auth_date_str:
        auth_date = int(auth_date_str)
        if time.time() - auth_date > max_age_seconds:
            raise AuthError("initData is too old")

    # Parse and return user info
    user_str = parsed.get("user", [None])[0]
    if user_str:
        return json.loads(unquote(user_str))

    raise AuthError("No user data in initData")
