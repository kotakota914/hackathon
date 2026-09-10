-- お知らせ（アプリ内の通知履歴）。
--
-- プッシュ通知は許可されていない・iOS で PWA を開いていない、などで届かないことが
-- ある。同じ出来事（応募が届いた／選ばれた／メッセージ）をアプリ内にも残し、
-- 開いたときに「何があったか」を確認できるようにする。本文に個人情報は入れない。

create table notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users (id) on delete cascade,
    kind text not null,
    title text not null,
    body text not null,
    url text not null default '/',
    created_at timestamptz not null default now(),
    read_at timestamptz,
    constraint notifications_kind_length check (length(trim(kind)) between 1 and 40),
    constraint notifications_title_length check (length(trim(title)) between 1 and 120),
    constraint notifications_body_length check (length(body) <= 500),
    constraint notifications_url_length check (length(url) <= 300)
);

create index notifications_user_created_idx on notifications (user_id, created_at desc);
create index notifications_user_unread_idx on notifications (user_id) where read_at is null;

alter table notifications enable row level security;
grant select on notifications to tetote_app;

-- 本人だけが自分のお知らせを読める。
create policy notifications_select_own on notifications for select to tetote_app
    using (app.is_active_actor() and user_id = app.current_actor());

-- サーバーが出来事の相手に対して追加する（相手は退会済みでないこと）。
create or replace function app.add_notification(
    p_auth_subject text, p_kind text, p_title text, p_body text, p_url text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid; v_id uuid;
begin
    select u.id into v_user from users u where u.auth_subject = p_auth_subject and u.status = 'active';
    if v_user is null then
        return null;
    end if;
    insert into notifications (user_id, kind, title, body, url)
    values (v_user, p_kind, p_title, p_body, coalesce(p_url, '/'))
    returning id into v_id;
    return v_id;
end;
$$;

-- 本人が既読にする。p_ids が null なら全部。
create or replace function app.mark_own_notifications_read(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
    if not app.is_active_actor() then
        raise exception 'active actor required' using errcode = '42501';
    end if;
    update notifications n
       set read_at = now()
     where n.user_id = app.current_actor()
       and n.read_at is null
       and (p_ids is null or n.id = any(p_ids));
    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

revoke all on function app.add_notification(text, text, text, text, text),
               app.mark_own_notifications_read(uuid[]) from public;
grant execute on function app.add_notification(text, text, text, text, text),
                          app.mark_own_notifications_read(uuid[]) to tetote_app;
