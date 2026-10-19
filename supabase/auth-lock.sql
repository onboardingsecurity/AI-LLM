-- 플랜두씨 다이어리: 내 자료를 나만 보게 잠그는 변경 (7번 카드 1·4)
--
-- 사용법: 이미 schema.sql 이 적용된 DB 에 한 번만 실행한다. (schema.sql 은 처음 만들 때만 쓴다)
--   1) Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣는다.
--   2) 붙여넣은 창에서(이 파일이 아니라) "<내 이메일>" 을 가입할 때 쓴 내 이메일로 바꾸고 Run 한 번만 실행한다.
--      (이 파일에는 실제 이메일을 적지 않는다.)
--   3) 전체가 하나의 트랜잭션이라 도중에 실패하면 아무것도 바뀌지 않는다. (실패하면 오류 문구를 알려 줄 것)
--
-- 무엇이 바뀌나
--   * 모든 표에 user_id(주인)가 생긴다. 기존 6번 자료는 전부 위 이메일의 계정으로 옮긴다.
--   * anon(로그인 안 한 사람)의 접근을 모두 거둔다. 로그인한 사람은 자기 행만 읽을 수 있다.
--   * 표에 직접 쓰기(insert·update·delete)는 모두 막고, 쓰기는 아래 함수로만 한다.
--     함수는 주인을 확인하고, 남의 자료이거나 없으면 같은 404(PT404)로 답한다. (존재를 감춘다)
--   * 계정을 지우면(auth.users) 그 사람의 자료가 함께 지워진다. (on delete cascade)
--
-- 거절이 만들어지는 곳 (제출문에 적을 소스 위치)
--   읽기: 표의 RLS 정책 "내 것만 읽기" + review_tasks / plan_revisions_of 함수
--   쓰기: create_*, update_*, delete_task, complete_task, reopen_task, hand_over_improvement 함수
--   공통 확인: require_user(), assert_plan_owner()

begin;

-- =====================================================================
-- 1. 주인(user_id) 추가와 기존 자료 옮기기
-- =====================================================================

alter table public.plans          add column user_id uuid;
alter table public.plan_revisions add column user_id uuid;
alter table public.tasks          add column user_id uuid;
alter table public.executions     add column user_id uuid;
alter table public.retrospectives add column user_id uuid;

-- 옮기는 동안 수정 시각이 바뀌지 않게 시각 갱신 트리거를 잠시 끈다.
alter table public.plans disable trigger plans_touch;
alter table public.tasks disable trigger tasks_touch;

do $$
declare
  v_email text := '<내 이메일>';
  v_user  uuid;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(v_email);
  if v_user is null then
    raise exception '이 이메일로 가입한 계정이 없습니다. "<내 이메일>" 을 실제 이메일로 바꿨는지 확인해 주세요.';
  end if;

  update public.plans          set user_id = v_user where user_id is null;
  update public.plan_revisions set user_id = v_user where user_id is null;
  update public.tasks          set user_id = v_user where user_id is null;
  update public.executions     set user_id = v_user where user_id is null;
  update public.retrospectives set user_id = v_user where user_id is null;
end $$;

alter table public.plans enable trigger plans_touch;
alter table public.tasks enable trigger tasks_touch;

alter table public.plans          alter column user_id set not null;
alter table public.plan_revisions alter column user_id set not null;
alter table public.tasks          alter column user_id set not null;
alter table public.executions     alter column user_id set not null;
alter table public.retrospectives alter column user_id set not null;

alter table public.plans          add constraint plans_user_fkey          foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.plan_revisions add constraint plan_revisions_user_fkey foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.tasks          add constraint tasks_user_fkey          foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.executions     add constraint executions_user_fkey     foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.retrospectives add constraint retrospectives_user_fkey foreign key (user_id) references auth.users (id) on delete cascade;

-- 새 행의 주인은 요청한 사람(토큰의 사용자)으로 자동 채워진다. 브라우저가 user_id 를 보내도 쓰지 않는다.
alter table public.plans          alter column user_id set default auth.uid();
alter table public.plan_revisions alter column user_id set default auth.uid();
alter table public.tasks          alter column user_id set default auth.uid();
alter table public.executions     alter column user_id set default auth.uid();
alter table public.retrospectives alter column user_id set default auth.uid();

create index plans_user_idx          on public.plans (user_id);
create index plan_revisions_user_idx on public.plan_revisions (user_id);
create index tasks_user_idx          on public.tasks (user_id);
create index executions_user_idx     on public.executions (user_id);
create index retrospectives_user_idx on public.retrospectives (user_id);

-- 같은 요청 키는 사람마다 따로 센다. (남의 키와 부딪혀도 내 요청에 영향이 없다)
alter table public.executions drop constraint if exists executions_request_key_key;
alter table public.executions add constraint executions_user_request_key unique (user_id, request_key);

-- =====================================================================
-- 2. 표 접근: anon 거두기, 로그인한 사람은 내 행 읽기만
-- =====================================================================

revoke all on table
  public.plans, public.plan_revisions, public.tasks, public.executions, public.retrospectives
  from anon, authenticated;

drop policy if exists "공개 읽기" on public.plans;
drop policy if exists "공개 읽기" on public.plan_revisions;
drop policy if exists "공개 읽기" on public.tasks;
drop policy if exists "공개 읽기" on public.executions;
drop policy if exists "공개 읽기" on public.retrospectives;
drop policy if exists "공개 쓰기" on public.plans;
drop policy if exists "공개 수정" on public.plans;
drop policy if exists "공개 쓰기" on public.tasks;
drop policy if exists "공개 수정" on public.tasks;

-- 표에는 읽기 권한만 준다. 쓰기 권한이 없으므로 표에 직접 보내는 쓰기는 403 으로 거절된다.
grant select on
  public.plans, public.plan_revisions, public.tasks, public.executions, public.retrospectives
  to authenticated;

create policy "내 것만 읽기" on public.plans          for select to authenticated using (user_id = (select auth.uid()));
create policy "내 것만 읽기" on public.plan_revisions for select to authenticated using (user_id = (select auth.uid()));
create policy "내 것만 읽기" on public.tasks          for select to authenticated using (user_id = (select auth.uid()));
create policy "내 것만 읽기" on public.executions     for select to authenticated using (user_id = (select auth.uid()));
create policy "내 것만 읽기" on public.retrospectives for select to authenticated using (user_id = (select auth.uid()));

-- =====================================================================
-- 3. 주인 확인 도우미 (브라우저에는 열지 않는다. 아래 함수들만 부른다)
-- =====================================================================

-- 로그인한 사람의 id. 로그인하지 않았으면 403(42501).
create or replace function public.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  return me;
end $$;

-- 내 계획이 아니거나 없으면 404(PT404). 둘을 구별하지 않는다.
create or replace function public.assert_plan_owner(p_plan_id bigint) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.require_user();
begin
  perform 1 from public.plans p where p.id = p_plan_id and p.user_id = me;
  if not found then
    raise exception '찾을 수 없습니다.' using errcode = 'PT404';
  end if;
end $$;

-- =====================================================================
-- 4. 트리거 보완: 수정 이력에도 주인을 적는다
-- =====================================================================

create or replace function public.record_plan_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and (new.title, new.start_date, new.end_date, new.priority, new.success_criteria, new.estimated_minutes)
         is not distinct from
         (old.title, old.start_date, old.end_date, old.priority, old.success_criteria, old.estimated_minutes) then
    return new;
  end if;

  insert into public.plan_revisions
    (plan_id, user_id, version, title, start_date, end_date, priority, success_criteria, estimated_minutes)
  values
    (new.id,
     new.user_id,
     coalesce((select max(r.version) from public.plan_revisions r where r.plan_id = new.id), 0) + 1,
     new.title, new.start_date, new.end_date, new.priority, new.success_criteria, new.estimated_minutes);
  return new;
end $$;

-- =====================================================================
-- 5. 쓰기·읽기 함수 (모두 주인을 확인한다)
-- =====================================================================

-- 계획 만들기·고치기
create or replace function public.create_plan(
  p_title             text,
  p_start_date        date,
  p_end_date          date,
  p_priority          smallint,
  p_success_criteria  text,
  p_estimated_minutes integer
) returns public.plans
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_user();
  r  public.plans;
begin
  insert into public.plans
    (user_id, title, start_date, end_date, priority, success_criteria, estimated_minutes)
  values
    (me, p_title, p_start_date, p_end_date, p_priority, p_success_criteria, p_estimated_minutes)
  returning * into r;
  return r;
end $$;

create or replace function public.update_plan(
  p_id                bigint,
  p_title             text,
  p_start_date        date,
  p_end_date          date,
  p_priority          smallint,
  p_success_criteria  text,
  p_estimated_minutes integer
) returns public.plans
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_user();
  r  public.plans;
begin
  update public.plans
     set title = p_title, start_date = p_start_date, end_date = p_end_date, priority = p_priority,
         success_criteria = p_success_criteria, estimated_minutes = p_estimated_minutes
   where id = p_id and user_id = me
  returning * into r;
  if not found then
    raise exception '찾을 수 없습니다.' using errcode = 'PT404';
  end if;
  return r;
end $$;

-- 계획 수정 이력 읽기 (남의 계획이면 404)
create or replace function public.plan_revisions_of(p_plan_id bigint) returns setof public.plan_revisions
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.require_user();
begin
  perform public.assert_plan_owner(p_plan_id);
  return query
    select r.* from public.plan_revisions r
     where r.plan_id = p_plan_id and r.user_id = me
     order by r.version;
end $$;

-- 할 일 만들기·고치기·지우기(지운 시각만 적는다)
create or replace function public.create_task(
  p_plan_id           bigint,
  p_title             text,
  p_due_date          date,
  p_priority          smallint,
  p_tags              text[],
  p_estimated_minutes integer
) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_user();
  r  public.tasks;
begin
  perform public.assert_plan_owner(p_plan_id);
  insert into public.tasks
    (user_id, plan_id, title, due_date, priority, tags, estimated_minutes)
  values
    (me, p_plan_id, p_title, p_due_date, p_priority, coalesce(p_tags, '{}'), p_estimated_minutes)
  returning * into r;
  return r;
end $$;

create or replace function public.update_task(
  p_id                bigint,
  p_title             text,
  p_due_date          date,
  p_priority          smallint,
  p_tags              text[],
  p_estimated_minutes integer
) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_user();
  r  public.tasks;
begin
  update public.tasks
     set title = p_title, due_date = p_due_date, priority = p_priority,
         tags = coalesce(p_tags, '{}'), estimated_minutes = p_estimated_minutes
   where id = p_id and user_id = me and deleted_at is null
  returning * into r;
  if not found then
    raise exception '찾을 수 없습니다.' using errcode = 'PT404';
  end if;
  return r;
end $$;

create or replace function public.delete_task(p_id bigint) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_user();
  r  public.tasks;
begin
  update public.tasks set deleted_at = now()
   where id = p_id and user_id = me and deleted_at is null
  returning * into r;
  if not found then
    raise exception '찾을 수 없습니다.' using errcode = 'PT404';
  end if;
  return r;
end $$;

-- 완료하기: 같은 요청을 몇 번 보내도 완료 기록은 한 건만 남는다. (schema.sql 과 같은 규칙 + 주인 확인)
create or replace function public.complete_task(
  p_task_id        bigint,
  p_request_key    uuid,
  p_started_at     timestamptz,
  p_ended_at       timestamptz,
  p_actual_minutes integer,
  p_blocked_reason text default null
) returns public.executions
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_user();
  e  public.executions;
begin
  perform 1 from public.tasks t
    where t.id = p_task_id and t.user_id = me and t.deleted_at is null
    for update;
  if not found then
    raise exception '찾을 수 없습니다.' using errcode = 'PT404';
  end if;

  select * into e from public.executions where request_key = p_request_key and user_id = me;
  if found then
    if e.task_id <> p_task_id then
      raise exception '요청 키가 다른 할 일에 이미 쓰였습니다.';
    end if;
    return e;
  end if;

  select * into e from public.executions where task_id = p_task_id and status = 'active';
  if found then
    return e;
  end if;

  insert into public.executions
    (user_id, task_id, started_at, ended_at, actual_minutes, blocked_reason, request_key)
  values
    (me, p_task_id, p_started_at, p_ended_at, p_actual_minutes,
     nullif(btrim(p_blocked_reason), ''), p_request_key)
  returning * into e;

  update public.tasks set status = 'done', completed_at = now() where id = p_task_id and user_id = me;
  return e;
end $$;

-- 되돌리기
create or replace function public.reopen_task(p_task_id bigint) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_user();
  t  public.tasks;
begin
  select * into t from public.tasks
   where id = p_task_id and user_id = me and deleted_at is null for update;
  if not found then
    raise exception '찾을 수 없습니다.' using errcode = 'PT404';
  end if;

  update public.executions
     set status = 'canceled', canceled_at = now()
   where task_id = p_task_id and user_id = me and status = 'active';

  update public.tasks set status = 'todo', completed_at = null
   where id = p_task_id and user_id = me
  returning * into t;
  return t;
end $$;

-- 돌아보기: 숫자를 만드는 할 일 목록 (남의 계획이면 404). review_summary 는 이 함수를 불러 쓰므로 같은 확인을 지난다.
create or replace function public.review_tasks(
  p_plan_id bigint,
  p_from    date default null,
  p_to      date default null,
  p_metric  text default 'all'
) returns setof public.tasks
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.require_user();
begin
  perform public.assert_plan_owner(p_plan_id);
  return query
    select t.*
      from public.tasks t
     where t.plan_id = p_plan_id
       and t.user_id = me
       and t.deleted_at is null
       and (p_from is null or t.due_date >= p_from)
       and (p_to   is null or t.due_date <= p_to)
       and case p_metric
             when 'all'     then true
             when 'done'    then t.status = 'done'
             when 'overdue' then t.status = 'todo'
                                 and t.due_date is not null
                                 and t.due_date < (now() at time zone 'Asia/Seoul')::date
             when 'blocked' then exists (
                                   select 1 from public.executions e
                                    where e.task_id = t.id
                                      and e.user_id = me
                                      and e.status = 'active'
                                      and btrim(coalesce(e.blocked_reason, '')) <> '')
             else false
           end
     order by t.due_date nulls last, t.priority, t.created_at, t.id;
end $$;

-- 고칠 점 한 줄을 다음 계획으로 넘기기
create or replace function public.hand_over_improvement(
  p_plan_id       bigint,
  p_period_start  date,
  p_period_end    date,
  p_improvement   text,
  p_next_title    text,
  p_next_start    date,
  p_next_end      date,
  p_next_priority smallint,
  p_next_success  text,
  p_next_minutes  integer
) returns public.retrospectives
language plpgsql security definer set search_path = '' as $$
declare
  me      uuid := public.require_user();
  r       public.retrospectives;
  next_id bigint;
begin
  perform 1 from public.plans p where p.id = p_plan_id and p.user_id = me for update;
  if not found then
    raise exception '찾을 수 없습니다.' using errcode = 'PT404';
  end if;

  select * into r from public.retrospectives
   where plan_id = p_plan_id and user_id = me
     and period_start = p_period_start and period_end = p_period_end;
  if found then
    return r;
  end if;

  insert into public.plans
    (user_id, title, start_date, end_date, priority, success_criteria, estimated_minutes)
  values
    (me, p_next_title, p_next_start, p_next_end, p_next_priority, p_next_success, p_next_minutes)
  returning id into next_id;

  insert into public.retrospectives
    (user_id, plan_id, period_start, period_end, improvement, next_plan_id)
  values
    (me, p_plan_id, p_period_start, p_period_end, btrim(p_improvement), next_id)
  returning * into r;
  return r;
end $$;

-- =====================================================================
-- 6. 함수 실행 권한: 로그인한 사람(authenticated)에게만. anon 과 PUBLIC 은 거둔다.
--    (도우미 2개는 아무에게도 열지 않는다. 위 함수들이 소유자 권한으로 부른다.)
-- =====================================================================

revoke all on function
  public.require_user(),
  public.assert_plan_owner(bigint),
  public.create_plan(text, date, date, smallint, text, integer),
  public.update_plan(bigint, text, date, date, smallint, text, integer),
  public.plan_revisions_of(bigint),
  public.create_task(bigint, text, date, smallint, text[], integer),
  public.update_task(bigint, text, date, smallint, text[], integer),
  public.delete_task(bigint),
  public.complete_task(bigint, uuid, timestamptz, timestamptz, integer, text),
  public.reopen_task(bigint),
  public.review_tasks(bigint, date, date, text),
  public.review_summary(bigint, date, date),
  public.hand_over_improvement(bigint, date, date, text, text, date, date, smallint, text, integer)
  from public, anon, authenticated;

grant execute on function
  public.create_plan(text, date, date, smallint, text, integer),
  public.update_plan(bigint, text, date, date, smallint, text, integer),
  public.plan_revisions_of(bigint),
  public.create_task(bigint, text, date, smallint, text[], integer),
  public.update_task(bigint, text, date, smallint, text[], integer),
  public.delete_task(bigint),
  public.complete_task(bigint, uuid, timestamptz, timestamptz, integer, text),
  public.reopen_task(bigint),
  public.review_tasks(bigint, date, date, text),
  public.review_summary(bigint, date, date),
  public.hand_over_improvement(bigint, date, date, text, text, date, date, smallint, text, integer)
  to authenticated;

-- 새 함수를 바로 쓸 수 있게 API 의 목록을 새로 읽게 한다.
notify pgrst, 'reload schema';

commit;

-- 실행 뒤 확인 (SQL Editor 에서 따로 실행):
--   select count(*) filter (where user_id is null) as 주인_없는_행 from public.plans;   -- 0 이어야 한다
--   select tablename, policyname from pg_policies where schemaname = 'public';           -- "내 것만 읽기" 5개만 있어야 한다
