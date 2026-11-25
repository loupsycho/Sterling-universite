create table if not exists public.link_request_proposals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.link_requests(id) on delete cascade,
  proposed_by_character_id uuid not null references public.characters(id) on delete cascade,
  selected_links jsonb not null default '[]'::jsonb,
  message text not null check (length(trim(message)) > 0),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'refused', 'superseded')),
  responded_by_character_id uuid references public.characters(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists link_request_proposals_request_created_idx
  on public.link_request_proposals (request_id, created_at desc);

alter table public.link_request_proposals enable row level security;
revoke all on public.link_request_proposals from anon, authenticated;
grant select on public.link_request_proposals to authenticated;

drop policy if exists "Participants can view link request proposals" on public.link_request_proposals;
create policy "Participants can view link request proposals"
on public.link_request_proposals
for select
to authenticated
using (
  exists (
    select 1
    from public.link_requests r
    join public.characters c
      on c.id in (r.requester_character_id, r.target_character_id)
    where r.id = link_request_proposals.request_id
      and c.player_id = (select auth.uid())
  )
);

create or replace function public.submit_link_request_proposal(
  p_request_id uuid,
  p_character_id uuid,
  p_selected_links jsonb,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.link_requests%rowtype;
  v_last_proposer uuid;
  v_proposal_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.characters
    where id = p_character_id and player_id = auth.uid()
  ) then
    raise exception 'Personnage non autorisé.';
  end if;

  if p_selected_links is null
     or jsonb_typeof(p_selected_links) <> 'array'
     or jsonb_array_length(p_selected_links) = 0 then
    raise exception 'Choisis au moins un lien.';
  end if;

  if p_message is null or length(trim(p_message)) = 0 then
    raise exception 'Ajoute un message à ta contre-proposition.';
  end if;

  select * into v_request
  from public.link_requests
  where id = p_request_id
  for update;

  if not found or v_request.status <> 'pending' then
    raise exception 'Cette demande n’est plus en attente.';
  end if;

  if p_character_id not in (
    v_request.requester_character_id,
    v_request.target_character_id
  ) then
    raise exception 'Ce personnage ne participe pas à cette demande.';
  end if;

  select proposed_by_character_id into v_last_proposer
  from public.link_request_proposals
  where request_id = p_request_id and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if v_last_proposer is null then
    if p_character_id <> v_request.target_character_id then
      raise exception 'La demande doit d’abord recevoir une réponse.';
    end if;
  elsif v_last_proposer = p_character_id then
    raise exception 'Attends que l’autre personne réponde à ta proposition.';
  end if;

  update public.link_request_proposals
  set status = 'superseded'
  where request_id = p_request_id and status = 'pending';

  insert into public.link_request_proposals (
    request_id, proposed_by_character_id, selected_links, message
  )
  values (
    p_request_id, p_character_id, p_selected_links, trim(p_message)
  )
  returning id into v_proposal_id;

  return v_proposal_id;
end;
$$;

create or replace function public.respond_to_link_request_proposal(
  p_proposal_id uuid,
  p_character_id uuid,
  p_accept boolean,
  p_refusal_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal public.link_request_proposals%rowtype;
  v_request public.link_requests%rowtype;
  v_expected_responder uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.characters
    where id = p_character_id and player_id = auth.uid()
  ) then
    raise exception 'Personnage non autorisé.';
  end if;

  select * into v_proposal
  from public.link_request_proposals
  where id = p_proposal_id
  for update;

  if not found or v_proposal.status <> 'pending' then
    raise exception 'Cette contre-proposition n’est plus en attente.';
  end if;

  select * into v_request
  from public.link_requests
  where id = v_proposal.request_id
  for update;

  if not found or v_request.status <> 'pending' then
    raise exception 'Cette demande n’est plus en attente.';
  end if;

  v_expected_responder := case
    when v_proposal.proposed_by_character_id = v_request.requester_character_id
      then v_request.target_character_id
    else v_request.requester_character_id
  end;

  if p_character_id <> v_expected_responder then
    raise exception 'Tu ne peux pas répondre à ta propre contre-proposition.';
  end if;

  if not p_accept and (p_refusal_reason is null or length(trim(p_refusal_reason)) = 0) then
    raise exception 'Explique pourquoi tu refuses cette contre-proposition.';
  end if;

  update public.link_request_proposals
  set status = case when p_accept then 'accepted' else 'refused' end,
      responded_by_character_id = p_character_id,
      responded_at = now()
  where id = p_proposal_id;

  if p_accept then
    update public.link_requests
    set status = 'accepted',
        selected_links = v_proposal.selected_links,
        refusal_reason = null,
        updated_at = now()
    where id = v_request.id;

    insert into public.character_links (
      request_id, character_one_id, character_two_id, link_details
    )
    values (
      v_request.id,
      v_request.requester_character_id,
      v_request.target_character_id,
      v_proposal.selected_links
    )
    on conflict (request_id) do nothing;
  else
    update public.link_requests
    set status = 'refused',
        refusal_reason = trim(p_refusal_reason),
        updated_at = now()
    where id = v_request.id;
  end if;
end;
$$;

revoke all on function public.submit_link_request_proposal(uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.respond_to_link_request_proposal(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.submit_link_request_proposal(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.respond_to_link_request_proposal(uuid, uuid, boolean, text) to authenticated;

create or replace function public.notify_new_link_request_proposal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient uuid;
begin
  select case
    when new.proposed_by_character_id = r.requester_character_id
      then r.target_character_id
    else r.requester_character_id
  end
  into v_recipient
  from public.link_requests r
  where r.id = new.request_id;

  if v_recipient is not null then
    insert into public.notifications (
      recipient_character_id, source_app, notification_type,
      title, body, related_id, actor_character_id
    )
    values (
      v_recipient, 'links', 'new_link_counterproposal',
      'Nouvelle contre-proposition',
      'Un personnage a répondu à ta demande de lien avec une contre-proposition.',
      new.request_id, new.proposed_by_character_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_notify_new_link_request_proposal on public.link_request_proposals;
create trigger trigger_notify_new_link_request_proposal
after insert on public.link_request_proposals
for each row execute function public.notify_new_link_request_proposal();
