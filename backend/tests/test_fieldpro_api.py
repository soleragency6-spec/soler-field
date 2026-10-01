"""FieldPro backend API tests - end-to-end golden path + RLS/401 checks."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
API = f"{BASE_URL}/api"
SUPABASE_URL = "https://bjutwzqitkudwjzvevls.supabase.co"
SUPABASE_ANON = "sb_publishable_vpSkLI2aoxy25UFzwSmojA_Xi0w27ju"

PRO_EMAIL = "pro@martin-plomberie.fr"
PRO_PASS = "Test1234!"
ADMIN_EMAIL = "admin@fieldpro.app"
ADMIN_PASS = "Admin1234!"


def _login(email, password):
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password}, timeout=20,
    )
    assert r.status_code == 200, f"Supabase login failed for {email}: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def pro_token():
    return _login(PRO_EMAIL, PRO_PASS)


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture
def pro_headers(pro_token):
    return {"Authorization": f"Bearer {pro_token}", "Content-Type": "application/json"}


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ------------- health / auth
def test_health():
    r = requests.get(f"{API}/health", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert d["email"] in (False, True)


def test_no_token_401():
    r = requests.get(f"{API}/me", timeout=20)
    assert r.status_code in (401, 403)


def test_bad_token_401():
    r = requests.get(f"{API}/me", headers={"Authorization": "Bearer invalid.jwt.here"}, timeout=20)
    assert r.status_code == 401


def test_me_pro(pro_headers):
    r = requests.get(f"{API}/me", headers=pro_headers, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["is_admin"] is False
    assert d["workspace"] is not None
    assert d["brand"] is not None
    assert d["email"] == PRO_EMAIL


def test_me_admin(admin_headers):
    r = requests.get(f"{API}/me", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["is_admin"] is True


def test_admin_workspaces(admin_headers):
    r = requests.get(f"{API}/admin/workspaces", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_admin_create_user_service_role_error(admin_headers):
    """service_role key not properly configured -> expect clear 400."""
    r = requests.post(f"{API}/admin/users", headers=admin_headers,
                      json={"email": "TEST_shouldnot@example.com", "password": "Test1234!"}, timeout=20)
    # Either not configured (400 clear msg) or actual Supabase error (400) - must NOT be 500
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text[:300]}"
    assert "service_role" in r.text.lower() or "création échouée" in r.text.lower() or "creation" in r.text.lower()


def test_pro_cannot_hit_admin(pro_headers):
    r = requests.get(f"{API}/admin/workspaces", headers=pro_headers, timeout=20)
    assert r.status_code == 403


# ------------- dashboard / brand
def test_dashboard(pro_headers):
    r = requests.get(f"{API}/dashboard", headers=pro_headers, timeout=20)
    assert r.status_code == 200
    d = r.json()
    for k in ("in_progress", "reports_review", "invoices_draft", "recent_interventions", "storage_used", "storage_quota"):
        assert k in d


def test_brand_update(pro_headers):
    r = requests.put(f"{API}/brand", headers=pro_headers, json={"primary_color": "#0EA5E9"}, timeout=20)
    assert r.status_code == 200
    assert r.json()["primary_color"] == "#0EA5E9"


# ------------- golden path
@pytest.fixture(scope="session")
def flow_ctx():
    return {}


def test_1_create_client(pro_headers, flow_ctx):
    payload = {"company": "TEST_Café Central", "first_name": "Marie", "last_name": "Dupont",
               "email": "TEST_marie@example.com", "phone": "+33600000001"}
    r = requests.post(f"{API}/clients", headers=pro_headers, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["company"] == "TEST_Café Central"
    flow_ctx["client_id"] = d["id"]


def test_2_get_client_360(pro_headers, flow_ctx):
    cid = flow_ctx["client_id"]
    r = requests.get(f"{API}/clients/{cid}", headers=pro_headers, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["client"]["id"] == cid
    assert "interventions" in d and "reports" in d and "invoices" in d


def test_3_list_clients_search(pro_headers):
    r = requests.get(f"{API}/clients?q=TEST_Caf", headers={"Authorization": pro_headers["Authorization"]}, timeout=20)
    assert r.status_code == 200
    assert any(c["company"] == "TEST_Café Central" for c in r.json())


def test_4_create_intervention(pro_headers, flow_ctx):
    payload = {"client_id": flow_ctx["client_id"], "name": "TEST_Fuite cuisine",
               "type": "depannage", "description": "Fuite sous évier"}
    r = requests.post(f"{API}/interventions", headers=pro_headers, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    flow_ctx["intervention_id"] = r.json()["id"]


def test_5_add_events(pro_headers, flow_ctx):
    iid = flow_ctx["intervention_id"]
    r = requests.post(f"{API}/interventions/{iid}/events", headers=pro_headers,
                      json={"kind": "voice", "content": "Voice note", "transcript": "Fuite au niveau du siphon"}, timeout=20)
    assert r.status_code == 200
    r = requests.post(f"{API}/interventions/{iid}/events", headers=pro_headers,
                      json={"kind": "note", "content": "Remplacé le joint"}, timeout=20)
    assert r.status_code == 200


def test_6_get_intervention_has_events(pro_headers, flow_ctx):
    iid = flow_ctx["intervention_id"]
    r = requests.get(f"{API}/interventions/{iid}", headers=pro_headers, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert len(d["events"]) >= 3  # start + voice + note


def test_7_generate_report(pro_headers, flow_ctx):
    iid = flow_ctx["intervention_id"]
    r = requests.post(f"{API}/interventions/{iid}/report/generate",
                      headers=pro_headers, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "draft"
    assert d["content_json"] is not None
    flow_ctx["report_id"] = d["id"]


def test_8_validate_report(pro_headers, flow_ctx):
    rid = flow_ctx["report_id"]
    r = requests.post(f"{API}/reports/{rid}/validate", headers=pro_headers, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "validated"
    assert d["pdf_key"]


def test_9_validated_report_locked(pro_headers, flow_ctx):
    rid = flow_ctx["report_id"]
    r = requests.put(f"{API}/reports/{rid}", headers=pro_headers, json={"title": "hack"}, timeout=20)
    assert r.status_code == 409


def test_10_report_pdf(pro_headers, flow_ctx):
    rid = flow_ctx["report_id"]
    r = requests.get(f"{API}/reports/{rid}/pdf", headers=pro_headers, timeout=20)
    assert r.status_code == 200
    assert "url" in r.json()


def test_11_invoice_from_intervention(pro_headers, flow_ctx):
    iid = flow_ctx["intervention_id"]
    r = requests.post(f"{API}/interventions/{iid}/invoice", headers=pro_headers, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "draft"
    flow_ctx["invoice_id"] = d["id"]


def test_12_update_invoice_items(pro_headers, flow_ctx):
    inv_id = flow_ctx["invoice_id"]
    r = requests.put(f"{API}/invoices/{inv_id}", headers=pro_headers,
                     json={"items": [{"description": "Main d'œuvre", "quantity": 2,
                                      "unit": "h", "unit_price_ht": 60.0, "vat_rate": 20}]}, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert abs(d["subtotal_ht"] - 120.0) < 0.01
    assert abs(d["total_ttc"] - 144.0) < 0.01


def test_13_finalize_invoice(pro_headers, flow_ctx):
    inv_id = flow_ctx["invoice_id"]
    r = requests.post(f"{API}/invoices/{inv_id}/finalize", headers=pro_headers, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "final"
    assert d["number"] and "-" in d["number"]
    flow_ctx["invoice_number"] = d["number"]


def test_14_finalized_invoice_locked(pro_headers, flow_ctx):
    inv_id = flow_ctx["invoice_id"]
    r = requests.put(f"{API}/invoices/{inv_id}", headers=pro_headers, json={"items": []}, timeout=20)
    assert r.status_code == 409


def test_15_create_and_send_email_pending(pro_headers, flow_ctx):
    payload = {"client_id": flow_ctx["client_id"], "intervention_id": flow_ctx["intervention_id"],
               "recipient": "TEST_marie@example.com", "subject": "Votre facture",
               "body": "Bonjour,\nVeuillez trouver votre facture.",
               "attachments": [{"type": "invoice", "id": flow_ctx["invoice_id"], "name": "facture.pdf"}]}
    r = requests.post(f"{API}/emails", headers=pro_headers, json=payload, timeout=20)
    assert r.status_code == 200
    eid = r.json()["id"]
    r = requests.post(f"{API}/emails/{eid}/send", headers=pro_headers, timeout=30)
    assert r.status_code == 200
    d = r.json()
    # Resend disabled -> status pending expected
    assert d["email"]["status"] == "pending"
    assert d["email_enabled"] is False


def test_16_services_crud(pro_headers):
    r = requests.post(f"{API}/services", headers=pro_headers,
                      json={"name": "TEST_Débouchage", "unit_price_ht": 90, "vat_rate": 20}, timeout=20)
    assert r.status_code == 200
    sid = r.json()["id"]
    r = requests.get(f"{API}/services", headers=pro_headers, timeout=20)
    assert r.status_code == 200
    assert any(s["id"] == sid for s in r.json())
    r = requests.delete(f"{API}/services/{sid}", headers=pro_headers, timeout=20)
    assert r.status_code == 200


def test_17_lists_after_flow(pro_headers, flow_ctx):
    for path in ("reports", "invoices", "quotes", "emails", "interventions"):
        r = requests.get(f"{API}/{path}", headers=pro_headers, timeout=20)
        assert r.status_code == 200, path
        assert isinstance(r.json(), list)


def test_18_cleanup(pro_headers, flow_ctx):
    if flow_ctx.get("intervention_id"):
        requests.delete(f"{API}/interventions/{flow_ctx['intervention_id']}", headers=pro_headers, timeout=20)
    if flow_ctx.get("client_id"):
        requests.delete(f"{API}/clients/{flow_ctx['client_id']}", headers=pro_headers, timeout=20)
