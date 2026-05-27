-- 084: client_pillars — add format_type + talent_model.
--
-- Why this is a separate migration (not edited into 083): 083 is
-- already applied in production. Adding columns is additive and safe;
-- editing the original creates drift between local + remote schemas.
--
-- format_type — each pillar carries its own format identity:
--   long_form  — long-form episodes only
--   shorts     — shorts only (rapid-cadence, vertical, ≤180s)
--   multi_cut  — long-form anchor episode + derivative shorts cuts.
--                The pillar is ONE creative concept; the shorts are
--                clips of the long-form, not separate episodes.
--
-- talent_model — not every pillar needs an on-camera host. Surfacing
-- this explicitly lets the production plan + budget reflect the
-- talent requirement honestly.
--   host       — requires an on-camera host. host_id links the
--                cast/pending talent in client_hosts.
--   voiceover  — VO talent only, no on-camera. Strategist may or may
--                not track the VO talent in client_hosts (the
--                relationship is loose).
--   none       — no human talent. UGC compilations, raw footage
--                series, animation, slideshow formats. host_id
--                should stay null.

ALTER TABLE client_pillars
  ADD COLUMN IF NOT EXISTS format_type TEXT
    CHECK (format_type IS NULL OR format_type IN ('long_form', 'shorts', 'multi_cut')),
  ADD COLUMN IF NOT EXISTS talent_model TEXT
    CHECK (talent_model IS NULL OR talent_model IN ('host', 'voiceover', 'none'));

COMMENT ON COLUMN client_pillars.format_type IS
  'long_form: long-form episodes only. shorts: shorts-only series. multi_cut: long-form anchor episodes with derivative shorts cuts (one creative concept, two output formats).';
COMMENT ON COLUMN client_pillars.talent_model IS
  'host: requires on-camera host (host_id links to client_hosts). voiceover: VO talent only, no on-camera. none: no human talent (UGC, footage, animation, slideshow).';
