create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  price integer not null check (price >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.admins enable row level security;

drop policy if exists "public read active products" on public.products;
create policy "public read active products"
on public.products
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "admin read all products" on public.products;
create policy "admin read all products"
on public.products
for select
to authenticated
using (public.is_admin());

drop policy if exists "admin insert products" on public.products;
create policy "admin insert products"
on public.products
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admin update products" on public.products;
create policy "admin update products"
on public.products
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin delete products" on public.products;
create policy "admin delete products"
on public.products
for delete
to authenticated
using (public.is_admin());

drop policy if exists "admins can read their row" on public.admins;
create policy "admins can read their row"
on public.admins
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "admins can insert their row" on public.admins;
create policy "admins can insert their row"
on public.admins
for insert
to authenticated
with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

alter table storage.objects enable row level security;

drop policy if exists "public read product images" on storage.objects;
create policy "public read product images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'products');

drop policy if exists "admin upload product images" on storage.objects;
create policy "admin upload product images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'products' and public.is_admin());

drop policy if exists "admin update product images" on storage.objects;
create policy "admin update product images"
on storage.objects
for update
to authenticated
using (bucket_id = 'products' and public.is_admin())
with check (bucket_id = 'products' and public.is_admin());

drop policy if exists "admin delete product images" on storage.objects;
create policy "admin delete product images"
on storage.objects
for delete
to authenticated
using (bucket_id = 'products' and public.is_admin());
