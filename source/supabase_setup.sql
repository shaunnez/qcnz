-- Queen Charlotte Track 3D: shared photo album. Run one time in the Supabase SQL Editor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qct', 'qct', true, 3145728, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

drop policy if exists "qct upload" on storage.objects;
create policy "qct upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'qct');

create table if not exists public.qct_photos (
  id text primary key,
  album text not null,
  t bigint not null,
  exact boolean default false,
  lat double precision,
  lon double precision,
  by text,
  path text not null,
  created_at timestamptz default now()
);
alter table public.qct_photos enable row level security;
drop policy if exists "qct add" on public.qct_photos;
create policy "qct add" on public.qct_photos for insert to anon, authenticated with check (true);
grant insert on public.qct_photos to anon, authenticated;

create or replace function public.qct_list(p_album text)
returns setof public.qct_photos
language sql security definer set search_path = public stable
as $$ select * from public.qct_photos where album = p_album order by t $$;
grant execute on function public.qct_list(text) to anon, authenticated;

notify pgrst, 'reload schema';
