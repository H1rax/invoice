from pydantic import BaseModel, Field


class InvoiceUpdate(BaseModel):
    vendor: str | None = None
    invoice_number: str | None = None
    issue_date: str | None = None
    due_date: str | None = None
    amount_total: float | None = None
    currency: str | None = None
    category: str | None = None
    payment_status: str | None = Field(default=None, pattern="^(neuhrazeno|uhrazeno)$")
    notes: str | None = None
    folder_id: int | None = None


class FolderCreate(BaseModel):
    name: str


class CategoryCreate(BaseModel):
    name: str
