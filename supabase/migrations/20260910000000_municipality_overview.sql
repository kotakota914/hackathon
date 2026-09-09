-- 自治体ダッシュボードの集計。個人情報を含まず、件数などの集計値だけを返す。
--
-- 全利用者の依頼・マッチを横断するため security definer で RLS を越えるが、
-- 関数の入口で app.is_admin() を必ず確認し、管理者以外は実行できないようにする。
-- （段階2で自治体ロールを足す際は、ここに地域の絞り込みを加える。）

-- 期間内（created_at >= p_from かつ < p_to）の全体集計。
create or replace function app.municipality_totals(p_from timestamptz, p_to timestamptz)
returns table (
    requests_created integer,
    requests_completed integer,
    requests_cancelled integer,
    matches_formed integer,
    matches_completed integer,
    active_helpers integer,
    estimated_minutes_total integer,
    estimated_minutes_count integer
) language plpgsql security definer set search_path = public, pg_temp as $$
begin
    if not app.is_admin() then
        raise exception 'ROLE_FORBIDDEN' using errcode = '42501';
    end if;
    return query
    with req as (
        select * from requests where created_at >= p_from and created_at < p_to
    ), mtc as (
        select * from matches where matched_at >= p_from and matched_at < p_to
    )
    select
        (select count(*)::int from req),
        (select count(*)::int from req where status = 'completed'),
        (select count(*)::int from req where status in ('cancelled','rejected','expired')),
        (select count(*)::int from mtc where status <> 'cancelled'),
        (select count(*)::int from mtc where status = 'completed'),
        (select count(distinct helper_id)::int from mtc where status <> 'cancelled'),
        (select coalesce(sum(estimated_minutes),0)::int from req where estimated_minutes is not null),
        (select count(*)::int from req where estimated_minutes is not null);
end;
$$;

-- 地域別（p_kind='area'）またはカテゴリ別（p_kind='category'）の内訳。
create or replace function app.municipality_breakdown(
    p_from timestamptz, p_to timestamptz, p_kind text
) returns table (key text, requests integer, completed integer)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
    if not app.is_admin() then
        raise exception 'ROLE_FORBIDDEN' using errcode = '42501';
    end if;
    if p_kind not in ('area', 'category') then
        raise exception 'invalid breakdown kind' using errcode = '22023';
    end if;
    return query
    select
        case when p_kind = 'area' then r.area_code else r.category_id end as key,
        count(*)::int as requests,
        count(*) filter (where r.status = 'completed')::int as completed
    from requests r
    where r.created_at >= p_from and r.created_at < p_to
    group by 1
    order by requests desc, key;
end;
$$;

revoke all on function app.municipality_totals(timestamptz, timestamptz) from public;
revoke all on function app.municipality_breakdown(timestamptz, timestamptz, text) from public;
grant execute on function app.municipality_totals(timestamptz, timestamptz) to tetote_app;
grant execute on function app.municipality_breakdown(timestamptz, timestamptz, text) to tetote_app;
