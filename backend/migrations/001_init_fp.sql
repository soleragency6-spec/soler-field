-- FieldPro SaaS — multi-tenant schema with Row Level Security
-- Source of truth: Supabase PostgreSQL. Every business table carries workspace_id.

create schema if not exists fieldpro;
create extension if not exists pgcrypto with schema extensions;

-- =====================================================================
-- Identity helpers used by RLS. FastAPI sets request.jwt.claims per tx
-- and SET LOCAL ROLE authenticated so table-owner bypass does not apply.
-- =====================================================================
create or replace function fieldpro.request_user_id()
returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
$$;

-- =====================================================================
-- Core tenancy
-- =====================================================================
create table if not exists fieldpro.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mon entreprise',
  subscription_status text not null default 'active', -- active | suspended | trialing | canceled
  plan text not null default 'pro',
  seats int not null default 1,
  storage_quota_bytes bigint not null default 21474836480, -- 20 Go
  public_signup boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists fieldpro.workspace_members (
  workspace_id uuid not null references fieldpro.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','technician')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists idx_wm_user on fieldpro.workspace_members(user_id);

-- Platform super admins (SaaS owner). Not workspace scoped.
create table if not exists fieldpro.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

drop function if exists fieldpro.is_workspace_member(uuid) cascade;
create or replace function fieldpro.is_workspace_member(w uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from fieldpro.workspace_members m
    where m.workspace_id = w and m.user_id = fieldpro.request_user_id()
  )
$$;

-- =====================================================================
-- Branding / company profile (white-label, one per workspace)
-- =====================================================================
create table if not exists fieldpro.brand_settings (
  workspace_id uuid primary key references fieldpro.workspaces(id) on delete cascade,
  company_name text not null default 'Mon entreprise',
  app_name text not null default 'FieldPro',
  logo_url text,
  primary_color text not null default '#1D4ED8',
  secondary_color text not null default '#0EA5E9',
  contact_name text,
  phone text,
  email text,
  website text,
  address text,
  siret text,
  vat_number text,
  iban text,
  currency text not null default 'EUR',
  vat_rate numeric not null default 20,
  legal_notices text,
  payment_terms text default 'Paiement à 30 jours.',
  document_footer text,
  email_signature text,
  invoice_prefix text not null default 'FAC',
  invoice_next_number int not null default 1,
  quote_prefix text not null default 'DEV',
  quote_next_number int not null default 1,
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- CRM
-- =====================================================================
create table if not exists fieldpro.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references fieldpro.workspaces(id) on delete cascade,
  company text,
  last_name text,
  first_name text,
  email text,
  phone text,
  billing_address text,
  service_address text,
  customer_number text,
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_clients_ws on fieldpro.clients(workspace_id);

-- =====================================================================
-- Interventions + timeline + media
-- =====================================================================
create table if not exists fieldpro.interventions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references fieldpro.workspaces(id) on delete cascade,
  client_id uuid references fieldpro.clients(id) on delete set null,
  name text not null default 'Intervention',
  reference text,
  address text,
  type text,
  technician text,
  description text,
  status text not null default 'draft'
    check (status in ('draft','in_progress','report_review','report_validated','invoice_review','invoiced','completed')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_interventions_ws on fieldpro.interventions(workspace_id);
create index if not exists idx_interventions_client on fieldpro.interventions(client_id);

create table if not exists fieldpro.media (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references fieldpro.workspaces(id) on delete cascade,
  intervention_id uuid references fieldpro.interventions(id) on delete cascade,
  client_id uuid references fieldpro.clients(id) on delete set null,
  kind text not null check (kind in ('photo','video','audio','document')),
  storage_key text not null,
  file_name text,
  mime_type text,
  size_bytes bigint not null default 0,
  title text,
  comment text,
  transcript text,
  sort_order int not null default 0,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_media_ws on fieldpro.media(workspace_id);
create index if not exists idx_media_intervention on fieldpro.media(intervention_id);

-- Chronological timeline entries for the field mode
create table if not exists fieldpro.intervention_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references fieldpro.workspaces(id) on delete cascade,
  intervention_id uuid not null references fieldpro.interventions(id) on delete cascade,
  kind text not null check (kind in ('start','voice','photo','video','note','event')),
  content text,
  transcript text,
  media_id uuid references fieldpro.media(id) on delete set null,
  ts timestamptz not null default now()
);
create index if not exists idx_events_intervention on fieldpro.intervention_events(intervention_id);

-- =====================================================================
-- Reports
-- =====================================================================
create table if not exists fieldpro.reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references fieldpro.workspaces(id) on delete cascade,
  intervention_id uuid references fieldpro.interventions(id) on delete cascade,
  client_id uuid references fieldpro.clients(id) on delete set null,
  title text not null default 'Rapport d''intervention',
  content_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','validated')),
  version int not null default 1,
  pdf_key text,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_reports_ws on fieldpro.reports(workspace_id);

-- =====================================================================
-- Service catalog
-- =====================================================================
create table if not exists fieldpro.services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references fieldpro.workspaces(id) on delete cascade,
  name text not null,
  description text,
  category text,
  unit text not null default 'u',
  unit_price_ht numeric,          -- null => TARIF À RENSEIGNER
  vat_rate numeric not null default 20,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_services_ws on fieldpro.services(workspace_id);

-- =====================================================================
-- Invoices & quotes
-- =====================================================================
create table if not exists fieldpro.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references fieldpro.workspaces(id) on delete cascade,
  client_id uuid references fieldpro.clients(id) on delete set null,
  intervention_id uuid references fieldpro.interventions(id) on delete set null,
  number text,
  status text not null default 'draft' check (status in ('draft','final')),
  issue_date date not null default current_date,
  due_date date,
  notes text,
  discount numeric not null default 0,
  subtotal_ht numeric not null default 0,
  vat_amount numeric not null default 0,
  total_ttc numeric not null default 0,
  payment_terms text,
  pdf_key text,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_invoices_ws on fieldpro.invoices(workspace_id);

create table if not exists fieldpro.invoice_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references fieldpro.workspaces(id) on delete cascade,
  invoice_id uuid not null references fieldpro.invoices(id) on delete cascade,
  description text not null default '',
  quantity numeric not null default 1,
  unit text not null default 'u',
  unit_price_ht numeric,
  vat_rate numeric not null default 20,
  line_total_ht numeric not null default 0,
  sort_order int not null default 0
);
create index if not exists idx_invitems_invoice on fieldpro.invoice_items(invoice_id);

create table if not exists fieldpro.quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references fieldpro.workspaces(id) on delete cascade,
  client_id uuid references fieldpro.clients(id) on delete set null,
  intervention_id uuid references fieldpro.interventions(id) on delete set null,
  number text,
  status text not null default 'draft' check (status in ('draft','final','accepted','refused')),
  issue_date date not null default current_date,
  valid_until date,
  notes text,
  discount numeric not null default 0,
  subtotal_ht numeric not null default 0,
  vat_amount numeric not null default 0,
  total_ttc numeric not null default 0,
  pdf_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_quotes_ws on fieldpro.quotes(workspace_id);

create table if not exists fieldpro.quote_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references fieldpro.workspaces(id) on delete cascade,
  quote_id uuid not null references fieldpro.quotes(id) on delete cascade,
  description text not null default '',
  quantity numeric not null default 1,
  unit text not null default 'u',
  unit_price_ht numeric,
  vat_rate numeric not null default 20,
  line_total_ht numeric not null default 0,
  sort_order int not null default 0
);
create index if not exists idx_qitems_quote on fieldpro.quote_items(quote_id);

-- =====================================================================
-- Templates (report/invoice/quote) — uploaded by pro, take priority
-- =====================================================================
create table if not exists fieldpro.document_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references fieldpro.workspaces(id) on delete cascade,
  kind text not null check (kind in ('report','invoice','quote')),
  name text not null,
  source_media_id uuid references fieldpro.media(id) on delete set null,
  structure_json jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_templates_ws on fieldpro.document_templates(workspace_id);

-- =====================================================================
-- Emails
-- =====================================================================
create table if not exists fieldpro.emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references fieldpro.workspaces(id) on delete cascade,
  client_id uuid references fieldpro.clients(id) on delete set null,
  intervention_id uuid references fieldpro.interventions(id) on delete set null,
  recipient text,
  subject text,
  body text,
  attachments_json jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','pending','sent','failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists idx_emails_ws on fieldpro.emails(workspace_id);

-- =====================================================================
-- Subscriptions (Stripe-ready, manual for now)
-- =====================================================================
create table if not exists fieldpro.subscriptions (
  workspace_id uuid primary key references fieldpro.workspaces(id) on delete cascade,
  plan text not null default 'pro',
  status text not null default 'active',
  period text not null default 'monthly',
  seats int not null default 1,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists fieldpro.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references fieldpro.workspaces(id) on delete cascade,
  user_id uuid,
  action text not null,
  entity text,
  entity_id uuid,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Row Level Security
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'workspaces','workspace_members','brand_settings','clients','interventions',
    'media','intervention_events','reports','services','invoices','invoice_items',
    'quotes','quote_items','document_templates','emails','subscriptions'
  ] loop
    execute format('alter table fieldpro.%I enable row level security', t);
  end loop;
end$$;

grant usage on schema fieldpro to authenticated;
grant select, insert, update, delete on all tables in schema fieldpro to authenticated;
grant execute on function fieldpro.request_user_id() to authenticated;
grant execute on function fieldpro.is_workspace_member(uuid) to authenticated;

-- workspaces: member can read/update own
drop policy if exists ws_rw on fieldpro.workspaces;
create policy ws_rw on fieldpro.workspaces for all to authenticated
  using (fieldpro.is_workspace_member(id)) with check (fieldpro.is_workspace_member(id));

-- workspace_members: can see rows of own workspace
drop policy if exists wm_rw on fieldpro.workspace_members;
create policy wm_rw on fieldpro.workspace_members for all to authenticated
  using (user_id = fieldpro.request_user_id() or fieldpro.is_workspace_member(workspace_id))
  with check (fieldpro.is_workspace_member(workspace_id));

-- Generic workspace_id policy for the rest
do $$
declare t text;
begin
  foreach t in array array[
    'brand_settings','clients','interventions','media','intervention_events',
    'reports','services','invoices','invoice_items','quotes','quote_items',
    'document_templates','emails','subscriptions'
  ] loop
    execute format('drop policy if exists ws_scope on fieldpro.%I', t);
    execute format(
      'create policy ws_scope on fieldpro.%I for all to authenticated using (fieldpro.is_workspace_member(workspace_id)) with check (fieldpro.is_workspace_member(workspace_id))', t);
  end loop;
end$$;
