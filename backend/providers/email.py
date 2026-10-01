"""Email provider abstraction (Resend). If no API key is configured, sending is
disabled and emails remain in the database as drafts/pending."""
import base64

import httpx

from config import settings


class EmailResult:
    def __init__(self, status: str, error: str | None = None):
        self.status = status
        self.error = error


async def send_email(
    to: str,
    subject: str,
    html: str,
    attachments: list[dict] | None = None,
) -> EmailResult:
    """attachments: [{filename, content(bytes), content_type}]"""
    if not settings.email_enabled:
        return EmailResult("pending", "Aucun fournisseur email configuré (Resend)")
    payload: dict = {
        "from": settings.RESEND_FROM,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if attachments:
        payload["attachments"] = [
            {
                "filename": a["filename"],
                "content": base64.b64encode(a["content"]).decode(),
            }
            for a in attachments
        ]
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json=payload,
            )
        if r.status_code in (200, 201):
            return EmailResult("sent")
        return EmailResult("failed", r.text[:300])
    except Exception as e:  # noqa: BLE001
        return EmailResult("failed", str(e)[:300])
