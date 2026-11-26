alter table public.scoop_post_reactions
  drop constraint if exists scoop_post_reactions_reaction_type_check;

alter table public.scoop_post_reactions
  add constraint scoop_post_reactions_reaction_type_check
  check (
    reaction_type = any (
      array['like', 'dislike', 'laugh', 'shock', 'watch', 'fire', 'disappointed']::text[]
    )
  );
