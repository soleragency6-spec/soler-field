"""AI provider abstraction.

V1 ships a deterministic, template-based report generator so the feature works
with NO paid AI provider. It NEVER invents facts: any field with no source data
is rendered as "À renseigner". A pluggable interface (`rewrite`, `transcribe`)
is exposed so OpenAI/Gemini/self-hosted Whisper can be added later via env only.
"""
from datetime import datetime, timezone

from config import settings

MISSING = "À renseigner"


def _fmt_date(dt) -> str:
    if not dt:
        return MISSING
    try:
        return dt.strftime("%d/%m/%Y %H:%M")
    except Exception:  # noqa: BLE001
        return str(dt)


def generate_report_content(intervention: dict, client: dict, brand: dict,
                            events: list[dict], media: list[dict],
                            template: dict | None = None) -> dict:
    """Build structured, factual report content from real intervention data only.

    If a professional's own report template is provided, its section titles and
    order take priority over the generic layout (facts are mapped into them).
    """
    # Client block
    if client:
        who = " ".join(x for x in [client.get("first_name"), client.get("last_name")] if x).strip()
        client_lines = [
            f"Client : {client.get('company') or who or MISSING}",
            f"Contact : {who or MISSING}",
            f"Adresse : {client.get('service_address') or client.get('billing_address') or MISSING}",
            f"Téléphone : {client.get('phone') or MISSING}",
            f"Email : {client.get('email') or MISSING}",
        ]
    else:
        client_lines = [f"Client : {MISSING}"]

    interv_lines = [
        f"Intervention : {intervention.get('name') or MISSING}",
        f"Référence : {intervention.get('reference') or MISSING}",
        f"Date : {_fmt_date(intervention.get('scheduled_at') or intervention.get('created_at'))}",
        f"Adresse : {intervention.get('address') or MISSING}",
        f"Type : {intervention.get('type') or MISSING}",
        f"Technicien : {intervention.get('technician') or MISSING}",
    ]

    # Observations from voice + text notes (verbatim, never invented)
    observations = []
    for ev in events:
        txt = (ev.get("transcript") or ev.get("content") or "").strip()
        if ev.get("kind") in ("voice", "note") and txt:
            observations.append(txt)
    # media comments/transcripts as additional observations
    for m in media:
        t = (m.get("transcript") or "").strip()
        if t:
            observations.append(t)

    obs_body = "\n".join(f"• {o}" for o in observations) if observations else MISSING

    desc = (intervention.get("description") or "").strip()

    client_body = "\n".join(client_lines)
    interv_body = "\n".join(interv_lines)

    default_sections = [
        {"id": "client", "title": "Informations client", "body": client_body},
        {"id": "intervention", "title": "Détails de l'intervention", "body": interv_body},
        {"id": "observations", "title": "Constat et observations", "body": obs_body},
        {"id": "travaux", "title": "Travaux réalisés", "body": desc or MISSING},
        {"id": "conclusion", "title": "Conclusion", "body": "À confirmer"},
    ]

    tmpl_sections = (template or {}).get("sections") if template else None
    if tmpl_sections:
        # Reproduce the professional's own structure: map facts into their titles.
        sections = []
        for idx, sec in enumerate(tmpl_sections):
            title = sec.get("title") or f"Section {idx + 1}"
            low = title.lower()
            if any(k in low for k in ["client", "destinataire", "coordonn"]):
                body = client_body
            elif any(k in low for k in ["intervention", "détail", "detail", "chantier", "objet"]):
                body = interv_body
            elif any(k in low for k in ["constat", "observ", "diagnos", "état", "etat", "anomal"]):
                body = obs_body
            elif any(k in low for k in ["travaux", "prestation", "réalis", "realis", "action"]):
                body = desc or MISSING
            elif any(k in low for k in ["conclusion", "recommand", "suite"]):
                body = "À confirmer"
            else:
                body = MISSING
            sections.append({"id": f"t{idx}", "title": title, "body": body})
    else:
        sections = default_sections

    photo_ids = [str(m["id"]) for m in media if m.get("kind") == "photo"]

    return {
        "title": f"Rapport d'intervention — {intervention.get('name') or ''}".strip(" —"),
        "sections": sections,
        "photo_ids": photo_ids,
        "meta": {
            "generated_by": "ai" if settings.ai_enabled else "template",
            "template_used": bool(tmpl_sections),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }


async def transcribe(audio_bytes: bytes, mime: str) -> str | None:
    """Server-side transcription hook. Returns None when no provider is
    configured so the client falls back to device/browser speech recognition."""
    if not settings.ai_enabled:
        return None
    # Future: route to OpenAI Whisper / Gemini / self-hosted model here.
    return None



async def rewrite(text: str, tone: str = "professional") -> str | None:
    """Professional rewriting/spelling correction. Returns None when disabled
    (callers keep the user's original text). Plug OpenAI/Gemini here later."""
    if not settings.ai_enabled:
        return None
    return None


async def ocr(image_bytes: bytes, mime: str) -> str | None:
    """OCR hook (labels, serial numbers, references). None when disabled."""
    if not settings.ai_enabled:
        return None
    return None


async def analyze_image(image_bytes: bytes, mime: str) -> dict | None:
    """Vision analysis hook. Must flag uncertainty and never assert facts.
    Returns None when disabled."""
    if not settings.ai_enabled:
        return None
    return None


async def analyze_template(structure: dict) -> dict | None:
    """Optional enrichment of a heuristically-parsed template. None when disabled."""
    if not settings.ai_enabled:
        return None
    return None
