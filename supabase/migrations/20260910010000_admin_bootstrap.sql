-- 管理者の自動付与。
--
-- 環境変数 ADMIN_AUTH_SUBJECTS（SuperTokens のユーザーIDをカンマ区切り）に載っている
-- 利用者がログインしたとき、アプリサーバーがこの関数で role を admin にする。
-- 管理者を作る画面が無くても、SQL を手で打たずにダッシュボードを開けるようにするため。
--
-- 呼べるのはアプリのロール（tetote_app）だけで、対象は環境変数で運用者が決める。
-- 退会済み（deleted）の行は変更しない。

create or replace function app.grant_role_by_subject(p_auth_subject text, p_role account_role)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_changed integer;
begin
    if p_auth_subject is null or length(trim(p_auth_subject)) = 0 then
        raise exception 'auth subject is required' using errcode = '22023';
    end if;
    update users
       set role = p_role, updated_at = now()
     where auth_subject = p_auth_subject
       and status <> 'deleted'
       and role <> p_role;
    get diagnostics v_changed = row_count;
    return v_changed > 0;
end;
$$;

revoke all on function app.grant_role_by_subject(text, account_role) from public;
grant execute on function app.grant_role_by_subject(text, account_role) to tetote_app;
