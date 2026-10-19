-- 플랜두씨 다이어리: 로그인한 본인이 자기 계정을 탈퇴한다 — 계정과 모든 자료가 함께 지워진다 (7번 카드 4 C134)
--
-- 무엇을 하나
--   화면의 [계정 탈퇴]를 두 번 확인한 뒤 이 함수(delete_my_account)를 부른다.
--   함수는 토큰의 주인(auth.uid()) 계정 하나만 지운다. 인자가 없어서 다른 계정을 지정할 길이 없다.
--   계정(auth.users)이 지워지면 on delete cascade 로 다섯 표(plans·plan_revisions·tasks·executions·retrospectives)의
--   그 계정 자료와 세션·갱신 토큰이 함께 지워진다. (auth-lock.sql 의 외래키)
--
-- 보안
--   * require_user() 가 먼저 "로그인했고 세션이 살아 있는지"를 확인한다. 로그인하지 않았거나 로그아웃한 토큰은 403(42501).
--   * anon(로그인 안 한 사람)에게는 실행 권한이 없다. authenticated 만 부를 수 있다.
--   * security definer + search_path = '' : 함수 안에서는 모든 이름에 스키마를 붙였다.
--   * 되돌릴 수 없는 동작이다. 화면에서 [탈퇴] 확인을 두 번 눌러야만 부른다.
--
-- 사용법: auth-lock.sql, auth-session-check.sql 까지 적용한 DB 에서 한 번만 실행한다. (SQL Editor 에 붙여넣고 Run)
--   전체가 하나의 트랜잭션이라 도중에 실패하면 아무것도 바뀌지 않는다. 바꿀 값은 없다.
--
-- 되돌리기(함수만 없앤다. 이미 지워진 계정은 돌아오지 않는다):
--   drop function if exists public.delete_my_account();

begin;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_user();
begin
  delete from auth.users where id = me;
end $$;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';

commit;

-- 실행 뒤 확인 (SQL Editor 에서 따로 실행):
--   select proname, prosecdef from pg_proc where proname = 'delete_my_account';   -- prosecdef 가 true
