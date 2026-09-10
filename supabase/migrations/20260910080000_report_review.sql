-- 通報の確認（管理者の運用）。
--
-- 通報は集まるだけで、確認して閉じる手段と、悪質な利用者を止める手段が無かった。
-- 管理者だけが、通報を「対応済み／却下」にし、利用者を「利用停止／解除」できるようにする。
-- reports の select は既存 RLS（管理者は全件）で読める。update は権限が無いため関数で行う。

create or replace function app.resolve_report(p_report_id uuid, p_status report_status)
returns setof reports language plpgsql security definer set search_path = public, pg_temp as $$
begin
    if not app.is_admin() then
        raise exception 'ROLE_FORBIDDEN' using errcode = '42501';
    end if;
    if p_status not in ('resolved', 'rejected', 'investigating') then
        raise exception 'invalid report status' using errcode = '22023';
    end if;
    update reports r
       set status = p_status,
           handled_by = app.current_actor(),
           resolved_at = case when p_status in ('resolved', 'rejected') then now() else null end,
           updated_at = now()
     where r.id = p_report_id;
    return query select * from reports where id = p_report_id;
end;
$$;

-- 利用停止／解除。退会済みと管理者は対象にしない。
create or replace function app.set_user_suspended(p_auth_subject text, p_suspended boolean)
returns table (auth_subject text, status user_status)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
    if not app.is_admin() then
        raise exception 'ROLE_FORBIDDEN' using errcode = '42501';
    end if;
    update users u
       set status = case when p_suspended then 'suspended'::user_status else 'active'::user_status end,
           updated_at = now()
     where u.auth_subject = p_auth_subject
       and u.status <> 'deleted'
       and u.role <> 'admin';
    get diagnostics v_count = row_count;
    if v_count = 0 then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;
    insert into audit_logs (actor_id, event_type, target_type, target_id, result, detail)
    select app.current_actor(), case when p_suspended then 'user.suspended' else 'user.reinstated' end,
           'user', u.id, 'ok', '{}'::jsonb
      from users u where u.auth_subject = p_auth_subject;
    return query select u.auth_subject, u.status from users u where u.auth_subject = p_auth_subject;
end;
$$;

revoke all on function app.resolve_report(uuid, report_status), app.set_user_suspended(text, boolean) from public;
grant execute on function app.resolve_report(uuid, report_status), app.set_user_suspended(text, boolean) to tetote_app;
