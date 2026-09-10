import json
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "invoices.db"

DEFAULT_CATEGORIES = ["Kancelář", "IT", "Doprava", "Marketing", "Energie", "Nájem", "Ostatní"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_email TEXT NOT NULL DEFAULT '',
    folder_id INTEGER,
    filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    vendor TEXT NOT NULL,
    invoice_number TEXT,
    issue_date TEXT,
    due_date TEXT,
    amount_total REAL NOT NULL,
    currency TEXT NOT NULL,
    category TEXT NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'neuhrazeno',
    items_json TEXT,
    raw_extraction_json TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    password_hash TEXT,
    google_sub TEXT UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_email TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(owner_email, name)
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_email TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(owner_email, name)
);
"""


@contextmanager
def get_connection():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(invoices)")}
    if "owner_email" not in columns:
        conn.execute("ALTER TABLE invoices ADD COLUMN owner_email TEXT NOT NULL DEFAULT ''")
    if "folder_id" not in columns:
        conn.execute("ALTER TABLE invoices ADD COLUMN folder_id INTEGER")


def init_db():
    with get_connection() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["items"] = json.loads(d.pop("items_json") or "[]")
    d.pop("raw_extraction_json", None)
    d["display_status"] = _display_status(d["payment_status"], d.get("due_date"))
    return d


def _display_status(payment_status: str, due_date: str | None) -> str:
    if payment_status == "uhrazeno":
        return "uhrazeno"
    if due_date:
        try:
            if datetime.strptime(due_date, "%Y-%m-%d").date() < date.today():
                return "po splatnosti"
        except ValueError:
            pass
    return "neuhrazeno"


def insert_invoice(data: dict, owner_email: str) -> dict:
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO invoices (
                owner_email, folder_id, filename, stored_path, vendor, invoice_number, issue_date, due_date,
                amount_total, currency, category, payment_status, items_json,
                raw_extraction_json, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                owner_email,
                data.get("folder_id"),
                data["filename"],
                data["stored_path"],
                data["vendor"],
                data.get("invoice_number"),
                data.get("issue_date"),
                data.get("due_date"),
                data["amount_total"],
                data["currency"],
                data["category"],
                data.get("payment_status", "neuhrazeno"),
                json.dumps(data.get("items", []), ensure_ascii=False),
                json.dumps(data.get("raw_extraction", {}), ensure_ascii=False),
                data.get("notes"),
                now,
                now,
            ),
        )
        invoice_id = cur.lastrowid
        row = conn.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
        return _row_to_dict(row)


def list_invoices(owner_email: str, vendor: str | None = None, category: str | None = None,
                   payment_status: str | None = None, date_from: str | None = None,
                   date_to: str | None = None, q: str | None = None,
                   folder_id: int | str | None = None) -> list[dict]:
    clauses = ["owner_email = ?"]
    params: list = [owner_email]
    if vendor:
        clauses.append("vendor = ?")
        params.append(vendor)
    if category:
        clauses.append("category = ?")
        params.append(category)
    if date_from:
        clauses.append("issue_date >= ?")
        params.append(date_from)
    if date_to:
        clauses.append("issue_date <= ?")
        params.append(date_to)
    if q:
        clauses.append("(vendor LIKE ? OR invoice_number LIKE ? OR notes LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like, like])
    if folder_id == "none":
        clauses.append("folder_id IS NULL")
    elif folder_id is not None:
        clauses.append("folder_id = ?")
        params.append(folder_id)

    where = f"WHERE {' AND '.join(clauses)}"
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM invoices {where} ORDER BY issue_date DESC, id DESC", params
        ).fetchall()

    results = [_row_to_dict(r) for r in rows]
    if payment_status:
        results = [r for r in results if r["display_status"] == payment_status]
    return results


def get_invoice(invoice_id: int, owner_email: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM invoices WHERE id = ? AND owner_email = ?", (invoice_id, owner_email)
        ).fetchone()
    return _row_to_dict(row) if row else None


ALLOWED_UPDATE_FIELDS = {
    "vendor", "invoice_number", "issue_date", "due_date", "amount_total",
    "currency", "category", "payment_status", "notes", "folder_id",
}


def update_invoice(invoice_id: int, fields: dict, owner_email: str) -> dict | None:
    fields = {
        k: v for k, v in fields.items()
        if k in ALLOWED_UPDATE_FIELDS and (v is not None or k == "folder_id")
    }
    if not get_invoice(invoice_id, owner_email):
        return None
    if not fields:
        return get_invoice(invoice_id, owner_email)
    fields["updated_at"] = datetime.utcnow().isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE invoices SET {set_clause} WHERE id = ? AND owner_email = ?",
            (*fields.values(), invoice_id, owner_email),
        )
        row = conn.execute(
            "SELECT * FROM invoices WHERE id = ? AND owner_email = ?", (invoice_id, owner_email)
        ).fetchone()
    return _row_to_dict(row) if row else None


def delete_invoice(invoice_id: int, owner_email: str) -> str | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT stored_path FROM invoices WHERE id = ? AND owner_email = ?",
            (invoice_id, owner_email),
        ).fetchone()
        if not row:
            return None
        conn.execute("DELETE FROM invoices WHERE id = ? AND owner_email = ?", (invoice_id, owner_email))
        return row["stored_path"]


def summary(owner_email: str, date_from: str | None = None, date_to: str | None = None,
            folder_id: int | str | None = None) -> dict:
    all_invoices = list_invoices(owner_email, date_from=date_from, date_to=date_to, folder_id=folder_id)
    total_amount = sum(i["amount_total"] for i in all_invoices)
    by_vendor: dict[str, float] = {}
    by_category: dict[str, float] = {}
    by_month: dict[str, float] = {}
    by_status: dict[str, int] = {"uhrazeno": 0, "neuhrazeno": 0, "po splatnosti": 0}
    by_status_amount: dict[str, float] = {"uhrazeno": 0, "neuhrazeno": 0, "po splatnosti": 0}

    for inv in all_invoices:
        by_vendor[inv["vendor"]] = by_vendor.get(inv["vendor"], 0) + inv["amount_total"]
        by_category[inv["category"]] = by_category.get(inv["category"], 0) + inv["amount_total"]
        month = (inv["issue_date"] or "")[:7] or "neznámé"
        by_month[month] = by_month.get(month, 0) + inv["amount_total"]
        by_status[inv["display_status"]] = by_status.get(inv["display_status"], 0) + 1
        by_status_amount[inv["display_status"]] = by_status_amount.get(inv["display_status"], 0) + inv["amount_total"]

    return {
        "count": len(all_invoices),
        "total_amount": total_amount,
        "by_vendor": dict(sorted(by_vendor.items(), key=lambda kv: -kv[1])),
        "by_category": dict(sorted(by_category.items(), key=lambda kv: -kv[1])),
        "by_month": dict(sorted(by_month.items())),
        "by_status": by_status,
        "by_status_amount": by_status_amount,
    }


# ---------- folders ----------

def _folder_to_dict(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "name": row["name"]}


def list_folders(owner_email: str) -> dict:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM folders WHERE owner_email = ? ORDER BY name COLLATE NOCASE", (owner_email,)
        ).fetchall()
        counts = dict(
            conn.execute(
                "SELECT folder_id, COUNT(*) as c FROM invoices WHERE owner_email = ? GROUP BY folder_id",
                (owner_email,),
            ).fetchall()
        )
    folders = [_folder_to_dict(r) for r in rows]
    for f in folders:
        f["count"] = counts.get(f["id"], 0)
    total_count = sum(counts.values())
    no_folder_count = counts.get(None, 0)
    return {"folders": folders, "total_count": total_count, "no_folder_count": no_folder_count}


def create_folder(owner_email: str, name: str) -> dict:
    name = name.strip()
    if not name:
        raise ValueError("Název složky nesmí být prázdný.")
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM folders WHERE owner_email = ? AND name = ?", (owner_email, name)
        ).fetchone()
        if existing:
            raise ValueError("Složka s tímto názvem už existuje.")
        cur = conn.execute(
            "INSERT INTO folders (owner_email, name, created_at) VALUES (?, ?, ?)",
            (owner_email, name, now),
        )
        row = conn.execute("SELECT * FROM folders WHERE id = ?", (cur.lastrowid,)).fetchone()
    d = _folder_to_dict(row)
    d["count"] = 0
    return d


def rename_folder(folder_id: int, owner_email: str, name: str) -> dict | None:
    name = name.strip()
    if not name:
        raise ValueError("Název složky nesmí být prázdný.")
    with get_connection() as conn:
        owned = conn.execute(
            "SELECT id FROM folders WHERE id = ? AND owner_email = ?", (folder_id, owner_email)
        ).fetchone()
        if not owned:
            return None
        conflict = conn.execute(
            "SELECT id FROM folders WHERE owner_email = ? AND name = ? AND id != ?",
            (owner_email, name, folder_id),
        ).fetchone()
        if conflict:
            raise ValueError("Složka s tímto názvem už existuje.")
        conn.execute("UPDATE folders SET name = ? WHERE id = ?", (name, folder_id))
        row = conn.execute("SELECT * FROM folders WHERE id = ?", (folder_id,)).fetchone()
    return _folder_to_dict(row)


def delete_folder(folder_id: int, owner_email: str) -> bool:
    with get_connection() as conn:
        owned = conn.execute(
            "SELECT id FROM folders WHERE id = ? AND owner_email = ?", (folder_id, owner_email)
        ).fetchone()
        if not owned:
            return False
        conn.execute(
            "UPDATE invoices SET folder_id = NULL WHERE folder_id = ? AND owner_email = ?",
            (folder_id, owner_email),
        )
        conn.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
    return True


def list_all_user_emails() -> list[str]:
    with get_connection() as conn:
        rows = conn.execute("SELECT email FROM users").fetchall()
    return [r["email"] for r in rows]


# ---------- categories ----------

def list_categories(owner_email: str) -> list[str]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT name FROM categories WHERE owner_email = ? ORDER BY name COLLATE NOCASE",
            (owner_email,),
        ).fetchall()
    return [r["name"] for r in rows]


def seed_default_categories(owner_email: str) -> None:
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT COUNT(*) as c FROM categories WHERE owner_email = ?", (owner_email,)
        ).fetchone()["c"]
        if existing:
            return
        conn.executemany(
            "INSERT OR IGNORE INTO categories (owner_email, name, created_at) VALUES (?, ?, ?)",
            [(owner_email, name, now) for name in DEFAULT_CATEGORIES],
        )


def create_category(owner_email: str, name: str) -> str:
    name = name.strip()
    if not name:
        raise ValueError("Název kategorie nesmí být prázdný.")
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM categories WHERE owner_email = ? AND name = ?", (owner_email, name)
        ).fetchone()
        if existing:
            raise ValueError("Tato kategorie už existuje.")
        conn.execute(
            "INSERT INTO categories (owner_email, name, created_at) VALUES (?, ?, ?)",
            (owner_email, name, now),
        )
    return name


def delete_category(owner_email: str, name: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM categories WHERE owner_email = ? AND name = ?", (owner_email, name)
        )
    return cur.rowcount > 0
