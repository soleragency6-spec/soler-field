from db import tenant_conn
from auth import require_workspace
from typing import Any, Optional
from fastapi import HTTPException
from pydantic import BaseModel
from datetime import date

QUOTE_STATUSES = {'draft','sent','pending','accepted','refused','expired','converted_to_invoice'}

class StatusBody(BaseModel):
    status: str

class TemplateEditorBody(BaseModel):
    structure_json: dict[str, Any] = {}
    editor_config: dict[str, Any] = {}


def register_feature_routes(app):
    @app.post('/api/quotes/{quote_id}/convert-to-invoice')
    async def convert_quote_to_invoice(quote_id: str, p=__import__('fastapi').Depends(require_workspace)):
        async with tenant_conn(p.workspace_id) as conn:
            async with conn.transaction():
                quote = await conn.fetchrow('select * from fieldpro.quotes where id=$1 and workspace_id=$2 and deleted_at is null for update', quote_id, p.workspace_id)
                if not quote:
                    raise HTTPException(404, 'Quotation not found')
                existing = await conn.fetchrow('select * from fieldpro.invoices where source_quote_id=$1 and workspace_id=$2 and deleted_at is null', quote_id, p.workspace_id)
                if existing:
                    return {'invoice': dict(existing), 'already_converted': True}
                if quote['status'] != 'accepted':
                    raise HTTPException(409, 'Only an accepted quotation can be converted')
                items = await conn.fetch('select description, quantity, unit, unit_price_ht, vat_rate, line_total_ht, sort_order from fieldpro.quote_items where quote_id=$1 and workspace_id=$2 order by sort_order, id', quote_id, p.workspace_id)
                brand = await conn.fetchrow('select invoice_prefix, invoice_next_number from fieldpro.brand_settings where workspace_id=$1 for update', p.workspace_id)
                prefix = (brand['invoice_prefix'] if brand else 'FAC')
                next_number = (brand['invoice_next_number'] if brand else 1)
                number = f'{prefix}-{date.today().year}-{next_number:04d}'
                if brand:
                    await conn.execute('update fieldpro.brand_settings set invoice_next_number=invoice_next_number+1, updated_at=now() where workspace_id=$1', p.workspace_id)
                else:
                    await conn.execute('insert into fieldpro.brand_settings (workspace_id, invoice_prefix, invoice_next_number) values ($1, $2, 2)', p.workspace_id, prefix)
                inv = await conn.fetchrow('''insert into fieldpro.invoices (workspace_id, client_id, intervention_id, status, number, subtotal_ht, vat_amount, total_ttc, payment_terms, notes, discount, source_quote_id) values ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11) returning *''', p.workspace_id, quote['client_id'], quote['intervention_id'], number, quote['subtotal_ht'], quote['vat_amount'], quote['total_ttc'], None, quote['notes'], quote['discount'], quote_id)
                for idx, item in enumerate(items):
                    await conn.execute('''insert into fieldpro.invoice_items (workspace_id, invoice_id, description, quantity, unit, unit_price_ht, vat_rate, line_total_ht, sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)''', p.workspace_id, inv['id'], item['description'], item['quantity'], item['unit'], item['unit_price_ht'], item['vat_rate'], item['line_total_ht'], item['sort_order'] if item['sort_order'] is not None else idx)
                updated = await conn.fetchrow("update fieldpro.quotes set status='converted_to_invoice', updated_at=now() where id=$1 and workspace_id=$2 returning *", quote_id, p.workspace_id)
                return {'invoice': dict(inv), 'quote': dict(updated), 'already_converted': False}

    @app.post('/api/quotes/{quote_id}/status')
    async def set_quote_status_v1(quote_id: str, body: StatusBody, p=__import__('fastapi').Depends(require_workspace)):
        if body.status not in QUOTE_STATUSES:
            raise HTTPException(422, 'Invalid quotation status')
        if body.status == 'converted_to_invoice':
            raise HTTPException(409, 'Use the conversion action to set converted_to_invoice')
        async with tenant_conn(p.workspace_id) as conn:
            row = await conn.fetchrow('update fieldpro.quotes set status=$3, updated_at=now() where id=$1 and workspace_id=$2 and deleted_at is null returning *', quote_id, p.workspace_id, body.status)
        if not row:
            raise HTTPException(404, 'Quotation not found')
        return {'quote': dict(row)}

    @app.post('/api/quotes/{quote_id}/reminder')
    async def prepare_quote_reminder(quote_id: str, p=__import__('fastapi').Depends(require_workspace)):
        async with tenant_conn(p.workspace_id) as conn:
            quote = await conn.fetchrow('select id, status from fieldpro.quotes where id=$1 and workspace_id=$2 and deleted_at is null', quote_id, p.workspace_id)
            if not quote:
                raise HTTPException(404, 'Quotation not found')
            if quote['status'] != 'pending':
                raise HTTPException(409, 'Reminders are available only for pending quotations')
            reminder = await conn.fetchrow("insert into fieldpro.quote_reminders (workspace_id, quote_id, created_by, note) values ($1,$2,$3,'Manual reminder prepared; no email was sent') returning *", p.workspace_id, quote_id, getattr(p, 'user_id', None))
        return {'reminder': dict(reminder), 'sent': False, 'message': 'Manual reminder prepared. Automated email sending is not enabled.'}

    @app.get('/api/templates/reusable')
    async def list_reusable_templates(p=__import__('fastapi').Depends(require_workspace)):
        async with tenant_conn(p.workspace_id) as conn:
            rows = await conn.fetch("select * from fieldpro.document_templates where workspace_id=$1 and deleted_at is null order by is_default desc, created_at desc", p.workspace_id)
        return {'templates': [dict(row) for row in rows]}

    @app.put('/api/templates/{template_id}/editor')
    async def save_template_editor(template_id: str, body: TemplateEditorBody, p=__import__('fastapi').Depends(require_workspace)):
        async with tenant_conn(p.workspace_id) as conn:
            async with conn.transaction():
                current = await conn.fetchrow('select * from fieldpro.document_templates where id=$1 and workspace_id=$2 and deleted_at is null for update', template_id, p.workspace_id)
                if not current:
                    raise HTTPException(404, 'Template not found')
                version = await conn.fetchval('select coalesce(max(version_no),0)+1 from fieldpro.template_versions where template_id=$1', template_id)
                saved = await conn.fetchrow('update fieldpro.document_templates set structure_json=$3, editor_config=$4, updated_at=now() where id=$1 and workspace_id=$2 returning *', template_id, p.workspace_id, body.structure_json, body.editor_config)
                await conn.execute('insert into fieldpro.template_versions (workspace_id, template_id, version_no, structure_json, editor_config, created_by) values ($1,$2,$3,$4,$5,$6)', p.workspace_id, template_id, version, body.structure_json, body.editor_config, getattr(p, 'user_id', None))
        return {'template': dict(saved), 'version_no': version}

    @app.get('/api/templates/{template_id}/versions')
    async def list_template_versions(template_id: str, p=__import__('fastapi').Depends(require_workspace)):
        async with tenant_conn(p.workspace_id) as conn:
            rows = await conn.fetch('select id, version_no, structure_json, editor_config, created_at from fieldpro.template_versions where template_id=$1 and workspace_id=$2 order by version_no desc', template_id, p.workspace_id)
        return {'versions': [dict(row) for row in rows]}
