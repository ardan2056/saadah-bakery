create table if not exists public.site_assets (
  id bigserial primary key,
  key text unique not null,
  image_url text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.site_assets enable row level security;

create policy "Public can read site assets"
on public.site_assets
for select
using (true);

create policy "Authenticated users can manage site assets"
on public.site_assets
for insert
with check (auth.role() = 'authenticated');

create policy "Authenticated users can update site assets"
on public.site_assets
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Authenticated users can delete site assets"
on public.site_assets
for delete
using (auth.role() = 'authenticated');
