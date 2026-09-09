-- 実績プロフィールの公開ページ。
--
-- 依頼者が「この人にお願いするか」を決めるための最小限の情報だけを返す:
-- 表示名、本人確認の状態、参加時期（月まで）、完了した支援の回数と合計時間、
-- 本人が公開を承認した AI 実績文。地域・年齢・大学・勤務先などは返さない。
--
-- 閲覧は active な利用者に限り、ブロック関係にある相手のページは見せない（存在しない扱い）。
-- 全利用者のマッチを横断して数えるため security definer で RLS を越える。

create or replace function app.public_helper_profile(p_auth_subject text)
returns table (
    display_name text,
    verification_status verification_status,
    member_since date,
    completed_count integer,
    total_minutes integer,
    achievement_text text,
    achievement_visibility achievement_visibility,
    achievement_approved_at timestamptz
) language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
    v_target uuid;
    v_viewer uuid := app.current_actor();
begin
    if not app.is_active_actor() then
        raise exception 'active actor required' using errcode = '42501';
    end if;
    select u.id into v_target from users u
     where u.auth_subject = p_auth_subject and u.status = 'active';
    if v_target is null or app.is_blocked_pair(v_target, v_viewer) then
        return;  -- 見つからない扱い（存在の有無も漏らさない）
    end if;
    return query
    select u.display_name,
           u.verification_status,
           date_trunc('month', u.created_at)::date,
           (select count(*)::int from matches m
             where m.helper_id = v_target and m.status = 'completed'),
           (select coalesce(sum(r.estimated_minutes), 0)::int
              from matches m join requests r on r.id = m.request_id
             where m.helper_id = v_target and m.status = 'completed'),
           case when ap.approved_at is not null and ap.visibility <> 'private'
                then ap.generated_text else null end,
           ap.visibility,
           case when ap.approved_at is not null and ap.visibility <> 'private'
                then ap.approved_at else null end
      from users u
      left join achievement_profiles ap on ap.user_id = u.id
     where u.id = v_target;
end;
$$;

revoke all on function app.public_helper_profile(text) from public;
grant execute on function app.public_helper_profile(text) to tetote_app;
