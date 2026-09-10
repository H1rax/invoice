import base64
import os

from anthropic import Anthropic

MODEL = "claude-sonnet-5"


def _tool_schema(categories: list[str]) -> dict:
    return {
        "name": "record_invoice",
        "description": "Zaznamená strukturovaná data vyčtená z faktury.",
        "input_schema": {
            "type": "object",
            "properties": {
                "vendor": {
                    "type": "string",
                    "description": "Název dodavatele / vystavovatele faktury",
                },
                "invoice_number": {
                    "type": "string",
                    "description": "Číslo faktury nebo variabilní symbol, pokud je uvedeno",
                },
                "issue_date": {
                    "type": "string",
                    "description": "Datum vystavení ve formátu YYYY-MM-DD",
                },
                "due_date": {
                    "type": ["string", "null"],
                    "description": "Datum splatnosti ve formátu YYYY-MM-DD, nebo null pokud není uvedeno",
                },
                "amount_total": {
                    "type": "number",
                    "description": "Celková částka k úhradě včetně DPH, jako číslo bez symbolu měny",
                },
                "currency": {
                    "type": "string",
                    "description": "Měna jako ISO kód, např. CZK, EUR, USD",
                },
                "category": {
                    "type": "string",
                    "enum": categories,
                    "description": "Nejlépe odpovídající kategorie výdaje z nabízeného výčtu",
                },
                "items": {
                    "type": "array",
                    "description": "Položky rozepsané na faktuře, pokud existují",
                    "items": {
                        "type": "object",
                        "properties": {
                            "description": {"type": "string"},
                            "quantity": {"type": "number"},
                            "unit_price": {"type": "number"},
                            "total": {"type": "number"},
                        },
                        "required": ["description"],
                    },
                },
            },
            "required": ["vendor", "amount_total", "currency", "category"],
        },
    }

SYSTEM_PROMPT = (
    "Jsi asistent pro účetnictví. Z přiloženého dokumentu (faktura) přesně vyčti "
    "požadovaná strukturovaná data a zavolej nástroj record_invoice. Pokud si nejsi "
    "jistý hodnotou nebo na faktuře chybí, u nepovinného pole použij null. Částku "
    "uváděj jako číslo bez měnového symbolu a oddělovačů tisíců. Kategorii vyber tu "
    "nejvhodnější z nabízeného výčtu i v případě, že si nejsi jistý."
)


class ExtractionError(Exception):
    pass


def _content_block(file_bytes: bytes, media_type: str) -> dict:
    encoded = base64.standard_b64encode(file_bytes).decode("utf-8")
    if media_type == "application/pdf":
        return {
            "type": "document",
            "source": {"type": "base64", "media_type": media_type, "data": encoded},
        }
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media_type, "data": encoded},
    }


def extract_invoice(file_bytes: bytes, media_type: str, categories: list[str]) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ExtractionError(
            "Chybí ANTHROPIC_API_KEY. Nastavte ho v souboru .env v kořeni projektu "
            "(zkopírujte .env.example a doplňte svůj klíč)."
        )
    if not categories:
        raise ExtractionError("Nemáte nastavenou žádnou kategorii. Přidejte si alespoň jednu.")

    client = Anthropic(api_key=api_key)

    kwargs = dict(
        model=MODEL,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        tools=[_tool_schema(categories)],
        tool_choice={"type": "tool", "name": "record_invoice"},
        messages=[
            {
                "role": "user",
                "content": [
                    _content_block(file_bytes, media_type),
                    {
                        "type": "text",
                        "text": "Vyčti data z této faktury a zavolej record_invoice.",
                    },
                ],
            }
        ],
    )

    try:
        response = client.messages.create(**kwargs)
    except Exception as exc:
        if media_type == "application/pdf":
            try:
                response = client.beta.messages.create(betas=["pdfs-2024-09-25"], **kwargs)
            except Exception as exc2:
                raise ExtractionError(f"Volání Claude API selhalo: {exc2}") from exc2
        else:
            raise ExtractionError(f"Volání Claude API selhalo: {exc}") from exc

    for block in response.content:
        if block.type == "tool_use" and block.name == "record_invoice":
            return block.input

    raise ExtractionError("Claude nevrátil očekávaná strukturovaná data.")
