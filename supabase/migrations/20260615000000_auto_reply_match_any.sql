-- Auto-Reply: new "any" match mode — every comment on the reel triggers the
-- automation, no keywords needed (classic "comment anything for the link" CTA).
-- Keywords stay NOT NULL; "any" automations simply store an empty array.

alter table reel_automations drop constraint if exists reel_automations_match_mode_check;
alter table reel_automations
  add constraint reel_automations_match_mode_check
  check (match_mode in ('contains', 'exact', 'any'));
