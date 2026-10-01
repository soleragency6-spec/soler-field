import logging
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from typing import Any, Optional

from fastapi import Depends, FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth import Principal, get_principal, require_workspace, require_admin
from config import settings
from db import admin_conn, close_pool, init_pool, tenant_conn
from providers import ai
from providers.email import send_email
from providers.storage import LocalStorage, storage
from providers import templates as tmpl_analyzer
import pdf as pdfgen

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fieldpro")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_credentials=True, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)


def rows(records) -> list[dict]:
    return [dict(r) for r in records]


def row(record) -> Optional[dict]:
    return dict(record) if record else None


async def audit(conn, ws, uid, action, entity=None, entity_id=None):
    try:
        await conn.execute(
            "insert into fieldpro.audit_logs (workspace_id,user_id,action,entity,entity_id) values ($1,$2,$3,$4,$5)",
            ws, uid, action, entity, entity_id,
        )
    except Exception:  # noqa: BLE001
        pass


# ============================================================= session / brand
@app.get("/api/health")
async def health():
    return {"ok": True, "storage": storage().name, "email": settings.email_enabled, "ai": settings.ai_enabled}


@app.get("/api/me")
async def me(p: Principal = Depends(get_principal)):
    if p.is_admin:
        return {"user_id": p.user_id, "email": p.email, "is_admin": True, "workspace": None, "brand": None}
    async with tenant_conn(p.claims) as conn:
        brand = row(await conn.fetchrow("select * from fieldpro.brand_settings where workspace_id=$1", p.workspace_id))
        ws = row(await conn.fetchrow("select * from fieldpro.workspaces where id=$1", p.workspace_id))
        sub = row(await conn.fetchrow("select * from fieldpro.subscriptions where workspace_id=$1", p.workspace_id))
    return {"user_id": p.user_id, "email": p.email, "is_admin": False,
            "workspace": ws, "brand": brand, "subscription": sub}


class BrandIn(BaseModel):
    company_name: Optional[str] = None
    app_name: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    siret: Optional[str] = None
    vat_number: Optional[str] = None
    iban: Optional[str] = None
    currency: Optional[str] = None
    vat_rate: Optional[float] = None
    legal_notices: Optional[str] = None
    payment_terms: Optional[str] = None
    document_footer: Optional[str] = None
    email_signature: Optional[str] = None
    invoice_prefix: Optional[str] = None
    quote_prefix: Optional[str] = None


@app.put("/api/brand")
async def update_brand(body: BrandIn, p: Principal = Depends(require_workspace)):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "Aucune donnée")
    cols = ", ".join(f"{k}=${i+2}" for i, k in enumerate(data))
    async with tenant_conn(p.claims) as conn:
        await conn.execute(
            f"update fieldpro.brand_settings set {cols}, updated_at=now() where workspace_id=$1",
            p.workspace_id, *data.values(),
        )
        brand = row(await conn.fetchrow("select * from fieldpro.brand_settings where workspace_id=$1", p.workspace_id))
    return brand


# ============================================================= clients
class ClientIn(BaseModel):
    company: Optional[str] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    billing_address: Optional[str] = None
    service_address: Optional[str] = None
    customer_number: Optional[str] = None
    notes: Optional[str] = None


@app.get("/api/clients")
async def list_clients(q: Optional[str] = None, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        if q:
            like = f"%{q}%"
            recs = await conn.fetch(
                """select * from fieldpro.clients where workspace_id=$1 and deleted_at is null
                   and (coalesce(company,'')||' '||coalesce(first_name,'')||' '||coalesce(last_name,'')||' '||coalesce(phone,'')||' '||coalesce(email,'')) ilike $2
                   order by created_at desc""", p.workspace_id, like)
        else:
            recs = await conn.fetch(
                "select * from fieldpro.clients where workspace_id=$1 and deleted_at is null order by created_at desc",
                p.workspace_id)
    return rows(recs)


@app.post("/api/clients")
async def create_client(body: ClientIn, p: Principal = Depends(require_workspace)):
    d = body.model_dump()
    async with tenant_conn(p.claims) as conn:
        rec = await conn.fetchrow(
            """insert into fieldpro.clients (workspace_id,company,last_name,first_name,email,phone,billing_address,service_address,customer_number,notes)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *""",
            p.workspace_id, d["company"], d["last_name"], d["first_name"], d["email"], d["phone"],
            d["billing_address"], d["service_address"], d["customer_number"], d["notes"])
        await audit(conn, p.workspace_id, p.user_id, "create", "client", rec["id"])
    return row(rec)


@app.get("/api/clients/{client_id}")
async def get_client(client_id: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        c = row(await conn.fetchrow("select * from fieldpro.clients where id=$1 and workspace_id=$2", client_id, p.workspace_id))
        if not c:
            raise HTTPException(404, "Client introuvable")
        interventions = rows(await conn.fetch("select * from fieldpro.interventions where client_id=$1 and deleted_at is null order by created_at desc", client_id))
        reports = rows(await conn.fetch("select id,title,status,created_at,intervention_id from fieldpro.reports where client_id=$1 and deleted_at is null order by created_at desc", client_id))
        invoices = rows(await conn.fetch("select id,number,status,total_ttc,issue_date from fieldpro.invoices where client_id=$1 and deleted_at is null order by created_at desc", client_id))
        quotes = rows(await conn.fetch("select id,number,status,total_ttc,issue_date from fieldpro.quotes where client_id=$1 and deleted_at is null order by created_at desc", client_id))
        emails = rows(await conn.fetch("select id,subject,recipient,status,created_at from fieldpro.emails where client_id=$1 order by created_at desc", client_id))
    return {"client": c, "interventions": interventions, "reports": reports,
            "invoices": invoices, "quotes": quotes, "emails": emails}


@app.put("/api/clients/{client_id}")
async def update_client(client_id: str, body: ClientIn, p: Principal = Depends(require_workspace)):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "Aucune donnée")
    cols = ", ".join(f"{k}=${i+3}" for i, k in enumerate(data))
    async with tenant_conn(p.claims) as conn:
        rec = await conn.fetchrow(
            f"update fieldpro.clients set {cols} where id=$1 and workspace_id=$2 returning *",
            client_id, p.workspace_id, *data.values())
    if not rec:
        raise HTTPException(404, "Client introuvable")
    return row(rec)


@app.delete("/api/clients/{client_id}")
async def delete_client(client_id: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        await conn.execute("update fieldpro.clients set deleted_at=now() where id=$1 and workspace_id=$2", client_id, p.workspace_id)
    return {"ok": True}


# ============================================================= interventions
class InterventionIn(BaseModel):
    client_id: Optional[str] = None
    name: Optional[str] = None
    reference: Optional[str] = None
    address: Optional[str] = None
    type: Optional[str] = None
    technician: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    scheduled_at: Optional[datetime] = None


@app.get("/api/interventions")
async def list_interventions(status: Optional[str] = None, q: Optional[str] = None,
                             p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        sql = """select i.*, c.company as client_company, c.first_name as client_first, c.last_name as client_last
                 from fieldpro.interventions i left join fieldpro.clients c on c.id=i.client_id
                 where i.workspace_id=$1 and i.deleted_at is null"""
        args: list[Any] = [p.workspace_id]
        if status:
            args.append(status); sql += f" and i.status=${len(args)}"
        if q:
            args.append(f"%{q}%"); sql += f" and (coalesce(i.name,'')||' '||coalesce(i.reference,'')||' '||coalesce(i.address,'')) ilike ${len(args)}"
        sql += " order by i.created_at desc"
        recs = await conn.fetch(sql, *args)
    return rows(recs)


@app.post("/api/interventions")
async def create_intervention(body: InterventionIn, p: Principal = Depends(require_workspace)):
    d = body.model_dump()
    async with tenant_conn(p.claims) as conn:
        rec = await conn.fetchrow(
            """insert into fieldpro.interventions (workspace_id,client_id,name,reference,address,type,technician,description,status,scheduled_at)
               values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9,'in_progress'),$10) returning *""",
            p.workspace_id, d["client_id"], d["name"] or "Intervention", d["reference"], d["address"],
            d["type"], d["technician"], d["description"], d["status"], d["scheduled_at"])
        await conn.execute(
            "insert into fieldpro.intervention_events (workspace_id,intervention_id,kind,content) values ($1,$2,'start','Intervention démarrée')",
            p.workspace_id, rec["id"])
        await audit(conn, p.workspace_id, p.user_id, "create", "intervention", rec["id"])
    return row(rec)


@app.get("/api/interventions/{iid}")
async def get_intervention(iid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        i = row(await conn.fetchrow("select * from fieldpro.interventions where id=$1 and workspace_id=$2", iid, p.workspace_id))
        if not i:
            raise HTTPException(404, "Intervention introuvable")
        client = row(await conn.fetchrow("select * from fieldpro.clients where id=$1", i["client_id"])) if i["client_id"] else None
        events = rows(await conn.fetch("select * from fieldpro.intervention_events where intervention_id=$1 order by ts asc", iid))
        media = rows(await conn.fetch("select * from fieldpro.media where intervention_id=$1 and deleted_at is null order by sort_order asc, created_at asc", iid))
        report = row(await conn.fetchrow("select * from fieldpro.reports where intervention_id=$1 and deleted_at is null order by created_at desc limit 1", iid))
        invoice = row(await conn.fetchrow("select * from fieldpro.invoices where intervention_id=$1 and deleted_at is null order by created_at desc limit 1", iid))
    for m in media:
        m["url"] = storage().download_url(m["storage_key"])
    return {"intervention": i, "client": client, "events": events, "media": media,
            "report": report, "invoice": invoice}


@app.put("/api/interventions/{iid}")
async def update_intervention(iid: str, body: InterventionIn, p: Principal = Depends(require_workspace)):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "Aucune donnée")
    cols = ", ".join(f"{k}=${i+3}" for i, k in enumerate(data))
    async with tenant_conn(p.claims) as conn:
        rec = await conn.fetchrow(
            f"update fieldpro.interventions set {cols}, updated_at=now() where id=$1 and workspace_id=$2 returning *",
            iid, p.workspace_id, *data.values())
    if not rec:
        raise HTTPException(404, "Intervention introuvable")
    return row(rec)


@app.delete("/api/interventions/{iid}")
async def delete_intervention(iid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        await conn.execute("update fieldpro.interventions set deleted_at=now() where id=$1 and workspace_id=$2", iid, p.workspace_id)
    return {"ok": True}


class EventIn(BaseModel):
    kind: str  # voice | note
    content: Optional[str] = None
    transcript: Optional[str] = None


@app.post("/api/interventions/{iid}/events")
async def add_event(iid: str, body: EventIn, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        owns = await conn.fetchval("select 1 from fieldpro.interventions where id=$1 and workspace_id=$2", iid, p.workspace_id)
        if not owns:
            raise HTTPException(404, "Intervention introuvable")
        rec = await conn.fetchrow(
            "insert into fieldpro.intervention_events (workspace_id,intervention_id,kind,content,transcript) values ($1,$2,$3,$4,$5) returning *",
            p.workspace_id, iid, body.kind, body.content, body.transcript)
    return row(rec)


# ============================================================= media
@app.post("/api/interventions/{iid}/media")
async def upload_media(iid: str, file: UploadFile = File(...), kind: str = Form("photo"),
                       title: str = Form(""), comment: str = Form(""), transcript: str = Form(""),
                       p: Principal = Depends(require_workspace)):
    data = await file.read()
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(413, "Fichier trop volumineux (max 100 Mo)")
    async with tenant_conn(p.claims) as conn:
        interv = await conn.fetchrow("select client_id from fieldpro.interventions where id=$1 and workspace_id=$2", iid, p.workspace_id)
        if not interv:
            raise HTTPException(404, "Intervention introuvable")
        key = f"workspaces/{p.workspace_id}/interventions/{iid}/{datetime.now(timezone.utc).timestamp()}_{file.filename}"
        storage().put(key, data, file.content_type or "application/octet-stream")
        rec = await conn.fetchrow(
            """insert into fieldpro.media (workspace_id,intervention_id,client_id,kind,storage_key,file_name,mime_type,size_bytes,title,comment,transcript,uploaded_by)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *""",
            p.workspace_id, iid, interv["client_id"], kind, key, file.filename,
            file.content_type, len(data), title or None, comment or None, transcript or None, p.user_id)
        await conn.execute(
            "insert into fieldpro.intervention_events (workspace_id,intervention_id,kind,content,transcript,media_id) values ($1,$2,$3,$4,$5,$6)",
            p.workspace_id, iid, kind, comment or title or None, transcript or None, rec["id"])
    out = row(rec)
    out["url"] = storage().download_url(key)
    return out


class MediaIn(BaseModel):
    title: Optional[str] = None
    comment: Optional[str] = None
    transcript: Optional[str] = None
    sort_order: Optional[int] = None


@app.put("/api/media/{mid}")
async def update_media(mid: str, body: MediaIn, p: Principal = Depends(require_workspace)):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "Aucune donnée")
    cols = ", ".join(f"{k}=${i+3}" for i, k in enumerate(data))
    async with tenant_conn(p.claims) as conn:
        rec = await conn.fetchrow(
            f"update fieldpro.media set {cols} where id=$1 and workspace_id=$2 returning *",
            mid, p.workspace_id, *data.values())
    if not rec:
        raise HTTPException(404, "Média introuvable")
    out = row(rec)
    out["url"] = storage().download_url(out["storage_key"])
    return out


@app.delete("/api/media/{mid}")
async def delete_media(mid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        await conn.execute("update fieldpro.media set deleted_at=now() where id=$1 and workspace_id=$2", mid, p.workspace_id)
    return {"ok": True}


@app.get("/api/files")
async def get_file(key: str, exp: int, sig: str):
    if not isinstance(storage(), LocalStorage) or not LocalStorage.verify(key, exp, sig):
        raise HTTPException(403, "Lien invalide ou expiré")
    try:
        data = storage().get_bytes(key)
    except Exception:  # noqa: BLE001
        raise HTTPException(404, "Fichier introuvable")
    ext = key.rsplit(".", 1)[-1].lower()
    ctype = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
             "mp4": "video/mp4", "mov": "video/quicktime", "m4a": "audio/mp4",
             "webm": "audio/webm", "pdf": "application/pdf"}.get(ext, "application/octet-stream")
    return Response(content=data, media_type=ctype)


# ============================================================= reports
async def _fetch_report_bundle(conn, iid, ws):
    i = row(await conn.fetchrow("select * from fieldpro.interventions where id=$1 and workspace_id=$2", iid, ws))
    client = row(await conn.fetchrow("select * from fieldpro.clients where id=$1", i["client_id"])) if i and i["client_id"] else None
    brand = row(await conn.fetchrow("select * from fieldpro.brand_settings where workspace_id=$1", ws))
    events = rows(await conn.fetch("select * from fieldpro.intervention_events where intervention_id=$1 order by ts asc", iid))
    media = rows(await conn.fetch("select * from fieldpro.media where intervention_id=$1 and deleted_at is null order by sort_order asc, created_at asc", iid))
    return i, client, brand, events, media


@app.post("/api/interventions/{iid}/report/generate")
async def generate_report(iid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        i, client, brand, events, media = await _fetch_report_bundle(conn, iid, p.workspace_id)
        if not i:
            raise HTTPException(404, "Intervention introuvable")
        tmpl = await conn.fetchrow(
            "select structure_json from fieldpro.document_templates where workspace_id=$1 and kind='report' and is_default=true and deleted_at is null limit 1",
            p.workspace_id)
        content = ai.generate_report_content(i, client or {}, brand or {}, events, media,
                                             template=(dict(tmpl)["structure_json"] if tmpl else None))
        rec = await conn.fetchrow(
            """insert into fieldpro.reports (workspace_id,intervention_id,client_id,title,content_json,status)
               values ($1,$2,$3,$4,$5,'draft') returning *""",
            p.workspace_id, iid, i["client_id"], content["title"], content)
        await conn.execute("update fieldpro.interventions set status='report_review', updated_at=now() where id=$1", iid)
        await audit(conn, p.workspace_id, p.user_id, "generate", "report", rec["id"])
    return row(rec)


@app.get("/api/reports")
async def list_reports(p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        recs = await conn.fetch(
            """select r.id,r.title,r.status,r.created_at,r.intervention_id,c.company as client_company,
                      c.first_name as client_first,c.last_name as client_last
               from fieldpro.reports r left join fieldpro.clients c on c.id=r.client_id
               where r.workspace_id=$1 and r.deleted_at is null order by r.created_at desc""", p.workspace_id)
    return rows(recs)


@app.get("/api/reports/{rid}")
async def get_report(rid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        r = row(await conn.fetchrow("select * from fieldpro.reports where id=$1 and workspace_id=$2", rid, p.workspace_id))
        if not r:
            raise HTTPException(404, "Rapport introuvable")
        media = rows(await conn.fetch("select * from fieldpro.media where intervention_id=$1 and deleted_at is null", r["intervention_id"]))
    for m in media:
        m["url"] = storage().download_url(m["storage_key"])
    r["media"] = media
    return r


class ReportIn(BaseModel):
    title: Optional[str] = None
    content_json: Optional[dict] = None


@app.put("/api/reports/{rid}")
async def update_report(rid: str, body: ReportIn, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        cur = await conn.fetchrow("select status from fieldpro.reports where id=$1 and workspace_id=$2", rid, p.workspace_id)
        if not cur:
            raise HTTPException(404, "Rapport introuvable")
        if cur["status"] == "validated":
            raise HTTPException(409, "Rapport déjà validé (verrouillé)")
        rec = await conn.fetchrow(
            "update fieldpro.reports set title=coalesce($3,title), content_json=coalesce($4,content_json), updated_at=now() where id=$1 and workspace_id=$2 returning *",
            rid, p.workspace_id, body.title, body.content_json)
    return row(rec)


@app.post("/api/reports/{rid}/validate")
async def validate_report(rid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        r = row(await conn.fetchrow("select * from fieldpro.reports where id=$1 and workspace_id=$2", rid, p.workspace_id))
        if not r:
            raise HTTPException(404, "Rapport introuvable")
        brand = row(await conn.fetchrow("select * from fieldpro.brand_settings where workspace_id=$1", p.workspace_id))
        content = r["content_json"] or {}
        photo_ids = content.get("photo_ids", [])[:8]
        images = []
        if photo_ids:
            mrecs = await conn.fetch("select * from fieldpro.media where id = any($1::uuid[]) and workspace_id=$2", photo_ids, p.workspace_id)
            mmap = {str(m["id"]): m for m in mrecs}
            for pid in photo_ids:
                m = mmap.get(str(pid))
                if m:
                    try:
                        images.append({"bytes": storage().get_bytes(m["storage_key"]), "caption": m["comment"] or m["title"] or ""})
                    except Exception:  # noqa: BLE001
                        pass
        pdf_bytes = pdfgen.build_report_pdf(brand or {}, content, images)
        key = f"workspaces/{p.workspace_id}/reports/{rid}.pdf"
        storage().put(key, pdf_bytes, "application/pdf")
        rec = await conn.fetchrow(
            "update fieldpro.reports set status='validated', pdf_key=$3, validated_at=now(), updated_at=now() where id=$1 and workspace_id=$2 returning *",
            rid, p.workspace_id, key)
        await conn.execute("update fieldpro.interventions set status='report_validated', updated_at=now() where id=$1", r["intervention_id"])
        await audit(conn, p.workspace_id, p.user_id, "validate", "report", rid)
    out = row(rec)
    out["pdf_url"] = storage().download_url(key)
    return out


@app.get("/api/reports/{rid}/pdf")
async def report_pdf(rid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        r = row(await conn.fetchrow("select pdf_key from fieldpro.reports where id=$1 and workspace_id=$2", rid, p.workspace_id))
    if not r or not r["pdf_key"]:
        raise HTTPException(404, "PDF non disponible")
    return {"url": storage().download_url(r["pdf_key"])}


# ============================================================= services
class ServiceIn(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = "u"
    unit_price_ht: Optional[float] = None
    vat_rate: Optional[float] = 20


@app.get("/api/services")
async def list_services(p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        recs = await conn.fetch("select * from fieldpro.services where workspace_id=$1 and deleted_at is null order by name", p.workspace_id)
    return rows(recs)


@app.post("/api/services")
async def create_service(body: ServiceIn, p: Principal = Depends(require_workspace)):
    d = body.model_dump()
    async with tenant_conn(p.claims) as conn:
        rec = await conn.fetchrow(
            "insert into fieldpro.services (workspace_id,name,description,category,unit,unit_price_ht,vat_rate) values ($1,$2,$3,$4,$5,$6,$7) returning *",
            p.workspace_id, d["name"], d["description"], d["category"], d["unit"] or "u", d["unit_price_ht"], d["vat_rate"] or 20)
    return row(rec)


@app.put("/api/services/{sid}")
async def update_service(sid: str, body: ServiceIn, p: Principal = Depends(require_workspace)):
    d = body.model_dump()
    async with tenant_conn(p.claims) as conn:
        rec = await conn.fetchrow(
            "update fieldpro.services set name=$3,description=$4,category=$5,unit=$6,unit_price_ht=$7,vat_rate=$8 where id=$1 and workspace_id=$2 returning *",
            sid, p.workspace_id, d["name"], d["description"], d["category"], d["unit"] or "u", d["unit_price_ht"], d["vat_rate"] or 20)
    if not rec:
        raise HTTPException(404, "Prestation introuvable")
    return row(rec)


@app.delete("/api/services/{sid}")
async def delete_service(sid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        await conn.execute("update fieldpro.services set deleted_at=now() where id=$1 and workspace_id=$2", sid, p.workspace_id)
    return {"ok": True}


# ============================================================= invoices
def _compute_totals(items: list[dict], discount: float = 0):
    subtotal = 0.0
    vat = 0.0
    for it in items:
        price = it.get("unit_price_ht")
        qty = float(it.get("quantity") or 0)
        if price is None:
            it["line_total_ht"] = 0
            continue
        line = float(price) * qty
        it["line_total_ht"] = round(line, 2)
        subtotal += line
        vat += line * float(it.get("vat_rate") or 0) / 100.0
    subtotal -= float(discount or 0)
    vat = round(vat, 2)
    subtotal = round(subtotal, 2)
    return subtotal, vat, round(subtotal + vat, 2)


class ItemIn(BaseModel):
    description: str = ""
    quantity: float = 1
    unit: str = "u"
    unit_price_ht: Optional[float] = None
    vat_rate: float = 20


class InvoiceIn(BaseModel):
    client_id: Optional[str] = None
    intervention_id: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    discount: Optional[float] = 0
    items: list[ItemIn] = []


async def _save_invoice_items(conn, ws, invoice_id, items: list[dict]):
    await conn.execute("delete from fieldpro.invoice_items where invoice_id=$1 and workspace_id=$2", invoice_id, ws)
    for idx, it in enumerate(items):
        await conn.execute(
            """insert into fieldpro.invoice_items (workspace_id,invoice_id,description,quantity,unit,unit_price_ht,vat_rate,line_total_ht,sort_order)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            ws, invoice_id, it["description"], it["quantity"], it.get("unit", "u"),
            it.get("unit_price_ht"), it.get("vat_rate", 20), it.get("line_total_ht") or 0, idx)


@app.post("/api/interventions/{iid}/invoice")
async def invoice_from_intervention(iid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        i = row(await conn.fetchrow("select * from fieldpro.interventions where id=$1 and workspace_id=$2", iid, p.workspace_id))
        if not i:
            raise HTTPException(404, "Intervention introuvable")
        services = rows(await conn.fetch("select * from fieldpro.services where workspace_id=$1 and deleted_at is null", p.workspace_id))
        items = []
        text = f"{i.get('name','')} {i.get('type','')} {i.get('description','')}".lower()
        for s in services:
            if s["name"] and s["name"].lower() in text:
                items.append({"description": s["name"], "quantity": 1, "unit": s["unit"],
                              "unit_price_ht": float(s["unit_price_ht"]) if s["unit_price_ht"] is not None else None,
                              "vat_rate": float(s["vat_rate"])})
        if not items:
            items = [{"description": i.get("name") or "Prestation", "quantity": 1, "unit": "u",
                      "unit_price_ht": None, "vat_rate": 20}]
        subtotal, vat, total = _compute_totals(items)
        brand = row(await conn.fetchrow("select payment_terms from fieldpro.brand_settings where workspace_id=$1", p.workspace_id))
        rec = await conn.fetchrow(
            """insert into fieldpro.invoices (workspace_id,client_id,intervention_id,status,subtotal_ht,vat_amount,total_ttc,payment_terms)
               values ($1,$2,$3,'draft',$4,$5,$6,$7) returning *""",
            p.workspace_id, i["client_id"], iid, subtotal, vat, total, brand["payment_terms"] if brand else None)
        await _save_invoice_items(conn, p.workspace_id, rec["id"], items)
        await conn.execute("update fieldpro.interventions set status='invoice_review', updated_at=now() where id=$1", iid)
    out = row(rec)
    out["items"] = items
    return out


@app.get("/api/invoices")
async def list_invoices(p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        recs = await conn.fetch(
            """select inv.*, c.company as client_company, c.first_name as client_first, c.last_name as client_last
               from fieldpro.invoices inv left join fieldpro.clients c on c.id=inv.client_id
               where inv.workspace_id=$1 and inv.deleted_at is null order by inv.created_at desc""", p.workspace_id)
    return rows(recs)


@app.get("/api/invoices/{inv_id}")
async def get_invoice(inv_id: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        inv = row(await conn.fetchrow("select * from fieldpro.invoices where id=$1 and workspace_id=$2", inv_id, p.workspace_id))
        if not inv:
            raise HTTPException(404, "Facture introuvable")
        items = rows(await conn.fetch("select * from fieldpro.invoice_items where invoice_id=$1 order by sort_order", inv_id))
        client = row(await conn.fetchrow("select * from fieldpro.clients where id=$1", inv["client_id"])) if inv["client_id"] else None
    inv["items"] = items
    inv["client"] = client
    return inv


@app.put("/api/invoices/{inv_id}")
async def update_invoice(inv_id: str, body: InvoiceIn, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        cur = await conn.fetchrow("select status from fieldpro.invoices where id=$1 and workspace_id=$2", inv_id, p.workspace_id)
        if not cur:
            raise HTTPException(404, "Facture introuvable")
        if cur["status"] == "final":
            raise HTTPException(409, "Facture finalisée (document verrouillé)")
        items = [it.model_dump() for it in body.items]
        subtotal, vat, total = _compute_totals(items, body.discount or 0)
        rec = await conn.fetchrow(
            """update fieldpro.invoices set client_id=coalesce($3,client_id), due_date=$4, notes=$5, discount=$6,
                subtotal_ht=$7, vat_amount=$8, total_ttc=$9, updated_at=now()
               where id=$1 and workspace_id=$2 returning *""",
            inv_id, p.workspace_id, body.client_id, body.due_date, body.notes, body.discount or 0, subtotal, vat, total)
        await _save_invoice_items(conn, p.workspace_id, inv_id, items)
    out = row(rec)
    out["items"] = items
    return out


@app.post("/api/invoices/{inv_id}/finalize")
async def finalize_invoice(inv_id: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        inv = row(await conn.fetchrow("select * from fieldpro.invoices where id=$1 and workspace_id=$2", inv_id, p.workspace_id))
        if not inv:
            raise HTTPException(404, "Facture introuvable")
        if inv["status"] == "final":
            raise HTTPException(409, "Facture déjà finalisée")
        brand = row(await conn.fetchrow("select * from fieldpro.brand_settings where workspace_id=$1 for update", p.workspace_id))
        year = datetime.now(timezone.utc).year
        num = f"{brand['invoice_prefix']}-{year}-{brand['invoice_next_number']:04d}"
        await conn.execute("update fieldpro.brand_settings set invoice_next_number=invoice_next_number+1 where workspace_id=$1", p.workspace_id)
        items = rows(await conn.fetch("select * from fieldpro.invoice_items where invoice_id=$1 order by sort_order", inv_id))
        client = row(await conn.fetchrow("select * from fieldpro.clients where id=$1", inv["client_id"])) if inv["client_id"] else None
        inv["number"] = num
        pdf_bytes = pdfgen.build_invoice_pdf(brand or {}, inv, items, client or {})
        key = f"workspaces/{p.workspace_id}/invoices/{inv_id}.pdf"
        storage().put(key, pdf_bytes, "application/pdf")
        rec = await conn.fetchrow(
            "update fieldpro.invoices set status='final', number=$3, pdf_key=$4, finalized_at=now(), updated_at=now() where id=$1 and workspace_id=$2 returning *",
            inv_id, p.workspace_id, num, key)
        if inv["intervention_id"]:
            await conn.execute("update fieldpro.interventions set status='invoiced', updated_at=now() where id=$1", inv["intervention_id"])
        await audit(conn, p.workspace_id, p.user_id, "finalize", "invoice", inv_id)
    out = row(rec)
    out["pdf_url"] = storage().download_url(key)
    return out


@app.get("/api/invoices/{inv_id}/pdf")
async def invoice_pdf(inv_id: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        r = row(await conn.fetchrow("select pdf_key from fieldpro.invoices where id=$1 and workspace_id=$2", inv_id, p.workspace_id))
    if not r or not r["pdf_key"]:
        raise HTTPException(404, "PDF non disponible")
    return {"url": storage().download_url(r["pdf_key"])}


# ============================================================= quotes (minimal)
@app.get("/api/quotes")
async def list_quotes(p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        recs = await conn.fetch(
            """select q.*, c.company as client_company, c.first_name as client_first, c.last_name as client_last
               from fieldpro.quotes q left join fieldpro.clients c on c.id=q.client_id
               where q.workspace_id=$1 and q.deleted_at is null order by q.created_at desc""", p.workspace_id)
    return rows(recs)


@app.post("/api/quotes")
async def create_quote(body: InvoiceIn, p: Principal = Depends(require_workspace)):
    items = [it.model_dump() for it in body.items] or [{"description": "Prestation", "quantity": 1, "unit": "u", "unit_price_ht": None, "vat_rate": 20}]
    subtotal, vat, total = _compute_totals(items, body.discount or 0)
    async with tenant_conn(p.claims) as conn:
        rec = await conn.fetchrow(
            """insert into fieldpro.quotes (workspace_id,client_id,intervention_id,status,notes,discount,subtotal_ht,vat_amount,total_ttc)
               values ($1,$2,$3,'draft',$4,$5,$6,$7,$8) returning *""",
            p.workspace_id, body.client_id, body.intervention_id, body.notes, body.discount or 0, subtotal, vat, total)
        for idx, it in enumerate(items):
            await conn.execute(
                "insert into fieldpro.quote_items (workspace_id,quote_id,description,quantity,unit,unit_price_ht,vat_rate,line_total_ht,sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
                p.workspace_id, rec["id"], it["description"], it["quantity"], it.get("unit", "u"), it.get("unit_price_ht"), it.get("vat_rate", 20), it.get("line_total_ht") or 0, idx)
    out = row(rec)
    out["items"] = items
    return out


# ============================================================= emails
class EmailIn(BaseModel):
    client_id: Optional[str] = None
    intervention_id: Optional[str] = None
    recipient: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    attachments: list[dict] = []


@app.post("/api/emails")
async def create_email(body: EmailIn, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        rec = await conn.fetchrow(
            """insert into fieldpro.emails (workspace_id,client_id,intervention_id,recipient,subject,body,attachments_json,status)
               values ($1,$2,$3,$4,$5,$6,$7,'draft') returning *""",
            p.workspace_id, body.client_id, body.intervention_id, body.recipient, body.subject, body.body, body.attachments)
    return row(rec)


@app.get("/api/emails")
async def list_emails(p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        recs = await conn.fetch("select * from fieldpro.emails where workspace_id=$1 order by created_at desc", p.workspace_id)
    return rows(recs)


@app.post("/api/emails/{eid}/send")
async def send_email_route(eid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        em = row(await conn.fetchrow("select * from fieldpro.emails where id=$1 and workspace_id=$2", eid, p.workspace_id))
        if not em:
            raise HTTPException(404, "Email introuvable")
        brand = row(await conn.fetchrow("select * from fieldpro.brand_settings where workspace_id=$1", p.workspace_id))
        atts = []
        for a in (em["attachments_json"] or []):
            key = None
            if a.get("type") == "report":
                r = await conn.fetchrow("select pdf_key from fieldpro.reports where id=$1 and workspace_id=$2", a["id"], p.workspace_id)
                key = r["pdf_key"] if r else None
            elif a.get("type") == "invoice":
                r = await conn.fetchrow("select pdf_key from fieldpro.invoices where id=$1 and workspace_id=$2", a["id"], p.workspace_id)
                key = r["pdf_key"] if r else None
            elif a.get("type") == "quote":
                r = await conn.fetchrow("select pdf_key from fieldpro.quotes where id=$1 and workspace_id=$2", a["id"], p.workspace_id)
                key = r["pdf_key"] if r else None
            if key:
                try:
                    atts.append({"filename": a.get("name", "document.pdf"), "content": storage().get_bytes(key), "content_type": "application/pdf"})
                except Exception:  # noqa: BLE001
                    pass
        sig = (brand or {}).get("email_signature") or ""
        html = f"<div style='font-family:sans-serif'>{(em['body'] or '').replace(chr(10),'<br>')}<br><br>{sig}</div>"
        result = await send_email(em["recipient"], em["subject"] or "", html, atts)
        rec = await conn.fetchrow(
            "update fieldpro.emails set status=$3, error=$4, sent_at=case when $3='sent' then now() else null end where id=$1 and workspace_id=$2 returning *",
            eid, p.workspace_id, result.status, result.error)
    return {"email": row(rec), "email_enabled": settings.email_enabled}


# ============================================================= dashboard
@app.get("/api/dashboard")
async def dashboard(p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        in_progress = await conn.fetchval("select count(*) from fieldpro.interventions where workspace_id=$1 and status in ('draft','in_progress') and deleted_at is null", p.workspace_id)
        reports_review = await conn.fetchval("select count(*) from fieldpro.reports where workspace_id=$1 and status='draft' and deleted_at is null", p.workspace_id)
        invoices_draft = await conn.fetchval("select count(*) from fieldpro.invoices where workspace_id=$1 and status='draft' and deleted_at is null", p.workspace_id)
        recent_quotes = rows(await conn.fetch("select id,number,status,total_ttc,created_at from fieldpro.quotes where workspace_id=$1 and deleted_at is null order by created_at desc limit 5", p.workspace_id))
        recent_clients = rows(await conn.fetch("select id,company,first_name,last_name,created_at from fieldpro.clients where workspace_id=$1 and deleted_at is null order by created_at desc limit 5", p.workspace_id))
        recent_interventions = rows(await conn.fetch(
            """select i.id,i.name,i.status,i.created_at,c.company as client_company,c.first_name as client_first,c.last_name as client_last
               from fieldpro.interventions i left join fieldpro.clients c on c.id=i.client_id
               where i.workspace_id=$1 and i.deleted_at is null order by i.created_at desc limit 6""", p.workspace_id))
        storage_used = await conn.fetchval("select coalesce(sum(size_bytes),0) from fieldpro.media where workspace_id=$1 and deleted_at is null", p.workspace_id)
        quota = await conn.fetchval("select storage_quota_bytes from fieldpro.workspaces where id=$1", p.workspace_id)
    return {"in_progress": in_progress, "reports_review": reports_review, "invoices_draft": invoices_draft,
            "recent_quotes": recent_quotes, "recent_clients": recent_clients,
            "recent_interventions": recent_interventions,
            "storage_used": int(storage_used or 0), "storage_quota": int(quota or 0)}


# ============================================================= templates
@app.get("/api/templates")
async def list_templates(kind: Optional[str] = None, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        if kind:
            recs = await conn.fetch("select * from fieldpro.document_templates where workspace_id=$1 and kind=$2 and deleted_at is null order by created_at desc", p.workspace_id, kind)
        else:
            recs = await conn.fetch("select * from fieldpro.document_templates where workspace_id=$1 and deleted_at is null order by kind, created_at desc", p.workspace_id)
    return rows(recs)


@app.post("/api/templates")
async def upload_template(file: UploadFile = File(...), kind: str = Form(...), name: str = Form(""),
                          p: Principal = Depends(require_workspace)):
    if kind not in ("report", "invoice", "quote"):
        raise HTTPException(400, "Type de modèle invalide")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Fichier trop volumineux (max 25 Mo)")
    structure = tmpl_analyzer.analyze(data, file.content_type or "", file.filename or "")
    async with tenant_conn(p.claims) as conn:
        key = f"workspaces/{p.workspace_id}/templates/{datetime.now(timezone.utc).timestamp()}_{file.filename}"
        storage().put(key, data, file.content_type or "application/octet-stream")
        media = await conn.fetchrow(
            """insert into fieldpro.media (workspace_id,kind,storage_key,file_name,mime_type,size_bytes,uploaded_by)
               values ($1,'document',$2,$3,$4,$5,$6) returning id""",
            p.workspace_id, key, file.filename, file.content_type, len(data), p.user_id)
        has_default = await conn.fetchval(
            "select true from fieldpro.document_templates where workspace_id=$1 and kind=$2 and is_default=true and deleted_at is null",
            p.workspace_id, kind)
        rec = await conn.fetchrow(
            """insert into fieldpro.document_templates (workspace_id,kind,name,source_media_id,structure_json,is_default,original_name)
               values ($1,$2,$3,$4,$5,$6,$7) returning *""",
            p.workspace_id, kind, name or (file.filename or "Modèle"), media["id"], structure,
            not has_default, file.filename)
    return row(rec)


class TemplateIn(BaseModel):
    name: Optional[str] = None
    structure_json: Optional[dict] = None
    is_default: Optional[bool] = None


@app.put("/api/templates/{tid}")
async def update_template(tid: str, body: TemplateIn, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        cur = await conn.fetchrow("select kind from fieldpro.document_templates where id=$1 and workspace_id=$2", tid, p.workspace_id)
        if not cur:
            raise HTTPException(404, "Modèle introuvable")
        if body.is_default:
            await conn.execute("update fieldpro.document_templates set is_default=false where workspace_id=$1 and kind=$2", p.workspace_id, cur["kind"])
        rec = await conn.fetchrow(
            "update fieldpro.document_templates set name=coalesce($3,name), structure_json=coalesce($4,structure_json), is_default=coalesce($5,is_default) where id=$1 and workspace_id=$2 returning *",
            tid, p.workspace_id, body.name, body.structure_json, body.is_default)
    return row(rec)


@app.delete("/api/templates/{tid}")
async def delete_template(tid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        await conn.execute("update fieldpro.document_templates set deleted_at=now() where id=$1 and workspace_id=$2", tid, p.workspace_id)
    return {"ok": True}


@app.get("/api/templates/{tid}/original")
async def template_original(tid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        rec = await conn.fetchrow(
            "select m.storage_key from fieldpro.document_templates t join fieldpro.media m on m.id=t.source_media_id where t.id=$1 and t.workspace_id=$2",
            tid, p.workspace_id)
    if not rec:
        raise HTTPException(404, "Fichier introuvable")
    return {"url": storage().download_url(rec["storage_key"])}


# ============================================================= quotes (full)
async def _save_quote_items(conn, ws, quote_id, items: list[dict]):
    await conn.execute("delete from fieldpro.quote_items where quote_id=$1 and workspace_id=$2", quote_id, ws)
    for idx, it in enumerate(items):
        await conn.execute(
            """insert into fieldpro.quote_items (workspace_id,quote_id,description,quantity,unit,unit_price_ht,vat_rate,line_total_ht,sort_order)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            ws, quote_id, it["description"], it["quantity"], it.get("unit", "u"),
            it.get("unit_price_ht"), it.get("vat_rate", 20), it.get("line_total_ht") or 0, idx)


class QuoteIn(BaseModel):
    client_id: Optional[str] = None
    intervention_id: Optional[str] = None
    valid_until: Optional[date] = None
    notes: Optional[str] = None
    discount: Optional[float] = 0
    items: list[ItemIn] = []


@app.get("/api/quotes/{qid}")
async def get_quote(qid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        q = row(await conn.fetchrow("select * from fieldpro.quotes where id=$1 and workspace_id=$2", qid, p.workspace_id))
        if not q:
            raise HTTPException(404, "Devis introuvable")
        items = rows(await conn.fetch("select * from fieldpro.quote_items where quote_id=$1 order by sort_order", qid))
        client = row(await conn.fetchrow("select * from fieldpro.clients where id=$1", q["client_id"])) if q["client_id"] else None
    q["items"] = items
    q["client"] = client
    return q


@app.put("/api/quotes/{qid}")
async def update_quote(qid: str, body: QuoteIn, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        cur = await conn.fetchrow("select status from fieldpro.quotes where id=$1 and workspace_id=$2", qid, p.workspace_id)
        if not cur:
            raise HTTPException(404, "Devis introuvable")
        if cur["status"] in ("final", "sent", "accepted"):
            raise HTTPException(409, "Devis validé (verrouillé)")
        items = [it.model_dump() for it in body.items]
        subtotal, vat, total = _compute_totals(items, body.discount or 0)
        rec = await conn.fetchrow(
            """update fieldpro.quotes set client_id=coalesce($3,client_id), valid_until=$4, notes=$5, discount=$6,
                subtotal_ht=$7, vat_amount=$8, total_ttc=$9, updated_at=now()
               where id=$1 and workspace_id=$2 returning *""",
            qid, p.workspace_id, body.client_id, body.valid_until, body.notes, body.discount or 0, subtotal, vat, total)
        await _save_quote_items(conn, p.workspace_id, qid, items)
    out = row(rec)
    out["items"] = items
    return out


@app.post("/api/quotes/{qid}/finalize")
async def finalize_quote(qid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        q = row(await conn.fetchrow("select * from fieldpro.quotes where id=$1 and workspace_id=$2", qid, p.workspace_id))
        if not q:
            raise HTTPException(404, "Devis introuvable")
        if q["status"] in ("final", "sent", "accepted"):
            raise HTTPException(409, "Devis déjà validé")
        brand = row(await conn.fetchrow("select * from fieldpro.brand_settings where workspace_id=$1 for update", p.workspace_id))
        year = datetime.now(timezone.utc).year
        num = f"{brand['quote_prefix']}-{year}-{brand['quote_next_number']:04d}"
        await conn.execute("update fieldpro.brand_settings set quote_next_number=quote_next_number+1 where workspace_id=$1", p.workspace_id)
        items = rows(await conn.fetch("select * from fieldpro.quote_items where quote_id=$1 order by sort_order", qid))
        client = row(await conn.fetchrow("select * from fieldpro.clients where id=$1", q["client_id"])) if q["client_id"] else None
        q["number"] = num
        pdf_bytes = pdfgen.build_invoice_pdf(brand or {}, q, items, client or {}, doc_kind="DEVIS", valid_until=q.get("valid_until"))
        key = f"workspaces/{p.workspace_id}/quotes/{qid}.pdf"
        storage().put(key, pdf_bytes, "application/pdf")
        rec = await conn.fetchrow(
            "update fieldpro.quotes set status='final', number=$3, pdf_key=$4, updated_at=now() where id=$1 and workspace_id=$2 returning *",
            qid, p.workspace_id, num, key)
        await audit(conn, p.workspace_id, p.user_id, "finalize", "quote", qid)
    out = row(rec)
    out["pdf_url"] = storage().download_url(key)
    return out


@app.get("/api/quotes/{qid}/pdf")
async def quote_pdf(qid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        r = row(await conn.fetchrow("select pdf_key from fieldpro.quotes where id=$1 and workspace_id=$2", qid, p.workspace_id))
    if not r or not r["pdf_key"]:
        raise HTTPException(404, "PDF non disponible")
    return {"url": storage().download_url(r["pdf_key"])}


class QuoteStatusIn(BaseModel):
    status: str


@app.post("/api/quotes/{qid}/status")
async def quote_status(qid: str, body: QuoteStatusIn, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        rec = await conn.fetchrow("update fieldpro.quotes set status=$3, updated_at=now() where id=$1 and workspace_id=$2 returning *", qid, p.workspace_id, body.status)
    if not rec:
        raise HTTPException(404, "Devis introuvable")
    return row(rec)


@app.post("/api/interventions/{iid}/quote")
async def quote_from_intervention(iid: str, p: Principal = Depends(require_workspace)):
    async with tenant_conn(p.claims) as conn:
        i = row(await conn.fetchrow("select * from fieldpro.interventions where id=$1 and workspace_id=$2", iid, p.workspace_id))
        if not i:
            raise HTTPException(404, "Intervention introuvable")
        services = rows(await conn.fetch("select * from fieldpro.services where workspace_id=$1 and deleted_at is null", p.workspace_id))
        items = []
        text = f"{i.get('name','')} {i.get('type','')} {i.get('description','')}".lower()
        for sv in services:
            if sv["name"] and sv["name"].lower() in text:
                items.append({"description": sv["name"], "quantity": 1, "unit": sv["unit"],
                              "unit_price_ht": float(sv["unit_price_ht"]) if sv["unit_price_ht"] is not None else None,
                              "vat_rate": float(sv["vat_rate"])})
        if not items:
            items = [{"description": i.get("name") or "Prestation", "quantity": 1, "unit": "u", "unit_price_ht": None, "vat_rate": 20}]
        subtotal, vat, total = _compute_totals(items)
        rec = await conn.fetchrow(
            """insert into fieldpro.quotes (workspace_id,client_id,intervention_id,status,subtotal_ht,vat_amount,total_ttc)
               values ($1,$2,$3,'draft',$4,$5,$6) returning *""",
            p.workspace_id, i["client_id"], iid, subtotal, vat, total)
        await _save_quote_items(conn, p.workspace_id, rec["id"], items)
    out = row(rec)
    out["items"] = items
    return out


# ============================================================= super admin
@app.get("/api/admin/workspaces")
async def admin_workspaces(p: Principal = Depends(require_admin)):
    async with admin_conn() as conn:
        recs = await conn.fetch(
            """select w.*, b.company_name, b.app_name,
                      (select count(*) from fieldpro.workspace_members m where m.workspace_id=w.id) as members,
                      (select coalesce(sum(size_bytes),0) from fieldpro.media md where md.workspace_id=w.id and md.deleted_at is null) as storage_used
               from fieldpro.workspaces w left join fieldpro.brand_settings b on b.workspace_id=w.id
               where w.deleted_at is null order by w.created_at desc""")
    return rows(recs)


class WsStatusIn(BaseModel):
    subscription_status: str


@app.put("/api/admin/workspaces/{ws_id}/status")
async def admin_set_status(ws_id: str, body: WsStatusIn, p: Principal = Depends(require_admin)):
    async with admin_conn() as conn:
        rec = await conn.fetchrow("update fieldpro.workspaces set subscription_status=$2 where id=$1 returning *", ws_id, body.subscription_status)
        await conn.execute("update fieldpro.subscriptions set status=$2, updated_at=now() where workspace_id=$1", ws_id, body.subscription_status)
    return row(rec)


class AdminUserIn(BaseModel):
    email: str
    password: str
    company_name: Optional[str] = None


@app.post("/api/admin/users")
async def admin_create_user(body: AdminUserIn, p: Principal = Depends(require_admin)):
    if not settings.SUPABASE_SERVICE_ROLE_KEY or len(settings.SUPABASE_SERVICE_ROLE_KEY) < 20:
        raise HTTPException(400, "Clé service_role Supabase non configurée. Ajoutez SUPABASE_SERVICE_ROLE_KEY.")
    import httpx
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            headers={"apikey": settings.SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}"},
            json={"email": body.email, "password": body.password, "email_confirm": True})
    if r.status_code not in (200, 201):
        raise HTTPException(400, f"Création échouée: {r.text[:200]}")
    uid = r.json()["id"]
    async with admin_conn() as conn:
        name = body.company_name or body.email.split("@")[0]
        ws = await conn.fetchval("insert into fieldpro.workspaces (name) values ($1) returning id", name)
        await conn.execute("insert into fieldpro.workspace_members (workspace_id,user_id,role) values ($1,$2,'owner')", ws, uid)
        await conn.execute("insert into fieldpro.brand_settings (workspace_id,company_name,app_name,email) values ($1,$2,'FieldPro',$3) on conflict do nothing", ws, name, body.email)
        await conn.execute("insert into fieldpro.subscriptions (workspace_id) values ($1) on conflict do nothing", ws)
    return {"user_id": uid, "workspace_id": str(ws), "email": body.email}

from features import register_feature_routes
register_feature_routes(app)
