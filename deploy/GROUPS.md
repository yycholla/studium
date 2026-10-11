# Collection groups

`/groups` extends Field Notes with invite-only groups. Friends and FC groups persist until deleted. Temporary parties expire after 24 hours. FC/party names describe the group’s purpose; Studium does not discover or verify in-game membership.

## Joining and sharing

The owner creates a group and receives an invitation URL. Tokens are random 256-bit values; only a SHA-256 digest is stored. Links use a URL fragment, which the page removes from the address bar, and send the token in a same-origin POST. Pending invitations stay in tab session storage across sign-in, then are removed on join, dismissal, or logout. After XIVAuth returns to Account, the Collection groups link resumes the invitation. Previews require sign-in and show only group name, type, and expiry. They never expose member data.

Joining requires an explicit linked-character choice and two independent sharing flags, initially unchecked. One account contributes one character to each group, and the same Lodestone character cannot appear twice in a group. Each group remembers its character independently of the top-right account selection. Changing character clears the form’s sharing checkboxes for renewed consent. Sharing flags permit collection progress, wishlist item IDs, both, or neither; names/worlds remain visible to members. Notes are never selected by group queries or returned by group APIs.

Only current members can read the roster and opted-in data. A member can disable sharing or leave; subsequent reads lose access immediately. Already viewed information cannot be recalled. The visible page refreshes saved group state every 30 seconds and on focus, without overwriting pending sharing edits. Loss of membership clears the comparison. Owners may delete their group or remove another member. Removal also revokes the current invitation, preventing reuse of that link. Invitations can be forwarded and are not single-use; replacement links revoke prior ones. Persistent-group invites expire after seven days, party invites when the party expires.

There are limits of 50 members per group, 20 memberships per account, and 10 owned groups per account. Atomic inserts enforce membership caps and invitation validity. Names are limited to 80 characters. Creation uses a D1 transaction for group and owner membership.

## Matching and freshness

Owners choose a saved collection focus when creating a group or under Group collection focus: all collections, mounts, minions, emotes, or facewear. Existing groups default to all collections through migration `0005_group_collection_focus.sql`. The default comparison follows this focus for every member, including future updates. Each member can override the Collections dropdown for their current view without changing the saved group setting; switching groups restores that group’s default. Focus filters catalogs before beneficiary counts, wishlist ranking, and the everyone filter are calculated, so unrelated categories cannot inflate mount-grind rankings. This is a comparison preference, not a change to members’ sharing permissions.

Public catalogs are the existing validated FFXIV Collect snapshots. Matching considers every listed source, groups identical normalized source type/name pairs, and deduplicates repeated sources for each reward. Whitespace/case normalization does not merge different duty difficulties or infer prerequisites. The default Duties filter includes Trial, Raid, Dungeon, Deep Dungeon, and V&C Dungeon source types (including plural forms). All acquisition sources also includes achievements, vendors, and other community-listed requirements; these are not assumed to be direct drops.

Each activity lists the rewards and selected members who might benefit. Results rank by distinct beneficiaries, then members with wishlist goals, confirmed missing rewards, reward count, and name. A member counts at most once per activity. “Something for everyone selected” requires each selected linked member to benefit from at least one reward; they need not all need the same item. Search filters source names and reward names before ranking. Collection-only and wishlist-only sharing are both supported.

Collection ownership requires an opted-in public collection, a ready snapshot, and source/check timestamps within the last 24 hours. Failed syncs, older data, missing/private collections, and unlinked characters are unknown, never confirmed missing. Wishlist suggestions can still appear with unknown/stale ownership and are labeled accordingly. Known collected goals do not count as benefits. Browser-reported snapshots remain advisory, as in Field Notes; matching does not establish game entitlement or independently verified progress.

For joined members, opening a group reads each member’s saved Field Notes journal; it does not request other members’ Lodestone data or trigger their browser sync. Members sync their own character by opening Field Notes. New saved snapshots/goals are reflected on the next group refresh. Catalog failures identify incomplete/cached comparisons and offer retry. No duty unlock, role, party-size, availability, drop-rate, or guarantee-of-reward claims are made.

## Storage and APIs

Migration `0004_collection_groups.sql` adds groups and memberships with account/group foreign-key cascades. Memberships use account + Lodestone ID, surviving replacement of character rows during XIVAuth refresh. Every shared read verifies the member’s character is still linked; unlinking suppresses their name, collections, and goals. Deleting an account removes its memberships and owned groups. Expired parties are denied immediately and their records are deleted on subsequent authenticated group activity. Existing personal journals remain when groups are deleted.

All `/api/groups/*` routes run through the Worker before assets. Responses are private/no-store; all writes require a session, same-origin JSON, and CSRF token. Group/member IDs are not access credentials. Mutating requests are limited to 4 KB, except public collection reports (300 KB).

- `GET list`: groups for the current account.
- `GET detail?id=…`: member-only roster and shared projections.
- `POST preview {invite}`: group metadata only.
- `POST create {name,kind,collection_focus,character_key,share_collections,share_wishlist}`: creates the owner membership and returns the group and invite URL.
- `POST join {invite,character_key,share_collections,share_wishlist}`: joins without modifying an existing membership.
- `POST sharing {group_id,character_key,share_collections,share_wishlist}`: changes the caller’s sharing and character only.
- `POST focus {group_id,collection_focus}`: owner-only update of the group’s default collection.
- `POST invite {group_id}`: owner-only invite rotation.
- `POST remove {group_id,member_id}`: owner-only removal and current-link revocation.
- `POST leave {group_id}`: non-owner membership removal.
- `POST delete {group_id}`: owner-only deletion with cascades.

## Validation

`npm run test:groups` exercises the actual Worker router with SQLite migrations, access/CSRF and consent boundaries, invitation rotation, unlinking, account deletion, expiry, limits, matching, and exported-page interactions. A two-account Chromium test uses those same backend routes to create, join, compare, revoke sharing, and leave. Website CI runs it at 320–1440 px and retains screenshots. Production verification checks the exported groups page after migrations and deployment.


## Public friends and FC comparisons

Owners can load a public Lodestone roster using one of their linked characters, select characters across pages, and add up to 50 public comparison entries. A public entry is not a membership, cannot read the group, and never reads another account’s journals, goals, notes, or linked characters. Existing group members take precedence even when their sharing is disabled; joining or switching to an imported character removes that import permanently. Sources reflect the imported roster, not a live assertion of friendship/FC membership. Re-import/remove to reflect roster changes.

`0006_public_group_characters.sql` adds separate group-scoped public snapshots and short-lived roster previews. All new endpoints require a session, group membership, ownership, same-origin JSON, and CSRF:

- `POST roster {group_id,character_key,source,page}`: `friends` or `fc`, 1–11 pages. Only the caller’s linked characters may anchor a roster. FC ID comes from that character’s public profile. Fetches fixed public Lodestone URLs with no cookies, manual redirects, 15-second timeout, and 2 MB response cap. Native HTMLRewriter parses only roster entries. Empty/private/unrecognized pages fail explicitly; they never mean a complete empty roster. A per-group two-second reservation limits concurrent requests. Previews expire after 15 minutes and are removed on subsequent group activity.
- `POST public-add {group_id,ids}`: validates IDs against the recent preview and adds comparison entries. No invitations or group memberships are created.
- `POST public-remove {group_id,public_id}`: removes the import and snapshot.
- `POST public-sync {group_id,public_id,profile|status}`: validates and stores only supported public collection fields. The browser fetches FFXIV Collect using official CORS, omits credentials, rejects redirects, bounds responses, and strips private IDs before reporting. The server independently normalizes and discards private fields. This is advisory browser-reported progress, never an entitlement or proof of game ownership.

While an owner views a group, public characters are checked sequentially at 1.5-second intervals when due. Successful checks are cached for an hour, failures for five minutes. Switching groups or accounts aborts pending provider work; response versioning prevents a late result from restoring removed/shared data. Private, untracked, malformed, failed, and stale collections cannot count as confirmed missing. Source timestamps remain visible. Provider data may itself be cached. There is no scheduled background roster or collection scrape.

`tests/public-groups.mjs` covers access, provenance, consent precedence, private IDs, untracked/failure behavior, caps, and cascades. `tests/rosters-runtime.mjs` exercises the native Workers HTML parser; CI also parses live public friends and FC pages. Before production deployment, `tests/rosters-edge.mjs` uses an isolated Wrangler remote-dev preview to verify public friends, FC roster parsing, and character-linked FC lookup from Cloudflare itself. The probe has no production database or secrets bindings, exposes only fixed checks, reports counts, and is stopped after validation. Provider refusal in the application is shown as an unavailable message and never interprets collections as missing.


## Reward ownership filters

The comparison’s **Owned by** selector filters individual rewards by the currently selected characters: any number, nobody, exactly one, some but not everyone, everyone except one, everyone, or a custom nonnegative integer. Joined members and imported characters count equally. Unselected characters do not count. Each reward shows owned, confirmed missing, and unknown totals.

Specific count filters require fresh public collection data for every selected character; unshared, private, failed, or stale data cannot establish an ownership count, even when a wishlist is shared. Counts are calculated before grouping sources and ranking activities, so a nonmatching reward cannot inflate an activity’s benefit score. Collection, search, wishlist, and everyone-benefits filters still combine with ownership. “Everyone owns” can show fully collected rewards; they have no beneficiaries. The default “Any number” retains the useful-reward comparison. Filters are personal view settings, survive group refresh, and change no saved sharing or group defaults.
