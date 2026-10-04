grant delete on public.vitality_cases,public.vitality_sms to service_role;
create or replace function public.vitality_delete_case(p_id text,p_expected integer)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_payload jsonb;
begin
select payload into v_payload from public.vitality_cases where id=p_id and version=p_expected for update;
if not found then return null; end if;
delete from public.vitality_sms where case_id=p_id;
delete from public.vitality_cases where id=p_id and version=p_expected;
return v_payload;
end; $$;
revoke all on function public.vitality_delete_case(text,integer) from public,anon,authenticated;
grant execute on function public.vitality_delete_case(text,integer) to service_role;
