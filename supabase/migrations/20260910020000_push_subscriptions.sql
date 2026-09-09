-- Web Push の購読先（ブラウザごとの通知の宛先）。
--
-- 端末のブラウザが発行する endpoint / 鍵を本人の行として保存する。個人情報は含まない
-- （endpoint は推測できない URL、鍵は暗号化用）。本人だけが自分の購読を読み書きできる。
-- 送信側は「相手の購読一覧」を読む必要があるため、security definer 関数で取り出す。
-- その際、退会済みと通知オフの利用者は除外する。

create table push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users (id) on delete cascade,
    endpoint text not null,
    p256dh text not null,
    auth text not null,
    user_agent text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint push_subscriptions_endpoint_key unique (endpoint),
    constraint push_subscriptions_endpoint_length check (length(endpoint) between 20 and 2048),
    constraint push_subscriptions_keys_length check (length(p256dh) between 20 and 512 and length(auth) between 8 and 256)
);

create index push_subscriptions_user_idx on push_subscriptions (user_id, created_at desc);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_select on push_subscriptions for select to tetote_app
    using (app.is_active_actor() and user_id = app.current_actor());
create policy push_subscriptions_insert on push_subscriptions for insert to tetote_app
    with check (app.is_active_actor() and user_id = app.current_actor());
create policy push_subscriptions_update on push_subscriptions for update to tetote_app
    using (app.is_active_actor() and user_id = app.current_actor())
    with check (app.is_active_actor() and user_id = app.current_actor());
create policy push_subscriptions_delete on push_subscriptions for delete to tetote_app
    using (app.is_active_actor() and user_id = app.current_actor());

grant select, insert, update, delete on push_subscriptions to tetote_app;

-- 相手（通知の宛先）の購読一覧。本人が active で、通知設定がオフでない場合だけ返す。
create or replace function app.push_subscriptions_for(p_auth_subject text)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public, pg_temp as $$
    select s.endpoint, s.p256dh, s.auth
      from push_subscriptions s
      join users u on u.id = s.user_id
      left join user_settings st on st.user_id = u.id
     where u.auth_subject = p_auth_subject
       and u.status = 'active'
       and coalesce(st.notifications_enabled, true)
     order by s.created_at desc;
$$;

-- 送信で 404/410（購読が失効）が返った endpoint を消す。誰の行かは問わない。
create or replace function app.delete_push_subscription_by_endpoint(p_endpoint text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
    delete from push_subscriptions where endpoint = p_endpoint;
    get diagnostics v_count = row_count;
    return v_count > 0;
end;
$$;

revoke all on function app.push_subscriptions_for(text), app.delete_push_subscription_by_endpoint(text) from public;
grant execute on function app.push_subscriptions_for(text), app.delete_push_subscription_by_endpoint(text) to tetote_app;
