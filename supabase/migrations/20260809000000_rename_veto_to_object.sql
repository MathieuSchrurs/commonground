-- Rename the negative reaction: 'veto' -> 'object'.
--
-- The word promised a kill switch the code never had — a vetoed listing was
-- still rendered, just with the objectors' names underneath. An objection is
-- an opening position that needs answering; removing a listing from the hunt
-- stays a deliberate group act. See docs/adr/0002.
--
-- Order matters: the CHECK constraint forbids 'object', so it has to come off
-- before the rows can be rewritten, and go back on after.

ALTER TABLE listing_reactions DROP CONSTRAINT IF EXISTS listing_reactions_reaction_check;

UPDATE listing_reactions SET reaction = 'object' WHERE reaction = 'veto';

ALTER TABLE listing_reactions
  ADD CONSTRAINT listing_reactions_reaction_check
  CHECK (reaction IN ('love', 'object'));
