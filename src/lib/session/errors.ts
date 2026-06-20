// Domain errors the Session store throws. The route() wrapper maps each to an
// HTTP status — nothing else in the app should need to catch these.

// A requested record does not exist (maps to 404).
export class NotFound extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} not found: ${id}`);
    this.name = 'NotFound';
  }
}

// The caller broke an invariant the store guarantees (maps to 400).
export class Invalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Invalid';
  }
}
