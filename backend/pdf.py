"""Branded PDF generation (reports & invoices) with fpdf2 + a Unicode font."""
import io

from fpdf import FPDF

FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"


def _rgb(hex_color: str, default=(29, 78, 216)):
    try:
        h = (hex_color or "").lstrip("#")
        if len(h) == 6:
            return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))
    except Exception:  # noqa: BLE001
        pass
    return default


class _Doc(FPDF):
    def __init__(self, brand: dict):
        super().__init__(format="A4")
        self.brand = brand or {}
        self.primary = _rgb(self.brand.get("primary_color"))
        self.set_auto_page_break(True, margin=20)
        self.add_font("L", "", FONT_REG)
        self.add_font("L", "B", FONT_BOLD)

    def header(self):
        b = self.brand
        r, g, bl = self.primary
        self.set_fill_color(r, g, bl)
        self.rect(0, 0, 210, 4, "F")
        self.set_xy(10, 10)
        self.set_font("L", "B", 18)
        self.set_text_color(r, g, bl)
        self.cell(0, 8, b.get("company_name") or "Entreprise", ln=1)
        self.set_font("L", "", 9)
        self.set_text_color(90, 90, 90)
        line = "  •  ".join(
            x for x in [b.get("phone"), b.get("email"), b.get("website")] if x
        )
        if line:
            self.cell(0, 5, line, ln=1)
        if b.get("address"):
            self.cell(0, 5, b.get("address"), ln=1)
        self.ln(4)
        self.set_text_color(20, 20, 20)

    def mcell(self, w, h, txt, **kw):
        # Always render from the left margin so width is never computed as ~0.
        self.set_x(self.l_margin)
        self.multi_cell(w, h, txt, **kw)

    def footer(self):
        self.set_y(-15)
        self.set_font("L", "", 8)
        self.set_text_color(140, 140, 140)
        foot = self.brand.get("document_footer") or ""
        legal = self.brand.get("siret")
        parts = [p for p in [foot, (f"SIRET {legal}" if legal else "")] if p]
        self.cell(0, 5, "  ".join(parts), align="C")


def build_report_pdf(brand: dict, content: dict, images: list[dict]) -> bytes:
    doc = _Doc(brand)
    doc.add_page()
    doc.set_font("L", "B", 15)
    doc.set_text_color(*doc.primary)
    doc.mcell(0, 8, content.get("title") or "Rapport d'intervention")
    doc.ln(2)
    doc.set_text_color(25, 25, 25)
    for sec in content.get("sections", []):
        doc.set_font("L", "B", 12)
        doc.set_text_color(*doc.primary)
        doc.mcell(0, 7, sec.get("title", ""))
        doc.set_text_color(25, 25, 25)
        doc.set_font("L", "", 10.5)
        doc.mcell(0, 6, sec.get("body") or "")
        doc.ln(2)
    if images:
        doc.set_font("L", "B", 12)
        doc.set_text_color(*doc.primary)
        doc.mcell(0, 7, "Photos")
        doc.set_text_color(25, 25, 25)
        for img in images:
            try:
                doc.image(io.BytesIO(img["bytes"]), w=90)
            except Exception:  # noqa: BLE001
                continue
            cap = img.get("caption")
            if cap:
                doc.set_font("L", "", 9)
                doc.set_text_color(90, 90, 90)
                doc.mcell(0, 5, cap)
            doc.ln(2)
            doc.set_text_color(25, 25, 25)
    return bytes(doc.output())


def _money(v, cur="€"):
    if v is None:
        return "À RENSEIGNER"
    try:
        return f"{float(v):,.2f} {cur}".replace(",", " ").replace(".", ",", 1)
    except Exception:  # noqa: BLE001
        return str(v)


def build_invoice_pdf(brand: dict, invoice: dict, items: list[dict], client: dict,
                      doc_kind: str = "FACTURE", valid_until=None) -> bytes:
    doc = _Doc(brand)
    doc.add_page()
    cur = brand.get("currency") == "EUR" and "€" or (brand.get("currency") or "€")

    doc.set_font("L", "B", 16)
    doc.set_text_color(*doc.primary)
    doc.cell(0, 9, f"{doc_kind} {invoice.get('number') or ''}", ln=1)
    doc.set_text_color(25, 25, 25)
    doc.set_font("L", "", 10)
    doc.cell(0, 6, f"Date : {invoice.get('issue_date') or ''}", ln=1)
    if invoice.get("due_date"):
        doc.cell(0, 6, f"Échéance : {invoice.get('due_date')}", ln=1)
    if valid_until:
        doc.cell(0, 6, f"Validité : {valid_until}", ln=1)

    # client box
    doc.ln(2)
    doc.set_font("L", "B", 10)
    doc.cell(0, 6, "Client", ln=1)
    doc.set_font("L", "", 10)
    if client:
        who = " ".join(x for x in [client.get("first_name"), client.get("last_name")] if x)
        for l in [client.get("company"), who, client.get("billing_address"), client.get("email")]:
            if l:
                doc.cell(0, 5, l, ln=1)
    doc.ln(3)

    # table header
    doc.set_font("L", "B", 9.5)
    r, g, bl = doc.primary
    doc.set_fill_color(r, g, bl)
    doc.set_text_color(255, 255, 255)
    doc.cell(85, 7, "Désignation", border=0, fill=True)
    doc.cell(18, 7, "Qté", border=0, fill=True, align="R")
    doc.cell(32, 7, "PU HT", border=0, fill=True, align="R")
    doc.cell(20, 7, "TVA", border=0, fill=True, align="R")
    doc.cell(0, 7, "Total HT", border=0, fill=True, align="R", ln=1)
    doc.set_text_color(25, 25, 25)
    doc.set_font("L", "", 9.5)
    for it in items:
        doc.cell(85, 7, (it.get("description") or "")[:48], border="B")
        doc.cell(18, 7, str(it.get("quantity") or ""), border="B", align="R")
        doc.cell(32, 7, _money(it.get("unit_price_ht"), cur), border="B", align="R")
        doc.cell(20, 7, f"{it.get('vat_rate') or 0}%", border="B", align="R")
        doc.cell(0, 7, _money(it.get("line_total_ht"), cur), border="B", align="R", ln=1)

    doc.ln(3)
    doc.set_font("L", "", 10)
    doc.cell(135, 6, "", border=0)
    doc.cell(0, 6, f"Total HT : {_money(invoice.get('subtotal_ht'), cur)}", align="R", ln=1)
    doc.cell(135, 6, "", border=0)
    doc.cell(0, 6, f"TVA : {_money(invoice.get('vat_amount'), cur)}", align="R", ln=1)
    doc.set_font("L", "B", 11)
    doc.set_text_color(*doc.primary)
    doc.cell(135, 8, "", border=0)
    doc.cell(0, 8, f"Total TTC : {_money(invoice.get('total_ttc'), cur)}", align="R", ln=1)
    doc.set_text_color(25, 25, 25)

    if brand.get("payment_terms"):
        doc.ln(4)
        doc.set_font("L", "", 9)
        doc.mcell(0, 5, brand.get("payment_terms"))
    if brand.get("iban"):
        doc.set_font("L", "", 9)
        doc.mcell(0, 5, f"IBAN : {brand.get('iban')}")
    if brand.get("legal_notices"):
        doc.ln(2)
        doc.set_font("L", "", 8)
        doc.set_text_color(120, 120, 120)
        doc.mcell(0, 4, brand.get("legal_notices"))
    return bytes(doc.output())
