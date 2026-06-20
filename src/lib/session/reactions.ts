import { ReactionKind } from '@/types/reactions';

// What toggling a reaction should do, given a participant's current reaction on
// a listing (if any) and the one they just applied. Pure, so the toggle rules
// are testable without a database:
//   - same reaction again  -> remove it
//   - a different reaction -> replace it
//   - none yet             -> add it
export type ToggleOutcome =
  | { action: 'remove' }
  | { action: 'upsert'; reaction: ReactionKind };

export function resolveToggle(
  existing: ReactionKind | null,
  incoming: ReactionKind,
): ToggleOutcome {
  if (existing === incoming) return { action: 'remove' };
  return { action: 'upsert', reaction: incoming };
}
