-- Ensure admin player rejection and character deletion bypass client-side RLS safely.
-- Both operations remain restricted to authenticated administrators.

create or replace function public.admin_set_player_status(
  p_player_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administration.';
  end if;

  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Statut de joueur invalide.';
  end if;

  if p_status = 'rejected' then
    delete from public.characters
    where player_id = p_player_id;
  end if;

  update public.players
  set registration_status = p_status
  where id = p_player_id;

  if not found then
    raise exception 'Joueur introuvable.';
  end if;
end;
$function$;

create or replace function public.admin_delete_character(
  p_character_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administration.';
  end if;

  delete from public.characters
  where id = p_character_id;

  if not found then
    raise exception 'Personnage introuvable.';
  end if;
end;
$function$;

revoke all on function public.admin_set_player_status(uuid, text) from public;
revoke all on function public.admin_delete_character(uuid) from public;
grant execute on function public.admin_set_player_status(uuid, text) to authenticated;
grant execute on function public.admin_delete_character(uuid) to authenticated;
