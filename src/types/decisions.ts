// Something the group has agreed and now treats as settled — "max €650k",
// "not west of Ghent". It has a date and an author, it constrains the hunt
// from then on, and it can be superseded but never completed.
//
// Deliberately no `done`: a decision is not a todo. See docs/adr/0003.
export interface Decision {
  id: string;
  session_id: string;
  text: string;
  decided_by: string | null; // session_users.id
  superseded_by: string | null; // the decision that replaced this one
  created_at?: string;
}
