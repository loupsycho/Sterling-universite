alter table public.scoop_posts
  add column if not exists target_character_ids uuid[] not null default '{}',
  add column if not exists categories text[] not null default '{}';

update public.scoop_posts
set target_character_ids = array[target_character_id]
where target_character_id is not null
  and cardinality(target_character_ids) = 0;

alter table public.scoop_submissions
  add column if not exists submission_source text not null default 'character';

alter table public.scoop_submissions
  drop constraint if exists scoop_submissions_submission_source_check;

alter table public.scoop_submissions
  add constraint scoop_submissions_submission_source_check
  check (submission_source in ('character', 'player'));

create index if not exists scoop_posts_target_character_ids_gin_idx
  on public.scoop_posts using gin (target_character_ids);
