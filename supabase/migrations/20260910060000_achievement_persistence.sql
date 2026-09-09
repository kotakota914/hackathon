-- AI 実績プロフィールの永続化。
--
-- achievement_profiles 表（1 利用者 1 行）は baseline にあるが、アプリはメモリ上の
-- 辞書にしか保存していなかった。本番では作成しても消え、公開もできない状態だった。
-- 表には insert 権限しか無く update 権限が無いため、本人向けの security definer 関数で
-- 生成文の保存と公開範囲の変更を行う。
--
-- 公開範囲: private（本人のみ）/ unlisted（ログイン利用者に公開）/ public（公開）。
-- アプリ側の "members" は unlisted に対応する。public は本人の承認（approved_at）が必須。

create or replace function app.upsert_own_achievement(
    p_text text, p_model text, p_prompt text
) returns setof achievement_profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := app.current_actor();
begin
    if not app.is_active_actor() then
        raise exception 'active actor required' using errcode = '42501';
    end if;
    if p_text is null or length(trim(p_text)) = 0 then
        raise exception 'generated text is required' using errcode = '22023';
    end if;
    insert into achievement_profiles (user_id, generated_text, model_name, prompt_version, generated_at, approved_at, visibility)
    values (v_actor, p_text, p_model, p_prompt, now(), null, 'private')
    on conflict (user_id) do update
       set generated_text = excluded.generated_text,
           model_name = excluded.model_name,
           prompt_version = excluded.prompt_version,
           generated_at = now(),
           approved_at = null,          -- 生成し直したら承認もやり直す
           visibility = 'private',
           updated_at = now();
    return query select * from achievement_profiles where user_id = v_actor;
end;
$$;

create or replace function app.set_own_achievement_visibility(
    p_visibility achievement_visibility, p_approve boolean
) returns setof achievement_profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := app.current_actor();
begin
    if not app.is_active_actor() then
        raise exception 'active actor required' using errcode = '42501';
    end if;
    if not exists (select 1 from achievement_profiles where user_id = v_actor and generated_text is not null) then
        raise exception 'ACHIEVEMENT_NOT_FOUND' using errcode = 'P0002';
    end if;
    if p_visibility = 'public' and not p_approve
       and not exists (select 1 from achievement_profiles where user_id = v_actor and approved_at is not null) then
        raise exception 'ACHIEVEMENT_APPROVAL_REQUIRED' using errcode = 'P0001';
    end if;
    update achievement_profiles
       set visibility = p_visibility,
           approved_at = case when p_approve then now() else approved_at end,
           updated_at = now()
     where user_id = v_actor;
    return query select * from achievement_profiles where user_id = v_actor;
end;
$$;

revoke all on function app.upsert_own_achievement(text, text, text),
               app.set_own_achievement_visibility(achievement_visibility, boolean) from public;
grant execute on function app.upsert_own_achievement(text, text, text),
                          app.set_own_achievement_visibility(achievement_visibility, boolean) to tetote_app;
