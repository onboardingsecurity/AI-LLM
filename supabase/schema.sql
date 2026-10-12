-- 플랜두씨 다이어리 DB 스키마 (Supabase / Postgres)
--
-- 사용법: Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 Run 한 번만 실행한다.
-- 전체가 하나의 트랜잭션이라 도중에 실패하면 아무것도 만들어지지 않는다. (실패하면 오류 문구를 알려 줄 것)
--
-- 공개 범위: 로그인이 없으므로 anon(브라우저)이 읽고 쓸 수 있다. 남이 봐도 괜찮은 내용만 넣는다.
-- 잠금(접근 제한)은 먼 훗날 진행하므로 여기에는 넣지 않는다.
--
-- 규칙 요약
--   * 우선순위: 1=높음, 2=보통, 3=낮음 (작을수록 먼저)
--   * 시간 단위: 분(minutes) 하나로 저장하고 보여 준다.
--   * 시각은 UTC(timestamptz)로 저장하고 화면에서 서울 시간으로 보여 준다.
--   * 마감일·기간은 서울 기준 날짜(date)다. "오늘"은 서버가 Asia/Seoul 로 계산한다.
--   * 할 일 목록 정렬 기준(화면에도 그대로 밝힌다):
--       마감일 빠른 순(마감일 없는 것은 맨 뒤) -> 우선순위 높은 순 -> 만든 시각 빠른 순 -> ID 작은 순

begin;

-- =====================================================================
-- 1. 표
-- =====================================================================

-- 계획: 항상 "지금 값"만 가진다. ID는 바뀌지 않는다.
create table public.plans (
  id                 bigint generated always as identity primary key,
  title              text        not null check (char_length(btrim(title)) between 1 and 100),
  start_date         date        not null,
  end_date           date        not null,
  priority           smallint    not null check (priority between 1 and 3),
  success_criteria   text        not null check (char_length(btrim(success_criteria)) between 1 and 500),
  estimated_minutes  integer     not null check (estimated_minutes >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (end_date >= start_date)
);

-- 계획 수정 이력: 계획이 만들어질 때(버전 1)와 고쳐질 때마다 그 시점의 값을 통째로 쌓는다.
-- 트리거가 자동으로 쌓고, 브라우저는 읽기만 가능하다. (지우거나 고칠 수 없음)
create table public.plan_revisions (
  id                 bigint generated always as identity primary key,
  plan_id            bigint      not null references public.plans (id),
  version            integer     not null,
  title              text        not null,
  start_date         date        not null,
  end_date           date        not null,
  priority           smallint    not null,
  success_criteria   text        not null,
  estimated_minutes  integer     not null,
  recorded_at        timestamptz not null default now(),
  unique (plan_id, version)
);

-- 할 일: 계획에 딸린다. 지우면 deleted_at 만 채운다(소프트 삭제).
-- status / completed_at 은 complete_task / reopen_task 함수로만 바뀐다.
create table public.tasks (
  id                 bigint generated always as identity primary key,
  plan_id            bigint      not null references public.plans (id),
  title              text        not null check (char_length(btrim(title)) between 1 and 100),
  due_date           date,
  priority           smallint    not null check (priority between 1 and 3),
  tags               text[]      not null default '{}' check (cardinality(tags) <= 10),
  estimated_minutes  integer     not null check (estimated_minutes >= 0),
  status             text        not null default 'todo' check (status in ('todo', 'done')),
  completed_at       timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index tasks_plan_idx on public.tasks (plan_id, due_date);

-- 실행 기록: 계획·할 일과 별개 표. 할 일을 완료로 바꿀 때 한 건이 만들어진다.
-- 되돌리면 지우지 않고 status='canceled' 로 남기고, 집계에서는 뺀다.
create table public.executions (
  id              bigint generated always as identity primary key,
  task_id         bigint      not null references public.tasks (id),
  started_at      timestamptz not null,
  ended_at        timestamptz not null,
  actual_minutes  integer     not null check (actual_minutes >= 0),
  blocked_reason  text        check (blocked_reason is null or char_length(blocked_reason) <= 300),
  request_key     uuid        not null unique,   -- 같은 요청을 알아보는 키 (중복 완료 방지 1)
  status          text        not null default 'active' check (status in ('active', 'canceled')),
  created_at      timestamptz not null default now(),
  canceled_at     timestamptz,
  check (ended_at >= started_at),
  -- 실제 걸린 시간은 시작~끝 사이 시간(분, 올림)을 넘을 수 없다.
  check (actual_minutes <= ceil(extract(epoch from (ended_at - started_at)) / 60)),
  check ((status = 'canceled') = (canceled_at is not null))
);
-- 한 할 일에 유효한 완료 기록은 한 건만 (중복 완료 방지 2: DB 제약)
create unique index executions_one_active_per_task
  on public.executions (task_id) where status = 'active';

-- 돌아보기: 고칠 점 한 줄을 정하면 다음 계획이 만들어지고 이어진다.
create table public.retrospectives (
  id            bigint generated always as identity primary key,
  plan_id       bigint      not null references public.plans (id),
  period_start  date        not null,
  period_end    date        not null,
  improvement   text        not null check (char_length(btrim(improvement)) between 1 and 200),
  next_plan_id  bigint      not null references public.plans (id),
  created_at    timestamptz not null default now(),
  check (period_end >= period_start),
  unique (plan_id, period_start, period_end)   -- 같은 기간 돌아보기는 한 건
);

-- =====================================================================
-- 2. 트리거 (DB가 스스로 규칙을 지킨다)
-- =====================================================================

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger plans_touch before update on public.plans
  for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- 계획이 만들어지거나 값이 바뀌면 그 시점의 값을 수정 이력에 쌓는다.
create function public.record_plan_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and (new.title, new.start_date, new.end_date, new.priority, new.success_criteria, new.estimated_minutes)
         is not distinct from
         (old.title, old.start_date, old.end_date, old.priority, old.success_criteria, old.estimated_minutes) then
    return new;
  end if;

  insert into public.plan_revisions
    (plan_id, version, title, start_date, end_date, priority, success_criteria, estimated_minutes)
  values
    (new.id,
     coalesce((select max(r.version) from public.plan_revisions r where r.plan_id = new.id), 0) + 1,
     new.title, new.start_date, new.end_date, new.priority, new.success_criteria, new.estimated_minutes);
  return new;
end $$;

create trigger plans_record_revision after insert or update on public.plans
  for each row execute function public.record_plan_revision();

-- 할 일 상태와 완료 기록이 어긋나지 않게 지킨다.
--   done 이면 유효한 완료 기록이 있어야 하고, todo 이면 없어야 한다.
create function public.guard_task_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  has_active boolean;
begin
  if tg_op = 'INSERT' and new.status <> 'todo' then
    raise exception '새 할 일은 진행 중 상태로만 만들 수 있습니다.';
  end if;

  select exists (
    select 1 from public.executions e where e.task_id = new.id and e.status = 'active'
  ) into has_active;

  if new.status = 'done' and not has_active then
    raise exception '완료 기록 없이 완료로 바꿀 수 없습니다.';
  end if;
  if new.status = 'todo' and has_active then
    raise exception '유효한 완료 기록이 있는 할 일은 먼저 되돌려야 합니다.';
  end if;
  return new;
end $$;

create trigger tasks_guard_status before insert or update on public.tasks
  for each row execute function public.guard_task_status();

-- =====================================================================
-- 3. 함수 (브라우저가 호출하는 동작)
-- =====================================================================

-- 완료하기: 같은 요청을 몇 번 보내도 완료 기록은 한 건만 남는다.
--   (1) request_key 가 같으면 기존 기록을 돌려준다
--   (2) 할 일 행을 잠가서 동시에 들어온 요청을 한 줄로 세운다
--   (3) 그래도 새는 경우를 DB 제약(UNIQUE)이 막는다
create function public.complete_task(
  p_task_id        bigint,
  p_request_key    uuid,
  p_started_at     timestamptz,
  p_ended_at       timestamptz,
  p_actual_minutes integer,
  p_blocked_reason text default null
) returns public.executions
language plpgsql security definer set search_path = '' as $$
declare
  e public.executions;
begin
  perform 1 from public.tasks t
    where t.id = p_task_id and t.deleted_at is null
    for update;
  if not found then
    raise exception '할 일을 찾을 수 없습니다.';
  end if;

  select * into e from public.executions where request_key = p_request_key;
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
    (task_id, started_at, ended_at, actual_minutes, blocked_reason, request_key)
  values
    (p_task_id, p_started_at, p_ended_at, p_actual_minutes,
     nullif(btrim(p_blocked_reason), ''), p_request_key)
  returning * into e;

  update public.tasks set status = 'done', completed_at = now() where id = p_task_id;
  return e;
end $$;

-- 되돌리기: 완료 기록은 지우지 않고 canceled 로 남기고, 할 일을 진행 중으로 돌린다.
create function public.reopen_task(p_task_id bigint) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
begin
  select * into t from public.tasks where id = p_task_id and deleted_at is null for update;
  if not found then
    raise exception '할 일을 찾을 수 없습니다.';
  end if;

  update public.executions
     set status = 'canceled', canceled_at = now()
   where task_id = p_task_id and status = 'active';

  update public.tasks set status = 'todo', completed_at = null
   where id = p_task_id
  returning * into t;
  return t;
end $$;

-- 돌아보기: 숫자를 만드는 할 일 목록. 집계와 "숫자를 눌러 가는 목록"이 같은 함수를 쓴다.
--   p_metric: all(계획 수) / done(완료) / overdue(지연) / blocked(막힘)
--   p_from, p_to: 마감일 기준 기간(서울 날짜). 둘 다 비우면 계획 전체.
create function public.review_tasks(
  p_plan_id bigint,
  p_from    date default null,
  p_to      date default null,
  p_metric  text default 'all'
) returns setof public.tasks
language sql stable security definer set search_path = '' as $$
  select t.*
    from public.tasks t
   where t.plan_id = p_plan_id
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
                                    and e.status = 'active'
                                    and btrim(coalesce(e.blocked_reason, '')) <> '')
           else false
         end
   order by t.due_date nulls last, t.priority, t.created_at, t.id
$$;

-- 돌아보기 집계. 시간은 모두 분 단위. 차이 = 실제 - 예상. 대상이 없으면 0.
create function public.review_summary(
  p_plan_id bigint,
  p_from    date default null,
  p_to      date default null
) returns table (
  plan_count        integer,
  done_count        integer,
  overdue_count     integer,
  blocked_count     integer,
  estimated_minutes integer,
  actual_minutes    integer,
  diff_minutes      integer
)
language sql stable security definer set search_path = '' as $$
  with est as (
    select coalesce(sum(a.estimated_minutes), 0)::integer as total
      from public.review_tasks(p_plan_id, p_from, p_to, 'all') a
  ), act as (
    select coalesce(sum(e.actual_minutes), 0)::integer as total
      from public.review_tasks(p_plan_id, p_from, p_to, 'all') a
      join public.executions e on e.task_id = a.id and e.status = 'active'
  )
  select
    (select count(*) from public.review_tasks(p_plan_id, p_from, p_to, 'all'))::integer,
    (select count(*) from public.review_tasks(p_plan_id, p_from, p_to, 'done'))::integer,
    (select count(*) from public.review_tasks(p_plan_id, p_from, p_to, 'overdue'))::integer,
    (select count(*) from public.review_tasks(p_plan_id, p_from, p_to, 'blocked'))::integer,
    est.total,
    act.total,
    act.total - est.total
  from est, act
$$;

-- 고칠 점 한 줄을 다음 계획으로 넘기기. 같은 기간 돌아보기는 한 건만 만들어진다.
create function public.hand_over_improvement(
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
  r       public.retrospectives;
  next_id bigint;
begin
  perform 1 from public.plans p where p.id = p_plan_id for update;
  if not found then
    raise exception '계획을 찾을 수 없습니다.';
  end if;

  select * into r from public.retrospectives
   where plan_id = p_plan_id and period_start = p_period_start and period_end = p_period_end;
  if found then
    return r;
  end if;

  insert into public.plans
    (title, start_date, end_date, priority, success_criteria, estimated_minutes)
  values
    (p_next_title, p_next_start, p_next_end, p_next_priority, p_next_success, p_next_minutes)
  returning id into next_id;

  insert into public.retrospectives
    (plan_id, period_start, period_end, improvement, next_plan_id)
  values
    (p_plan_id, p_period_start, p_period_end, btrim(p_improvement), next_id)
  returning * into r;
  return r;
end $$;

-- =====================================================================
-- 4. 접근 권한 (로그인 없음: anon 이 쓴다. 필요한 것만 연다.)
-- =====================================================================

-- "새 표 자동 노출" 설정으로 생긴 기본 권한을 먼저 모두 거둔다.
revoke all on table
  public.plans, public.plan_revisions, public.tasks, public.executions, public.retrospectives
  from anon, authenticated;

alter table public.plans           enable row level security;
alter table public.plan_revisions  enable row level security;
alter table public.tasks           enable row level security;
alter table public.executions      enable row level security;
alter table public.retrospectives  enable row level security;

-- 읽기: 전부 공개
grant select on
  public.plans, public.plan_revisions, public.tasks, public.executions, public.retrospectives
  to anon, authenticated;

create policy "공개 읽기" on public.plans          for select to anon, authenticated using (true);
create policy "공개 읽기" on public.plan_revisions for select to anon, authenticated using (true);
create policy "공개 읽기" on public.tasks          for select to anon, authenticated using (true);
create policy "공개 읽기" on public.executions     for select to anon, authenticated using (true);
create policy "공개 읽기" on public.retrospectives for select to anon, authenticated using (true);

-- 계획: 만들기·고치기만 (지우기 없음)
grant insert (title, start_date, end_date, priority, success_criteria, estimated_minutes)
  on public.plans to anon, authenticated;
grant update (title, start_date, end_date, priority, success_criteria, estimated_minutes)
  on public.plans to anon, authenticated;
create policy "공개 쓰기" on public.plans for insert to anon, authenticated with check (true);
create policy "공개 수정" on public.plans for update to anon, authenticated using (true) with check (true);

-- 할 일: 만들기·고치기(소프트 삭제 포함). status/completed_at 은 함수로만.
grant insert (plan_id, title, due_date, priority, tags, estimated_minutes)
  on public.tasks to anon, authenticated;
grant update (title, due_date, priority, tags, estimated_minutes, deleted_at)
  on public.tasks to anon, authenticated;
create policy "공개 쓰기" on public.tasks for insert to anon, authenticated with check (true);
create policy "공개 수정" on public.tasks for update to anon, authenticated using (true) with check (true);

-- 수정 이력·실행 기록·돌아보기: 읽기만. 쓰기는 트리거와 함수가 한다.

-- 함수: 기본으로 열려 있는 실행 권한을 거두고 anon 에만 연다.
revoke all on function
  public.complete_task(bigint, uuid, timestamptz, timestamptz, integer, text),
  public.reopen_task(bigint),
  public.review_tasks(bigint, date, date, text),
  public.review_summary(bigint, date, date),
  public.hand_over_improvement(bigint, date, date, text, text, date, date, smallint, text, integer)
  from public;

grant execute on function
  public.complete_task(bigint, uuid, timestamptz, timestamptz, integer, text),
  public.reopen_task(bigint),
  public.review_tasks(bigint, date, date, text),
  public.review_summary(bigint, date, date),
  public.hand_over_improvement(bigint, date, date, text, text, date, date, smallint, text, integer)
  to anon, authenticated;

commit;
