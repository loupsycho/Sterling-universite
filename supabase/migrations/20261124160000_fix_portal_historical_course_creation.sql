-- Make historical and upcoming course creation reliable under client RLS.
-- Ownership and teacher-role checks remain explicit inside the definer function.
create or replace function public.portal_create_course(
  p_teacher_character_id uuid,
  p_scheduled_at timestamp with time zone,
  p_details text default null,
  p_is_historical boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_subject text;
  v_course_id uuid;
begin
  perform 1
  from public.characters c
  where c.id = p_teacher_character_id
    and c.player_id = auth.uid()
    and lower(coalesce(c.staff_job, '')) like 'professeur%'
    and position('—' in c.staff_job) > 0
  for update;

  if not found then
    raise exception 'Ce personnage ne possède pas de matière enseignée valide ou ne vous appartient pas.';
  end if;

  select trim(split_part(c.staff_job, '—', 2))
    into v_subject
  from public.characters c
  where c.id = p_teacher_character_id;

  if v_subject is null or v_subject = '' then
    raise exception 'Ce personnage ne possède pas de matière enseignée valide.';
  end if;

  if p_scheduled_at is null then
    raise exception 'La date et l’heure du cours sont obligatoires.';
  end if;

  if coalesce(p_is_historical, false) and p_scheduled_at >= now() then
    raise exception 'Un ancien cours doit avoir une date passée.';
  end if;

  if not coalesce(p_is_historical, false) and p_scheduled_at <= now() then
    raise exception 'Un cours à venir doit avoir une date future.';
  end if;

  if exists (
    select 1
    from public.portal_courses pc
    where pc.teacher_character_id = p_teacher_character_id
      and pc.attendance_submitted = false
  ) then
    raise exception 'Tu dois d’abord terminer la fiche d’appel de ton précédent cours.';
  end if;

  insert into public.portal_courses (
    teacher_character_id, subject, scheduled_at, details, is_historical
  )
  values (
    p_teacher_character_id, v_subject, p_scheduled_at,
    nullif(trim(p_details), ''), coalesce(p_is_historical, false)
  )
  returning id into v_course_id;

  insert into public.portal_course_students (course_id, character_id)
  select v_course_id, c.id
  from public.characters c
  where c.character_type = 'Étudiant(e)'
    and c.status = 'approved'
    and lower(trim(coalesce(c.study_program, ''))) = lower(trim(v_subject));

  return v_course_id;
end;
$function$;

revoke all on function public.portal_create_course(uuid, timestamptz, text, boolean) from public, anon;
grant execute on function public.portal_create_course(uuid, timestamptz, text, boolean) to authenticated;
