import mimetypes
import os
import secrets
import uuid
from pathlib import Path

from authlib.integrations.starlette_client import OAuth
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from . import db
from .auth import AuthError, create_user, get_or_create_google_user, seed_legacy_users_from_env, verify_password
from .extraction import ExtractionError, extract_invoice
from .models import CategoryCreate, FolderCreate, InvoiceUpdate

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
UPLOAD_DIR = BASE_DIR / "uploads"

ALLOWED_MEDIA_TYPES = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
SECRET_KEY = os.environ.get("SECRET_KEY") or secrets.token_hex(32)

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
GOOGLE_ENABLED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

oauth = OAuth()
if GOOGLE_ENABLED:
    oauth.register(
        name="google",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

app = FastAPI(title="Faktury")
app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    session_cookie="invoice_session",
    max_age=14 * 24 * 60 * 60,
    same_site="lax",
    https_only=False,
)


@app.on_event("startup")
def on_startup():
    db.init_db()
    seed_legacy_users_from_env()
    for email in db.list_all_user_emails():
        db.seed_default_categories(email)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def current_user(request: Request) -> str | None:
    return request.session.get("user")


def require_login(request: Request) -> str:
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Nepřihlášeno.")
    return user


def _set_session_user(request: Request, user: dict) -> None:
    request.session["user"] = user["email"]
    request.session["display_name"] = user["display_name"]


@app.get("/login")
def login_page():
    return FileResponse(TEMPLATES_DIR / "login.html")


@app.get("/register")
def register_page():
    return FileResponse(TEMPLATES_DIR / "register.html")


@app.get("/api/config")
def get_config():
    return {"google_enabled": GOOGLE_ENABLED}


@app.post("/api/register")
async def register(request: Request):
    data = await request.json()
    try:
        user = create_user(
            email=str(data.get("email") or ""),
            password=str(data.get("password") or ""),
            display_name=str(data.get("display_name") or "") or None,
        )
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _set_session_user(request, user)
    return user


@app.post("/api/login")
async def login(request: Request):
    data = await request.json()
    email = str(data.get("email") or data.get("username") or "")
    password = str(data.get("password") or "")
    try:
        user = verify_password(email, password)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    _set_session_user(request, user)
    return user


@app.post("/api/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/me")
def me(request: Request, user: str = Depends(require_login)):
    return {"email": user, "display_name": request.session.get("display_name") or user}


@app.get("/auth/google/login")
async def google_login(request: Request):
    if not GOOGLE_ENABLED:
        raise HTTPException(status_code=503, detail="Přihlášení přes Google zatím není nastavené.")
    redirect_uri = request.url_for("google_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@app.get("/auth/google/callback")
async def google_callback(request: Request):
    if not GOOGLE_ENABLED:
        raise HTTPException(status_code=503, detail="Přihlášení přes Google zatím není nastavené.")
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo") or await oauth.google.userinfo(token=token)
    user = get_or_create_google_user(
        google_sub=userinfo["sub"],
        email=userinfo["email"],
        display_name=userinfo.get("name"),
    )
    _set_session_user(request, user)
    return RedirectResponse("/")


@app.get("/")
def index(request: Request):
    if not current_user(request):
        return RedirectResponse("/login")
    return FileResponse(TEMPLATES_DIR / "index.html")


@app.get("/api/categories")
def get_categories(user: str = Depends(require_login)):
    return db.list_categories(user)


@app.post("/api/categories")
def add_category(payload: CategoryCreate, user: str = Depends(require_login)):
    try:
        name = db.create_category(user, payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"name": name}


@app.delete("/api/categories/{name}")
def remove_category(name: str, user: str = Depends(require_login)):
    if not db.delete_category(user, name):
        raise HTTPException(status_code=404, detail="Kategorie nenalezena.")
    return {"ok": True}


@app.get("/api/folders")
def get_folders(user: str = Depends(require_login)):
    return db.list_folders(user)


@app.post("/api/folders")
def add_folder(payload: FolderCreate, user: str = Depends(require_login)):
    try:
        return db.create_folder(user, payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/api/folders/{folder_id}")
def rename_folder_endpoint(folder_id: int, payload: FolderCreate, user: str = Depends(require_login)):
    try:
        folder = db.rename_folder(folder_id, user, payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not folder:
        raise HTTPException(status_code=404, detail="Složka nenalezena.")
    return folder


@app.delete("/api/folders/{folder_id}")
def remove_folder(folder_id: int, user: str = Depends(require_login)):
    if not db.delete_folder(folder_id, user):
        raise HTTPException(status_code=404, detail="Složka nenalezena.")
    return {"ok": True}


def _resolve_media_type(file: UploadFile) -> str:
    media_type = file.content_type
    if media_type not in ALLOWED_MEDIA_TYPES:
        guessed, _ = mimetypes.guess_type(file.filename or "")
        media_type = guessed
    if media_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Nepodporovaný typ souboru. Nahrajte PDF, PNG, JPG, WEBP nebo GIF.",
        )
    return media_type


@app.post("/api/invoices")
async def upload_invoice(
    file: UploadFile = File(...),
    folder_id: int | None = Form(default=None),
    user: str = Depends(require_login),
):
    media_type = _resolve_media_type(file)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Nahraný soubor je prázdný.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Soubor je příliš velký (max 15 MB).")

    categories = db.list_categories(user)
    try:
        extracted = extract_invoice(content, media_type, categories)
    except ExtractionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    ext = ALLOWED_MEDIA_TYPES[media_type]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = UPLOAD_DIR / stored_name
    stored_path.write_bytes(content)

    record = db.insert_invoice(
        {
            "filename": file.filename or stored_name,
            "stored_path": str(stored_path.relative_to(BASE_DIR)),
            "vendor": extracted.get("vendor") or "Neznámý dodavatel",
            "invoice_number": extracted.get("invoice_number"),
            "issue_date": extracted.get("issue_date"),
            "due_date": extracted.get("due_date"),
            "amount_total": extracted.get("amount_total") or 0,
            "currency": extracted.get("currency") or "CZK",
            "category": extracted.get("category") or (categories[0] if categories else "Ostatní"),
            "items": extracted.get("items") or [],
            "raw_extraction": extracted,
            "folder_id": folder_id,
        },
        owner_email=user,
    )
    return record


@app.get("/api/invoices")
def get_invoices(
    vendor: str | None = None,
    category: str | None = None,
    payment_status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    q: str | None = None,
    folder_id: str | None = None,
    user: str = Depends(require_login),
):
    parsed_folder_id: int | str | None = folder_id
    if folder_id and folder_id != "none":
        parsed_folder_id = int(folder_id)
    return db.list_invoices(
        owner_email=user,
        vendor=vendor,
        category=category,
        payment_status=payment_status,
        date_from=date_from,
        date_to=date_to,
        q=q,
        folder_id=parsed_folder_id,
    )


@app.get("/api/invoices/{invoice_id}")
def get_invoice(invoice_id: int, user: str = Depends(require_login)):
    record = db.get_invoice(invoice_id, owner_email=user)
    if not record:
        raise HTTPException(status_code=404, detail="Faktura nenalezena.")
    return record


@app.get("/api/invoices/{invoice_id}/file")
def get_invoice_file(invoice_id: int, user: str = Depends(require_login)):
    record = db.get_invoice(invoice_id, owner_email=user)
    if not record:
        raise HTTPException(status_code=404, detail="Faktura nenalezena.")
    path = BASE_DIR / record["stored_path"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Soubor faktury chybí na disku.")
    return FileResponse(path, filename=record["filename"])


@app.patch("/api/invoices/{invoice_id}")
def patch_invoice(invoice_id: int, payload: InvoiceUpdate, user: str = Depends(require_login)):
    record = db.update_invoice(invoice_id, payload.model_dump(exclude_unset=True), owner_email=user)
    if not record:
        raise HTTPException(status_code=404, detail="Faktura nenalezena.")
    return record


@app.delete("/api/invoices/{invoice_id}")
def remove_invoice(invoice_id: int, user: str = Depends(require_login)):
    stored_path = db.delete_invoice(invoice_id, owner_email=user)
    if stored_path is None:
        raise HTTPException(status_code=404, detail="Faktura nenalezena.")
    path = BASE_DIR / stored_path
    if path.exists():
        path.unlink()
    return {"ok": True}


@app.get("/api/summary")
def get_summary(
    date_from: str | None = None,
    date_to: str | None = None,
    folder_id: str | None = None,
    user: str = Depends(require_login),
):
    parsed_folder_id: int | str | None = folder_id
    if folder_id and folder_id != "none":
        parsed_folder_id = int(folder_id)
    return db.summary(owner_email=user, date_from=date_from, date_to=date_to, folder_id=parsed_folder_id)
