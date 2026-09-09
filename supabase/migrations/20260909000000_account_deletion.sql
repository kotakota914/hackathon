-- アカウント削除（退会）。
--
-- 依頼・応募・マッチ・メッセージ・レビュー・通報は users を on delete restrict で参照して
-- いるため、users 行は物理削除せず「匿名化して残す」。相手側のトーク履歴やレビューが
-- 消えないようにするため。個人が特定できる列だけを消し、status を deleted にする。
-- status が deleted になると app.is_active_actor() が偽になり、以後この利用者は
-- どの業務テーブルにも触れなくなる（全ポリシーが is_active_actor() を先頭条件に持つ）。
--
-- 進行中のマッチ（matched / in_progress / completion_pending）がある場合は拒否する。
-- 相手の支援が宙に浮くため、先に完了か取消をしてもらう。
-- 募集中の自分の依頼は取消、自分の未処理の応募は取下げにしてから退会する。

create or replace function app.delete_own_account()
returns table (cancelled_requests integer, withdrawn_applications integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_actor uuid := app.current_actor();
    v_status user_status;
    v_cancelled integer := 0;
    v_withdrawn integer := 0;
begin
    if v_actor is null then
        raise exception 'actor is required' using errcode = '22023';
    end if;
    select u.status into v_status from users u where u.id = v_actor for update;
    if v_status is null then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_status = 'deleted' then
        -- 二重実行は安全に何もしない。
        return query select 0, 0;
        return;
    end if;

    if exists (
        select 1 from matches m
          join requests r on r.id = m.request_id
         where (m.helper_id = v_actor or r.requester_id = v_actor)
           and m.status in ('matched', 'in_progress', 'completion_pending')
    ) then
        raise exception 'ACCOUNT_HAS_ACTIVE_MATCH' using errcode = 'P0001';
    end if;

    -- 募集中・下書き・審査待ちの自分の依頼を取消し、そこに来ている未処理の応募も閉じる。
    with cancelled as (
        update requests r
           set status = 'cancelled', updated_at = now()
         where r.requester_id = v_actor
           and r.status in ('draft', 'pending_review', 'published', 'matching')
        returning r.id
    ), closed as (
        update applications a
           set status = 'cancelled', updated_at = now()
         where a.request_id in (select id from cancelled)
           and a.status = 'applied'
        returning a.id
    )
    select count(*) into v_cancelled from cancelled;

    -- 自分の未処理の応募を取り下げる。
    with withdrawn as (
        update applications a
           set status = 'withdrawn', updated_at = now()
         where a.helper_id = v_actor
           and a.status = 'applied'
        returning a.id
    )
    select count(*) into v_withdrawn from withdrawn;

    -- 本人だけに属する情報は削除する。
    delete from user_settings where user_id = v_actor;
    delete from achievement_profiles where user_id = v_actor;
    delete from university_email_challenges where user_id = v_actor;
    delete from saved_requests where user_id = v_actor;
    delete from request_dismissals where user_id = v_actor;
    delete from user_blocks where blocker_id = v_actor;
    -- 本人確認書類は行を残して削除済みにし、保管物の掃除は deletion_due_at に従う。
    update verification_requests
       set deleted_at = now(), note = null,
           deletion_due_at = coalesce(deletion_due_at, now()), updated_at = now()
     where user_id = v_actor and deleted_at is null;

    -- 個人が特定できる列を消し、ログインIDとの紐づけを切る。
    update users
       set auth_subject = 'deleted:' || id::text,
           display_name = '退会したユーザー',
           email_verified = false,
           verification_status = 'unverified',
           area_code = null, birth_year = null,
           region = null, age = null, notes = null,
           helper_type = null, university = null, faculty = null, school_year = null,
           occupation = null, industry = null, workplace = null,
           gender = null, interest = null, message = null,
           status = 'deleted', updated_at = now()
     where id = v_actor;

    -- 監査記録。個人情報は含めず、件数だけ残す。
    insert into audit_logs (actor_id, event_type, target_type, target_id, result, detail)
    values (v_actor, 'account.deleted', 'user', v_actor, 'ok',
            jsonb_build_object('cancelledRequests', v_cancelled,
                               'withdrawnApplications', v_withdrawn));

    return query select v_cancelled, v_withdrawn;
end;
$$;

revoke all on function app.delete_own_account() from public;
grant execute on function app.delete_own_account() to tetote_app;
