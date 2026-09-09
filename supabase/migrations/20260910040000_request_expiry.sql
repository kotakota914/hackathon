-- 古い依頼の自動期限切れ。
--
-- これまで expires_at はどこでも設定されず、予定日が過ぎた依頼が「募集中」のまま
-- 支援者の一覧に残り続けていた。以後はアプリが作成・更新時に expires_at を入れ
-- （予定日時 + 24 時間）、公開一覧は app.request_is_public() が自動で隠す。
-- さらに 1 日 1 回の定期処理でこの関数を呼び、状態を expired に確定させる
-- （依頼者の一覧で「募集終了」と分かるようにし、未処理の応募を閉じる）。

create or replace function app.expire_requests()
returns table (expired_requests integer, closed_applications integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_expired integer := 0;
    v_closed integer := 0;
begin
    with expired as (
        update requests r
           set status = 'expired', updated_at = now()
         where r.status in ('published', 'matching')
           and r.expires_at is not null
           and r.expires_at <= now()
        returning r.id
    ), closed as (
        update applications a
           set status = 'cancelled', updated_at = now()
         where a.request_id in (select id from expired)
           and a.status = 'applied'
        returning a.id
    )
    select (select count(*) from expired), (select count(*) from closed)
      into v_expired, v_closed;
    return query select v_expired, v_closed;
end;
$$;

-- 予定日時を変えたとき、依頼者本人が自分の依頼の期限を付け直す。
create or replace function app.set_request_expiry(p_request_id uuid, p_expires timestamptz)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
    if not app.is_active_actor() then
        raise exception 'active actor required' using errcode = '42501';
    end if;
    update requests r
       set expires_at = p_expires, updated_at = now()
     where r.id = p_request_id
       and r.requester_id = app.current_actor()
       and (p_expires is null or p_expires > r.created_at);
    get diagnostics v_count = row_count;
    return v_count > 0;
end;
$$;

revoke all on function app.expire_requests(), app.set_request_expiry(uuid, timestamptz) from public;
grant execute on function app.expire_requests(), app.set_request_expiry(uuid, timestamptz) to tetote_app;
