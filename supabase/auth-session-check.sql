-- 플랜두씨 다이어리: 로그아웃·비밀번호 변경 뒤에는 예전 접근 토큰도 데이터 API 에서 거절한다 (7번 카드 3 C109·C114)
--
-- 왜 필요한가
--   접근 토큰(JWT)은 서버가 상태를 저장하지 않는 값이라, 로그아웃해도 만료(1시간) 전까지 데이터 API 가 받아 줬다.
--   (실측: 로그아웃 뒤 같은 토큰으로 review_summary 를 부르면 200)
--   토큰 안의 session_id 가 auth.sessions 에 아직 있는지 확인하면, 로그아웃(전체 세션 끊기)·비밀번호 변경으로
--   세션이 지워진 직후부터 그 토큰은 통하지 않는다.
--
-- 사용법: auth-lock.sql 을 적용한 DB 에서 한 번만 실행한다. (SQL Editor 에 붙여넣고 Run)
--   전체가 하나의 트랜잭션이라 도중에 실패하면 아무것도 바뀌지 않는다. 이메일 같은 값을 바꿀 곳은 없다.
--
-- 거절이 만들어지는 곳
--   함수: require_user() 가 session_alive() 를 확인 → 끊긴 세션이면 403(42501)
--   표 읽기: RLS 정책 "내 것만 읽기" 에 session_alive() 조건 → 끊긴 세션이면 빈 목록(자료는 나가지 않는다)

begin;

-- 이 요청의 토큰이 가리키는 세션이 지금도 살아 있고, 그 세션의 주인이 토큰의 사용자인가.
create or replace function public.session_alive() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from auth.sessions s
     where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
       and s.user_id = auth.uid()
  );
$$;

revoke all on function public.session_alive() from public, anon, authenticated;
grant execute on function public.session_alive() to authenticated;

-- 모든 쓰기·읽기 함수가 맨 처음 부르는 확인에 세션 확인을 더한다.
create or replace function public.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if not public.session_alive() then
    raise exception '로그인이 끝났습니다. 다시 로그인해 주세요.' using errcode = '42501';
  end if;
  return me;
end $$;

-- 표 읽기도 같은 조건을 건다.
drop policy "내 것만 읽기" on public.plans;
drop policy "내 것만 읽기" on public.plan_revisions;
drop policy "내 것만 읽기" on public.tasks;
drop policy "내 것만 읽기" on public.executions;
drop policy "내 것만 읽기" on public.retrospectives;

create policy "내 것만 읽기" on public.plans          for select to authenticated using (user_id = (select auth.uid()) and (select public.session_alive()));
create policy "내 것만 읽기" on public.plan_revisions for select to authenticated using (user_id = (select auth.uid()) and (select public.session_alive()));
create policy "내 것만 읽기" on public.tasks          for select to authenticated using (user_id = (select auth.uid()) and (select public.session_alive()));
create policy "내 것만 읽기" on public.executions     for select to authenticated using (user_id = (select auth.uid()) and (select public.session_alive()));
create policy "내 것만 읽기" on public.retrospectives for select to authenticated using (user_id = (select auth.uid()) and (select public.session_alive()));

notify pgrst, 'reload schema';

commit;

-- 실행 뒤 확인 (SQL Editor 에서 따로 실행):
--   select tablename, policyname, qual from pg_policies where schemaname = 'public';   -- 5개 모두 session_alive 가 보여야 한다
