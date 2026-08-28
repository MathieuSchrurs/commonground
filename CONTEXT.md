# CommonGround

CommonGround helps a group (originally three couples) converge on one house to
buy together in Belgium. The domain language below names the concepts the code
speaks in. Architecture vocabulary (module, seam, deep/shallow) is separate and
lives in the review tooling, not here.

## Language

### The shared hunt

**Session**:
One group's shared house hunt — the aggregate everything else hangs off
(commute constraints, reactions, shared files, folders, the meeting). Has a
human-readable `name` and a `created_by` owner; identified by an id in the URL.
Access is gated by membership, not by knowing the URL.
_Avoid_: room, group, room-code.

**Account**:
An authenticated person, backed by Supabase Auth (`auth.users`). The principal
that signs in (Google, or email/password). Distinct from the in-session
presence it owns (its commute constraint).
_Avoid_: user, login, session_user.

**Membership**:
The link between an account and a session (`session_members`) — what "the
sessions I created or belong to" is built from, and what an invite grants.
_Avoid_: access, role, participant.

**Profile**:
An account's public face (display name, email, avatar) mirrored into `profiles`
from `auth.users`, so names and avatars can be shown without touching the
protected `auth` schema.
_Avoid_: user, identity, account-detail.

**Session store**:
The single seam over every session-scoped table. Exposes domain verbs
(`getSession`, `listFiles`, `toggleReaction`, …), returns domain types, owns the
camel↔snake mapping and the session-scoping/typed-error invariant. Routes are
thin shells over it.
_Avoid_: repository, DAO, service.

**Household**:
The unit that decides — usually one couple. A session of three couples has six
participants (six commutes, because six jobs) but three households, and it is
households, not people, that have to agree on a house. A participant who
belongs to no household is a household of one, so the count is never zero and a
solo co-buyer is a first-class case.
_Avoid_: couple, family, team, party.

**Commute constraint**:
One participant's requirement — an address plus a time budget and transport mode
— that produces an isochrone. Stored in `session_users` (the in-session presence
of an account, via `account_id`); the domain type is `CommuteConstraint`.
_Avoid_: user, member, person.

### Meeting and record

**Meeting**:
The group's next get-together — one per session, with a time, a place, and an
agenda. Closing it clears the agenda and writes what was agreed into decisions.
_Avoid_: event, appointment, call.

**Agenda item**:
One thing to raise at the next meeting. Transient by design: it lives until the
meeting is closed, then it is either resolved or carried forward.
_Avoid_: meeting item, topic, note.

**Decision**:
Something the group has agreed and now treats as settled — "max €650k", "not
west of Ghent". It has a date and an author, it constrains the hunt from then
on, and it can be superseded but never completed. Not a todo.
_Avoid_: agreement, rule, conclusion.

**Todo**:
A piece of work someone has to do — assignable, and done or not done. Unlike a
decision, it disappears from the group's attention once it is finished.
_Avoid_: task, chore, action item.

**Needs you**:
What the hunt is waiting on from the viewer specifically — their open todos,
listings their household is still silent on, agenda items they raised. Silence
is what stalls a hunt, so this is the dashboard asking for the missing input
rather than reporting what already happened.
_Avoid_: activity, notifications, inbox.

### Places

**Listing**:
A property scraped from a source, keyed by `(source, external_id)`.
_Avoid_: property, house, result, ad.

**Isochrone**:
The area reachable from a commute constraint within its time budget, via Mapbox.
_Avoid_: zone, catchment, range.

**Intersection**:
The overlap of every participant's isochrone — the literal common ground where a
house satisfies all commutes.
_Avoid_: overlap, union, shared zone.

**Source**:
One scraper input (Realo, Immoweb, Immovlan, ImmoScoop, Zimmo). A replaceable
provider of listings.
_Avoid_: scraper (the code), site, provider.

**Property type**:
What kind of building a listing is — house, apartment, land, or commercial —
determined from the source's own raw listing data at scrape time.
_Avoid_: category, use, zoning, class.

### Converging

**Reaction**:
A participant's `love` or `object` on a listing. Re-applying the same reaction
removes it; a different one replaces it.
_Avoid_: vote, like, rating.

**Objection**:
The negative reaction — an opening position that needs answering, not a kill
switch. A listing stays alive and visible while objections stand; removing it
from the hunt is a deliberate group act, never the side effect of one reaction.
_Avoid_: veto, downvote, dislike, block.

**Household position**:
Where one household stands on one listing, derived from its members' reactions:
_yes_, _split_, _no_, or _silent_. A split household is an unresolved
conversation inside the couple, not a rejection. Silence does not block — one
partner speaks for the household until the other contradicts them, which is
exactly what turns the position into _split_.
_Avoid_: household vote, couple verdict, stance.

**Favorite**:
A listing two or more households are _yes_ on and no one has objected to — the
uncontested front of the hunt, ranked by how many households are in. Derived
from household positions, not from raw reaction counts.
_Avoid_: shortlist item, pick, bookmark.

**Unanimous**:
Every household is _yes_ on a listing and none is _silent_ — the strongest
signal the hunt can produce, and deliberately rare.
_Avoid_: consensus, everyone, full house.

**Contested listing**:
A listing with an objection still standing. Ranked by how close it is to
consensus, it is the group's real agenda — the houses worth meeting about.
_Avoid_: split vote, conflict, disputed.
