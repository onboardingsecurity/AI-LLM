-- 플랜두씨 다이어리: 5일 측정 (7번 카드 5, T07-C04~C15, C23~C27, C132)
--
-- 사용법: auth-lock.sql 과 auth-session-check.sql 을 적용한 DB 에서 한 번만 실행한다.
--   1) Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 Run 한다. (바꿀 값은 없다)
--   2) 전체가 하나의 트랜잭션이라 도중에 실패하면 아무것도 바뀌지 않는다.
--
-- 무엇이 생기나
--   * experiments  : 1일차에 고정한 질문·계획 규칙(A)·지표·단위·처리 규칙. 사람마다 1건, 고정한 뒤에는 고칠 수 없다.
--   * rule_changes : 계획 규칙을 바꾼 기록. 사람마다 1건. 바꾼 시각(서버)·이유·1일차와 2일차 기록을 가리킨다.
--   * 함수 start_experiment / change_rule / experiment_report
--
-- 시각은 모두 서버가 찍는다(now()). 브라우저가 보낸 시각을 쓰지 않는다.
--
-- 측정에 "세는" 기록 (고정 규칙, 아래 start_experiment 에 문구로도 저장된다)
--   * 고정한 뒤에 입력한 실행 기록 중, 되돌리지 않았고 지우지 않은 할 일의 것
--   * 끝난 날(서울)이 입력한 날(서울)과 같고, 끝난 시각이 입력 시각보다 뒤(미래)가 아닌 것
--   * 기록이 있는 서로 다른 날을 1일차·2일차… 로 세고, 5일차까지만 센다
--   하루 값 = 그날 세는 기록의 |실제 걸린 시간 − 예상 시간| 합 (분)
--
-- 거절이 만들어지는 곳
--   읽기: 표의 RLS 정책 "내 것만 읽기"(session_alive 포함). 쓰기: 아래 함수(require_user 로 주인 확인)만. 표에는 쓰기 권한이 없다.

begin;

-- =====================================================================
-- 1. 표
-- =====================================================================

create table public.experiments (
  id              bigint generated always as identity primary key,
  user_id         uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  question        text        not null check (char_length(btrim(question)) between 1 and 200),
  plan_rule_a     text        not null check (char_length(btrim(plan_rule_a)) between 1 and 200),   -- 1·2일차에 쓰는 계획 규칙(규칙 A)
  metric          text        not null,
  metric_label    text        not null,
  unit            text        not null,
  eligibility_rule text       not null,
  missing_rule    text        not null,
  duplicate_rule  text        not null,
  outlier_rule    text        not null,
  rounding_rule   text        not null,
  week_start      text        not null,
  started_at      timestamptz not null default now(),   -- 고정한 시각(서버). 이 시각 이후에 입력한 기록만 센다.
  unique (user_id)
);

create table public.rule_changes (
  id                  bigint generated always as identity primary key,
  user_id             uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  experiment_id       bigint      not null references public.experiments (id) on delete cascade,
  rule_before         text        not null,
  rule_after          text        not null check (char_length(btrim(rule_after)) between 1 and 200),
  reason              text        not null check (char_length(btrim(reason)) between 1 and 300),
  changed_at          timestamptz not null default now(),   -- 바꾼 시각(서버)
  day1_date           date        not null,
  day2_date           date        not null,
  day1_execution_ids  bigint[]    not null,
  day2_execution_ids  bigint[]    not null,
  unique (experiment_id),
  check (day2_date > day1_date)
);
create index rule_changes_user_idx on public.rule_changes (user_id);

-- 고정한 값과 바꾼 기록은 고칠 수 없다. (계정을 지울 때의 연쇄 삭제는 막지 않는다)
create function public.block_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '고정한 값은 바꿀 수 없습니다.' using errcode = 'P0001';
end $$;

create trigger experiments_no_update  before update on public.experiments  for each row execute function public.block_update();
create trigger rule_changes_no_update before update on public.rule_changes for each row execute function public.block_update();

-- =====================================================================
-- 2. 표 접근: 로그인한 사람은 내 행 읽기만 (쓰기 권한 없음)
-- =====================================================================

alter table public.experiments  enable row level security;
alter table public.rule_changes enable row level security;

revoke all on table public.experiments, public.rule_changes from anon, authenticated;
grant select on public.experiments, public.rule_changes to authenticated;

create policy "내 것만 읽기" on public.experiments  for select to authenticated using (user_id = (select auth.uid()) and (select public.session_alive()));
create policy "내 것만 읽기" on public.rule_changes for select to authenticated using (user_id = (select auth.uid()) and (select public.session_alive()));

-- =====================================================================
-- 3. 계산 도우미 (브라우저에는 열지 않는다. 아래 함수들이 소유자 권한으로 부른다)
-- =====================================================================

-- 측정 대상 실행 기록 전부(세는 것과 안 세는 것)와 일차·사유. 되돌린 기록·지운 할 일의 기록은 처음부터 빠진다.
create or replace function public.experiment_rows(p_user uuid)
returns table (
  execution_id bigint, task_id bigint, task_title text, estimated_minutes integer, actual_minutes integer,
  started_at timestamptz, ended_at timestamptz, created_at timestamptz, entry_date date,
  day_no integer, counted boolean, reason text, gap integer
)
language sql stable security definer set search_path = '' as $$
  with base as (
    select e.id as eid, e.task_id as tid, t.title as ttitle, t.estimated_minutes as est, e.actual_minutes as act,
           e.started_at as st, e.ended_at as en, e.created_at as cr,
           (e.created_at at time zone 'Asia/Seoul')::date as entry_d,
           (e.ended_at   at time zone 'Asia/Seoul')::date as end_d
      from public.experiments x
      join public.tasks t on t.user_id = x.user_id and t.deleted_at is null
      join public.executions e on e.task_id = t.id and e.user_id = x.user_id and e.status = 'active'
     where x.user_id = p_user and e.created_at >= x.started_at
  ), ok as (
    select b.*,
           case
             when b.end_d <> b.entry_d then '입력한 날과 끝난 날이 다름(미리·나중에 입력한 기록)'
             when b.en > b.cr + interval '1 minute' then '끝난 시각이 입력 시각보다 뒤(미래)'
           end as why
      from base b
  ), days as (
    select entry_d, (dense_rank() over (order by entry_d))::integer as dno
      from (select distinct entry_d from ok where why is null) d
  )
  select o.eid, o.tid, o.ttitle, o.est, o.act, o.st, o.en, o.cr, o.entry_d,
         d.dno,
         (o.why is null and d.dno <= 5),
         coalesce(o.why, case when d.dno > 5 then '5일을 넘은 날짜(5일차까지만 셈)' end),
         abs(o.act - o.est)
    from ok o
    left join days d on d.entry_d = o.entry_d and o.why is null
   order by o.cr, o.eid
$$;

-- =====================================================================
-- 4. 함수 (모두 주인을 확인한다)
-- =====================================================================

-- 고정할 값(지표·단위·처리 규칙). 화면과 start_experiment 가 같은 문구를 쓴다.
create or replace function public.experiment_defaults() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'metric',           'daily_abs_gap_minutes',
    'metric_label',     '하루 단위 (실제 걸린 시간 − 예상 시간)의 절댓값 합',
    'unit',             '분',
    'eligibility_rule', '고정한 뒤에 입력한 기록만 센다. 끝난 날(서울)과 입력한 날(서울)이 같고 끝난 시각이 입력 시각보다 뒤가 아닌 기록만 세며, 미리·나중에 적은 기록은 제외하고 사유를 표시한다. 기록이 있는 서로 다른 날을 1일차부터 세고 5일차까지만 센다.',
    'missing_rule',     '실행 기록이 없는 날은 0으로 채우지 않고 표에 나오지 않으며 평균에서도 뺀다.',
    'duplicate_rule',   '같은 요청 키는 한 번만 센다. 되돌린(취소) 기록과 지운 할 일의 기록은 뺀다.',
    'outlier_rule',     '유난히 튀는 날(하루 값이 기록 있는 날들의 중앙값의 3배 이상, 기록 있는 날이 3일 이상일 때만 판단)은 빼지 않고 그대로 포함하되 표시한다.',
    'rounding_rule',    '하루 값과 합계는 분 정수, 평균은 소수 첫째 자리까지 반올림한다(0.05 이상은 올림).',
    'week_start',       '월요일'
  );
$$;

create or replace function public.start_experiment(p_question text, p_plan_rule text) returns public.experiments
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_user();
  d  jsonb := public.experiment_defaults();
  r  public.experiments;
begin
  perform 1 from public.experiments x where x.user_id = me;
  if found then
    raise exception '이미 측정을 시작했습니다. 고정한 값은 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  insert into public.experiments
    (user_id, question, plan_rule_a, metric, metric_label, unit,
     eligibility_rule, missing_rule, duplicate_rule, outlier_rule, rounding_rule, week_start)
  values
    (me, btrim(p_question), btrim(p_plan_rule), d->>'metric', d->>'metric_label', d->>'unit',
     d->>'eligibility_rule', d->>'missing_rule', d->>'duplicate_rule', d->>'outlier_rule', d->>'rounding_rule', d->>'week_start')
  returning * into r;
  return r;
end $$;

-- 계획 규칙 바꾸기: 2일차 기록 뒤, 3일차 기록 앞에서 한 번만.
create or replace function public.change_rule(p_rule_after text, p_reason text) returns public.rule_changes
language plpgsql security definer set search_path = '' as $$
declare
  me    uuid := public.require_user();
  x     public.experiments;
  r     public.rule_changes;
  today date := (now() at time zone 'Asia/Seoul')::date;
  n     integer;
  d1    date;
  d2    date;
begin
  select * into x from public.experiments e where e.user_id = me;
  if not found then
    raise exception '먼저 측정을 시작해 주세요.' using errcode = 'P0001';
  end if;
  perform 1 from public.rule_changes c where c.experiment_id = x.id;
  if found then
    raise exception '규칙은 한 번만 바꿀 수 있고, 이미 바꿨습니다.' using errcode = 'P0001';
  end if;

  select count(distinct q.entry_date)::integer, min(q.entry_date), max(q.entry_date)
    into n, d1, d2
    from public.experiment_rows(me) q where q.counted;

  if n < 2 then
    raise exception '규칙은 2일차 기록이 끝난 뒤에 바꿀 수 있습니다. (지금 기록이 있는 날: %일)', n using errcode = 'P0001';
  end if;
  if n > 2 then
    raise exception '3일차 기록이 이미 있어서 바꿀 수 없습니다. 규칙은 2일차 기록 뒤, 3일차 기록 앞에서만 바꿀 수 있습니다.' using errcode = 'P0001';
  end if;
  if d2 >= today then
    raise exception '2일차 기록과 같은 날에는 바꿀 수 없습니다. 다음 날, 그날 기록하기 전에 바꿔 주세요.' using errcode = 'P0001';
  end if;

  insert into public.rule_changes
    (user_id, experiment_id, rule_before, rule_after, reason, day1_date, day2_date, day1_execution_ids, day2_execution_ids)
  values
    (me, x.id, x.plan_rule_a, btrim(p_rule_after), btrim(p_reason), d1, d2,
     array(select q.execution_id from public.experiment_rows(me) q where q.counted and q.entry_date = d1 order by q.execution_id),
     array(select q.execution_id from public.experiment_rows(me) q where q.counted and q.entry_date = d2 order by q.execution_id))
  returning * into r;
  return r;
end $$;

-- 화면이 그리는 모든 값. 하루 값·합계·평균·전후 비교가 모두 여기서 계산된다.
create or replace function public.experiment_report() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me       uuid := public.require_user();
  x        public.experiments;
  c        public.rule_changes;
  c_found  boolean;
  today    date := (now() at time zone 'Asia/Seoul')::date;
  rows_j   jsonb;
  days_j   jsonb;
  cmp_a    jsonb;
  cmp_b    jsonb;
  n        integer;
  total    bigint;
  med      numeric;
  last_d   date;
  can      boolean := false;
  hint     text;
  canceled integer;
begin
  select * into x from public.experiments e where e.user_id = me;
  if not found then
    return jsonb_build_object('experiment', null::jsonb, 'today', today, 'defaults', public.experiment_defaults());
  end if;
  select * into c from public.rule_changes rc where rc.experiment_id = x.id;
  c_found := found;

  -- 한 번의 조회로 일차별 값·합계·중앙값·전후 비교를 모두 계산한다. (임시 표를 만들지 않는다)
  with rr as (
    select q.*, case when c_found and q.created_at >= c.changed_at then 'B' else 'A' end as rule
      from public.experiment_rows(me) q
  ), dv as (
    select g.day_no, g.entry_date as d, count(*) as cnt, sum(g.gap)::bigint as v, min(g.rule) as rl
      from rr g where g.counted group by g.day_no, g.entry_date
  ), st as (
    select count(*)::integer as n, coalesce(sum(v), 0)::bigint as total,
           percentile_cont(0.5) within group (order by v) as med, max(d) as last_d
      from dv
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
              'execution_id', r.execution_id, 'task_title', r.task_title, 'estimated_minutes', r.estimated_minutes,
              'actual_minutes', r.actual_minutes, 'gap', r.gap, 'started_at', r.started_at, 'ended_at', r.ended_at,
              'created_at', r.created_at, 'entry_date', r.entry_date, 'day_no', r.day_no,
              'counted', r.counted, 'reason', r.reason, 'rule', r.rule) order by r.created_at, r.execution_id), '[]'::jsonb)
       from rr r),
    (select coalesce(jsonb_agg(jsonb_build_object(
              'day_no', dv.day_no, 'date', dv.d, 'count', dv.cnt, 'value', dv.v, 'rule', dv.rl,
              'outlier', (st.n >= 3 and st.med > 0 and dv.v >= 3 * st.med)) order by dv.day_no), '[]'::jsonb)
       from dv, st),
    st.n, st.total, st.med, st.last_d,
    (select jsonb_build_object('days', count(*), 'total', coalesce(sum(w.v), 0),
                               'avg', case when count(*) > 0 then round(sum(w.v)::numeric / count(*), 1) end)
       from (select sum(r2.gap) as v from rr r2 where r2.counted and r2.rule = 'A' group by r2.day_no) w),
    (select jsonb_build_object('days', count(*), 'total', coalesce(sum(w.v), 0),
                               'avg', case when count(*) > 0 then round(sum(w.v)::numeric / count(*), 1) end)
       from (select sum(r2.gap) as v from rr r2 where r2.counted and r2.rule = 'B' group by r2.day_no) w)
    into rows_j, days_j, n, total, med, last_d, cmp_a, cmp_b
    from st;

  if c_found then
    hint := '이미 규칙을 바꿨습니다.';
  elsif n < 2 then
    hint := '2일차 기록이 끝난 뒤에 바꿀 수 있습니다. (지금 기록이 있는 날: ' || n || '일)';
  elsif n > 2 then
    hint := '3일차 기록이 이미 있어서 바꿀 수 없습니다.';
  elsif last_d >= today then
    hint := '2일차 기록과 같은 날에는 바꿀 수 없습니다. 다음 날, 그날 기록하기 전에 바꿔 주세요.';
  else
    can := true;
    hint := '지금 바꿀 수 있습니다. 오늘 기록하기 전에 바꿔 주세요.';
  end if;

  select count(*)::integer into canceled
    from public.executions e
   where e.user_id = me and e.status = 'canceled' and e.created_at >= x.started_at;

  return jsonb_build_object(
    'experiment', to_jsonb(x) - 'user_id',
    'today', today,
    'rows', rows_j,
    'days', days_j,
    'summary', jsonb_build_object('days', n, 'total', total,
                 'avg', case when n > 0 then round(total::numeric / n, 1) end),
    'change', case when c_found then to_jsonb(c) - 'user_id' else null::jsonb end,
    'compare', jsonb_build_object('A', cmp_a, 'B', cmp_b),
    'can_change', can,
    'change_hint', hint,
    'canceled_count', canceled
  );
end $$;

-- =====================================================================
-- 5. 함수 실행 권한: 로그인한 사람만. 도우미 2개와 trigger 함수는 아무에게도 열지 않는다.
-- =====================================================================

revoke all on function
  public.experiment_rows(uuid),
  public.experiment_defaults(),
  public.start_experiment(text, text),
  public.change_rule(text, text),
  public.experiment_report(),
  public.block_update()
  from public, anon, authenticated;

grant execute on function
  public.start_experiment(text, text),
  public.change_rule(text, text),
  public.experiment_report()
  to authenticated;

notify pgrst, 'reload schema';

commit;

-- 실행 뒤 확인 (SQL Editor 에서 따로 실행):
--   select tablename, policyname from pg_policies where schemaname = 'public';   -- experiments, rule_changes 에 "내 것만 읽기" 가 보여야 한다
--   select count(*) from public.experiments;                                     -- 0 (아직 아무도 고정하지 않음)
