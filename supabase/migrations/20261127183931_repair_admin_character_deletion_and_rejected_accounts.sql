-- Make character deletion verifiable and remove characters left behind by earlier refusals.
drop function if exists public.admin_delete_character(uuid);

create function public.admin_delete_character(p_character_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  deleted_character_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administration.';
  end if;

  delete from public.characters
  where id = p_character_id
  returning id into deleted_character_id;

  if deleted_character_id is null then
    raise exception 'Personnage introuvable ou déjà supprimé.';
  end if;

  return deleted_character_id;
end;
$function$;

revoke all on function public.admin_delete_character(uuid) from public;
grant execute on function public.admin_delete_character(uuid) to authenticated;

-- A refused account stays recorded as refused, but its characters are removed.
delete from public.characters c
using public.players p
where p.id = c.player_id
  and p.registration_status = 'rejected';
