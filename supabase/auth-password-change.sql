-- 플랜두씨 다이어리: 비밀번호를 바꾸면 그 계정의 모든 세션을 끊는다 — 바꾼 세션 자신도 포함 (7번 카드 3 C114)
--
-- 왜 필요한가
--   인증 서비스(Supabase Auth)는 비밀번호를 바꾸면 "다른 기기"의 세션은 끊지만, 바꾸는 데 쓴 세션은 살려 둔다.
--   (실측: 같은 계정으로 세션 3개를 만들고 한 세션에서 비밀번호를 바꾸자, 바꾼 세션은 자료 조회 200·갱신 200,
--    나머지 둘은 빈 목록·403·갱신 400)
--   그러면 비밀번호를 바꾸기 전에 발급된 토큰이 바꾼 뒤에도 통한다. 토큰을 훔친 쪽이 먼저 비밀번호를 바꿔도 살아남는다.
--   비밀번호 칸(encrypted_password)이 바뀌는 순간 그 계정의 세션을 모두 지우면, 이전에 발급한 접근 토큰과 갱신 토큰이
--   함께 통하지 않는다. (접근 토큰은 auth-session-check.sql 의 session_alive() 가, 갱신 토큰은 세션이 지워져서 막힌다)
--
-- 사용법: auth-session-check.sql 까지 적용한 DB 에서 한 번만 실행한다. (SQL Editor 에 붙여넣고 Run)
--   전체가 하나의 트랜잭션이라 도중에 실패하면 아무것도 바뀌지 않는다. 이메일 같은 값을 바꿀 곳은 없다.
--
-- 바뀌는 것
--   * 비밀번호를 바꾼 사람도 로그아웃된다. 이 앱에는 비밀번호 변경 화면이 없어서 화면에서 불편해질 일은 없다.
--   * 가입(insert)·로그인에는 영향이 없다. 비밀번호 칸의 값이 실제로 바뀔 때만 동작한다.
--
-- 되돌리기(문제가 생기면 SQL Editor 에서 실행):
--   drop trigger if exists revoke_sessions_on_password_change on auth.users;
--   drop function if exists public.revoke_sessions_on_password_change();

begin;

create or replace function public.revoke_sessions_on_password_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- 세션을 지우면 그 세션의 갱신 토큰도 함께 지워진다(on delete cascade).
  delete from auth.sessions where user_id = new.id;
  return new;
end $$;

revoke all on function public.revoke_sessions_on_password_change() from public, anon, authenticated;

drop trigger if exists revoke_sessions_on_password_change on auth.users;
create trigger revoke_sessions_on_password_change
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function public.revoke_sessions_on_password_change();

commit;

-- 실행 뒤 확인 (SQL Editor 에서 따로 실행):
--   select tgname, tgenabled from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;   -- revoke_sessions_on_password_change 가 보이고 O(켜짐)
