-- System context: the schema owner may access tenant rows only when it explicitly
-- sets app.bypass = 'on' for the current transaction (public intake, platform
-- aggregates, defaults for new companies). The policy is granted to the owner role
-- only, so the restricted tenant role `deceler_app` can never use it.
do $$
declare t text;
begin
  foreach t in array array['pipeline_stages','jobs','candidates','applications','stage_history','cv_documents','notes','activities','workspace_records','email_outbox'] loop
    execute format('create policy system_context on %I to %I using (current_setting(''app.bypass'', true) = ''on'') with check (current_setting(''app.bypass'', true) = ''on'')', t, current_user);
  end loop;
end $$;
