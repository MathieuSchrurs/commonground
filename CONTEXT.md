# CommonGround

CommonGround helps a group (originally three couples) converge on one house to
buy together in Belgium. The domain language below names the concepts the code
speaks in. Architecture vocabulary (module, seam, deep/shallow) is separate and
lives in the review tooling, not here.

## Language

### The shared hunt

**Session**:
One group's shared house hunt — the aggregate everything else hangs off
(commute constraints, reactions, shared files, folders, the meeting). Identified
by an id in the URL; no login.
_Avoid_: room, group, room-code.

**Session store**:
The single seam over every session-scoped table. Exposes domain verbs
(`getSession`, `listFiles`, `toggleReaction`, …), returns domain types, owns the
camel↔snake mapping and the session-scoping/typed-error invariant. Routes are
thin shells over it.
_Avoid_: repository, DAO, service.

**Commute constraint**:
One participant's requirement — an address plus a time budget and transport mode
— that produces an isochrone. Stored in `session_users`; the domain type is
`CommuteConstraint`.
_Avoid_: user, member, person.

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

### Converging

**Reaction**:
A participant's `love` or `veto` on a listing. Re-applying the same reaction
removes it; a different one replaces it.
_Avoid_: vote, like, rating.

**Favorite**:
A listing the group has reacted to, surfaced and ranked for the shortlist and
dashboard. Derived from reactions.
_Avoid_: shortlist item, pick, bookmark.
