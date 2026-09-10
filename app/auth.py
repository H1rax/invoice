import os
import re
import sqlite3
from datetime import datetime, timezone

import bcrypt

from . import db

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AuthError(Exception):
    pass


def normalize_email(value: str) -> str:
    return value.strip().lower()


def _row_to_user(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "display_name": row["display_name"] or row["email"].split("@")[0],
    }


def create_user(email: str, password: str, display_name: str | None = None) -> dict:
    email = normalize_email(email or "")
    password = password or ""
    if not EMAIL_RE.match(email):
        raise AuthError("Zadejte platnou e-mailovou adresu.")
    if len(password) < 8:
        raise AuthError("Heslo musí mít alespoň 8 znaků.")

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    now = datetime.now(timezone.utc).isoformat()

    with db.get_connection() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise AuthError("Účet s tímto e-mailem už existuje. Zkuste se přihlásit.")
        cur = conn.execute(
            """
            INSERT INTO users (email, display_name, password_hash, google_sub, created_at)
            VALUES (?, ?, ?, NULL, ?)
            """,
            (email, (display_name or "").strip() or None, password_hash, now),
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    user = _row_to_user(row)
    db.seed_default_categories(user["email"])
    return user


def verify_password(email: str, password: str) -> dict:
    email = normalize_email(email or "")
    password = password or ""
    with db.get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not row["password_hash"]:
        raise AuthError("Neplatný e-mail nebo heslo.")
    if not bcrypt.checkpw(password.encode("utf-8"), row["password_hash"].encode("utf-8")):
        raise AuthError("Neplatný e-mail nebo heslo.")
    return _row_to_user(row)


def get_or_create_google_user(google_sub: str, email: str, display_name: str | None) -> dict:
    email = normalize_email(email or "")
    now = datetime.now(timezone.utc).isoformat()

    with db.get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE google_sub = ?", (google_sub,)).fetchone()
        if row:
            return _row_to_user(row)

        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            conn.execute("UPDATE users SET google_sub = ? WHERE id = ?", (google_sub, row["id"]))
            row = conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
            return _row_to_user(row)

        cur = conn.execute(
            """
            INSERT INTO users (email, display_name, password_hash, google_sub, created_at)
            VALUES (?, ?, NULL, ?, ?)
            """,
            (email, display_name, google_sub, now),
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    user = _row_to_user(row)
    db.seed_default_categories(user["email"])
    return user


def seed_legacy_users_from_env() -> None:
    """One-time migration: accounts previously configured via APP_USERS in .env
    become real database accounts, so existing credentials keep working."""
    raw = os.environ.get("APP_USERS", "")
    now = datetime.now(timezone.utc).isoformat()
    newly_created: list[str] = []
    with db.get_connection() as conn:
        for pair in raw.split(","):
            pair = pair.strip()
            if not pair or ":" not in pair:
                continue
            name, _, password = pair.partition(":")
            name = name.strip()
            if not name or not password:
                continue
            existing = conn.execute("SELECT id FROM users WHERE email = ?", (name,)).fetchone()
            if existing:
                continue
            password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            conn.execute(
                """
                INSERT INTO users (email, display_name, password_hash, google_sub, created_at)
                VALUES (?, ?, ?, NULL, ?)
                """,
                (name, name, password_hash, now),
            )
            newly_created.append(name)
    for name in newly_created:
        db.seed_default_categories(name)
