-- Fix the automatic enrollment trigger: TRIM is SQL syntax, not a pg_catalog function.
-- Use pg_catalog.btrim(text) so creating a character cannot fail in this trigger.
create or replace function public.portal_enroll_newly_approved_student()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status = 'approved'
     and new.character_type = 'Étudiant(e)'
     and nullif(pg_catalog.btrim(coalesce(new.study_program, '')), '') is not null then
    insert into public.portal_course_students (course_id, character_id)
    select pc.id, new.id
    from public.portal_courses pc
    where pc.is_historical = false
      and pc.attendance_submitted = false
      and pc.scheduled_at > pg_catalog.now()
      and pg_catalog.lower(pg_catalog.btrim(pc.subject)) =
          pg_catalog.lower(pg_catalog.btrim(new.study_program))
    on conflict (course_id, character_id) do nothing;
  end if;
  return new;
end;
$function$;
