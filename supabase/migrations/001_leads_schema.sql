-- Nodo Propiedades — espejo mínimo de Google Sheets (fundación inversores)
-- No reemplaza Sheets todavía; prepara Postgres/Supabase para sync futuro.

create extension if not exists "pgcrypto";

-- Leads (hoja Leads_Bot / CRM)
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  dedupe_key text unique,
  nombre text,
  zona text,
  presupuesto text,
  tipo_operacion text,
  temperatura text check (temperatura in ('frio', 'tibio', 'caliente')),
  lead_completo boolean default false,
  canal text check (canal in ('telegram', 'whatsapp', 'messenger')),
  propiedad_seguimiento jsonb,
  estado_seguimiento text,
  status text,
  resumen text,
  last_message text,
  ultima_actualizacion timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_chat_id on leads (chat_id);
create index if not exists idx_leads_temperatura on leads (temperatura);
create index if not exists idx_leads_canal on leads (canal);
create index if not exists idx_leads_updated on leads (ultima_actualizacion desc);

-- Consultas / interacciones (hoja Consultas)
create table if not exists consultas (
  id uuid primary key default gen_random_uuid(),
  consulta_id text unique,
  chat_id text not null,
  lead_id uuid references leads (id) on delete set null,
  nombre text,
  mensaje_cliente text,
  respuesta_bot text,
  temperatura text,
  zona text,
  presupuesto text,
  operacion text,
  intencion text,
  lead_completo boolean,
  canal text,
  fecha timestamptz default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_consultas_chat_id on consultas (chat_id);
create index if not exists idx_consultas_fecha on consultas (fecha desc);

-- Propiedades (stock / hoja Propiedades)
create table if not exists propiedades (
  id text primary key,
  zona text,
  tipo text,
  precio text,
  precio_usd integer,
  ambientes text,
  operacion text,
  estado text,
  descripcion text,
  honorarios text,
  reserva text,
  medios_pago text,
  alias_cbu text,
  requisitos text,
  link_ficha text,
  fotos jsonb default '[]'::jsonb,
  interesados_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_propiedades_zona on propiedades (zona);
create index if not exists idx_propiedades_operacion on propiedades (operacion);
create index if not exists idx_propiedades_precio_usd on propiedades (precio_usd);

comment on table leads is 'Espejo CRM — origen actual: Google Sheets via n8n';
comment on table consultas is 'Historial de mensajes bot ↔ cliente';
comment on table propiedades is 'Stock inmobiliario';
