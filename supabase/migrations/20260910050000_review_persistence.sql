-- レビュー（完了後の評価）の永続化と、公開プロフィール向けの要約。
--
-- reviews 表と RLS（本人が当事者のマッチにだけ投稿できる）は baseline にあるが、
-- アプリはこれまでメモリ上の辞書にしか保存していなかった。本番（サーバーレス）では
-- 記憶が残らず、評価が送れない・消える状態だった。
--
-- 公開プロフィールには件数と「良かった点」の件数だけを出す。コメント本文や誰が
-- 書いたかは出さない（当事者と管理者だけが reviews_select で読める）。

create or replace function app.review_summary_for(p_auth_subject text)
returns table (
    review_count integer,
    on_time_count integer,
    polite_count integer,
    safety_aware_count integer,
    communicative_count integer
) language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_target uuid;
begin
    if not app.is_active_actor() then
        raise exception 'active actor required' using errcode = '42501';
    end if;
    select u.id into v_target from users u
     where u.auth_subject = p_auth_subject and u.status = 'active';
    if v_target is null or app.is_blocked_pair(v_target, app.current_actor()) then
        return query select 0, 0, 0, 0, 0;
        return;
    end if;
    return query
    select count(*)::int,
           count(*) filter (where (r.evaluation->>'onTime')::boolean)::int,
           count(*) filter (where (r.evaluation->>'polite')::boolean)::int,
           count(*) filter (where (r.evaluation->>'safetyAware')::boolean)::int,
           count(*) filter (where (r.evaluation->>'communicative')::boolean)::int
      from reviews r
     where r.reviewee_id = v_target;
end;
$$;

revoke all on function app.review_summary_for(text) from public;
grant execute on function app.review_summary_for(text) to tetote_app;
