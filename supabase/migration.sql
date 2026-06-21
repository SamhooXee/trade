-- 1. Create enum for key status
create type public.block1_key_status as enum ('ACTIVE', 'INACTIVE', 'EXPIRED');

-- 2. Create profiles table to store user points
create table public.block1_profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  points integer not null default 0 check (points >= 0),
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create keys table to store activation codes
create table public.block1_keys (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  points integer not null check (points >= 0),
  status public.block1_key_status not null default 'ACTIVE'::public.block1_key_status,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  redeemed_at timestamp with time zone,
  user_id uuid references public.block1_profiles(id) on delete set null
);

-- 4. Enable Row Level Security (RLS)
alter table public.block1_profiles enable row level security;
alter table public.block1_keys enable row level security;

-- 5. Define RLS Policies for profiles
create policy "Users can view their own profile"
  on public.block1_profiles for select
  using (auth.uid() = id);

create policy "Admins can do everything on profiles"
  on public.block1_profiles for all
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- 6. Define RLS Policies for keys
create policy "Users can view their own keys"
  on public.block1_keys for select
  using (auth.uid() = user_id);

create policy "Admins can do everything on keys"
  on public.block1_keys for all
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- 7. Trigger to automatically create a profile for new users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.block1_profiles (id, email, points)
  values (new.id, new.email, 0)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 8. Backfill existing users (if any)
insert into public.block1_profiles (id, email, points)
select id, email, 0 from auth.users
on conflict (id) do nothing;

-- 9. Secure activation key redemption PL/pgSQL function (atomic transaction)
create or replace function public.block1_redeem_key(key_code text, user_id uuid)
returns jsonb
language plpgsql
security definer -- runs with owner privileges, bypassing RLS
as $$
declare
  v_key_id uuid;
  v_points integer;
  v_status public.block1_key_status;
  v_expires_at timestamp with time zone;
  v_new_balance integer;
begin
  -- Upper case key code to support case-insensitivity
  select id, points, status, expires_at
  into v_key_id, v_points, v_status, v_expires_at
  from public.block1_keys
  where code = upper(key_code)
  for update; -- Lock row to prevent race conditions

  if v_key_id is null then
    return jsonb_build_object('success', false, 'message', '激活码不存在 / Key not found');
  end if;

  if v_status = 'INACTIVE'::public.block1_key_status then
    return jsonb_build_object('success', false, 'message', '激活码已被使用 / Key has already been redeemed');
  end if;

  if v_status = 'EXPIRED'::public.block1_key_status or v_expires_at <= now() then
    return jsonb_build_object('success', false, 'message', '激活码已过期 / Key has expired');
  end if;

  -- Mark key as inactive
  update public.block1_keys
  set status = 'INACTIVE'::public.block1_key_status,
      user_id = block1_redeem_key.user_id,
      redeemed_at = now()
  where id = v_key_id;

  -- Increment user points (upsert in case profile doesn't exist)
  insert into public.block1_profiles (id, points, updated_at)
  values (block1_redeem_key.user_id, v_points, now())
  on conflict (id) do update
  set points = public.block1_profiles.points + v_points,
      updated_at = now()
  returning points into v_new_balance;

  return jsonb_build_object(
    'success', true,
    'points', v_points,
    'newBalance', v_new_balance,
    'message', '兑换成功 / Successfully redeemed'
  );
exception
  when others then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;
