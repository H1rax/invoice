# Faktury

Webová appka na správu faktur — nahraješ PDF nebo fotku/scan faktury a appka z ní pomocí Anthropic (Claude) API automaticky vytáhne dodavatele, číslo faktury, částku, datum splatnosti a další údaje. Faktury si pak můžeš třídit do složek a kategorií, filtrovat a mít přehled o výdajích.

## Funkce

- Nahrání faktury (PDF, PNG, JPG, WEBP, GIF) a automatická extrakce údajů pomocí AI
- Kategorie a složky pro třídění faktur
- Filtrování podle dodavatele, kategorie, stavu platby a data
- Přehled/souhrn výdajů
- Přihlášení přes e-mail a heslo, volitelně i přes Google

## Instalace

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Zkopíruj `.env.example` do `.env` a doplň hodnoty (minimálně `ANTHROPIC_API_KEY` a `SECRET_KEY`):

```bash
copy .env.example .env
```

## Spuštění

```bash
uvicorn app.main:app --reload
```

Appka poběží na `http://localhost:8000`.

## Technologie

FastAPI, SQLite, Anthropic API (Claude), Authlib (Google OAuth)
