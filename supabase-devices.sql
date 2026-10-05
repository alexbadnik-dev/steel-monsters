-- Учёт устройств для ШТАБа (v88): игра анонимно отмечает каждый заход,
-- даже если игрок не вписал имя. Выполнить один раз:
-- Supabase -> SQL Editor -> вставить всё -> Run.

create table if not exists public.devices (
  id text primary key,
  data jsonb,
  created_at timestamptz default now()
);

alter table public.devices enable row level security;

-- анонимный ключ игры может создавать/обновлять/читать отметки устройств
create policy devices_ins on public.devices for insert with check (true);
create policy devices_upd on public.devices for update using (true);
create policy devices_sel on public.devices for select using (true);

-- защита от мусора: id — ровно 16 hex-символов, данные компактные
alter table public.devices
  add constraint devices_sane check (
    id ~ '^[0-9a-f]{16}$' and pg_column_size(data) < 600
  );
