-- 패스키로 잠근 "나만의 자리" — Supabase 저장소 스키마
--
-- 사용법: Supabase 대시보드 → SQL Editor → New query → 이 파일 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전합니다(이미 있으면 건너뜀).
--
-- 보안 원칙
--  1) Supabase는 로그인 기능이 아니라 "저장소"로만 쓴다. 로그인 판단은 서버(server.js)가 한다.
--  2) 모든 테이블에 행 단위 보안(RLS)을 켜고 정책을 하나도 만들지 않는다.
--     → 공개(anon) 키·로그인 사용자 키로는 어떤 행도 읽거나 쓸 수 없다.
--  3) 서버만 서비스 롤 키(SUPABASE_SERVICE_ROLE_KEY)로 접근한다. 이 키는 Vercel 환경변수에만 두고,
--     브라우저 코드·소스·기록에 절대 넣지 않는다.

-- 패스키: 공개키와 메타데이터만 저장한다 (개인키는 서버에 오지 않는다)
create table if not exists public.passkeys (
  id            text primary key,                 -- 패스키(credential) 식별자
  account_id    text not null,                    -- 'account-a' | 'account-b'
  user_handle   text not null,                    -- 계정별 사용자 핸들(무작위, 계정의 모든 패스키가 같은 값)
  name          text not null,                    -- 사람이 알아볼 이름
  public_key    text not null,                    -- 공개키(COSE, base64url). 비밀번호가 아니다
  counter       bigint not null default 0,        -- 서명 횟수 카운터
  transports    text[] not null default '{}',
  device_type   text not null,                    -- singleDevice | multiDevice
  backed_up     boolean not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists passkeys_account_idx on public.passkeys (account_id);

-- 로그인 세션: 쿠키의 세션 ID는 해시(sha256)로만 저장한다
create table if not exists public.sessions (
  sid_hash    text primary key,
  data        jsonb not null,
  expires_at  timestamptz not null
);
create index if not exists sessions_expires_idx on public.sessions (expires_at);

-- 질문(challenge): 한 번 꺼내면 삭제된다. 삭제와 조회를 한 문장으로 해서 동시에 두 번 쓰지 못한다
create table if not exists public.challenges (
  value       text primary key,
  type        text not null,                      -- 'register' | 'login'
  data        jsonb not null default '{}'::jsonb,
  expires_at  timestamptz not null
);
create index if not exists challenges_expires_idx on public.challenges (expires_at);

-- 실패 횟수 제한: 접속 주소는 해시로만 저장한다
create table if not exists public.auth_failures (
  id        bigint generated always as identity primary key,
  key_hash  text not null,
  at        timestamptz not null default now()
);
create index if not exists auth_failures_key_idx on public.auth_failures (key_hash, at);

-- 패스키 삭제: "마지막 하나는 지우지 않는다"를 한 번에(행을 잠그고) 판단한다
create or replace function public.delete_passkey(p_account text, p_id text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  perform 1 from public.passkeys where account_id = p_account for update;
  select count(*) into n from public.passkeys where account_id = p_account;
  if not exists (select 1 from public.passkeys where account_id = p_account and id = p_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if n <= 1 then
    return jsonb_build_object('status', 'last_passkey');
  end if;
  delete from public.passkeys where account_id = p_account and id = p_id;
  return jsonb_build_object('status', 'ok', 'remaining', n - 1);
end;
$$;

-- 행 단위 보안: 켜고, 정책은 만들지 않는다 (서비스 롤 키만 우회할 수 있다)
alter table public.passkeys      enable row level security;
alter table public.sessions      enable row level security;
alter table public.challenges    enable row level security;
alter table public.auth_failures enable row level security;

-- 공개 키(anon)·로그인 사용자(authenticated)의 권한도 이중으로 걷어낸다
revoke all on table public.passkeys, public.sessions, public.challenges, public.auth_failures from anon, authenticated;
revoke all on function public.delete_passkey(text, text) from public, anon, authenticated;
grant execute on function public.delete_passkey(text, text) to service_role;
