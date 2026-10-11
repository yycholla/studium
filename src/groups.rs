use topcoat::{Result, router::page, view::view};

#[page("/groups")]
pub async fn groups() -> Result {
    view! {
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="theme-color" content="#17251f"><meta name="referrer" content="no-referrer">
                <meta name="description" content="Plan FFXIV collection runs with your friends, free company, or party. Share only the progress and wishlist you choose.">
                <title>"Collection groups · The Studium"</title>
                crate::pages::favicon_links()
                <link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/groups.css">
                <script src="/assets/group-planner.js" defer="defer"></script>
                <script src="/assets/groups.js" defer="defer"></script>
                <script src="/assets/account.js" defer="defer"></script>
            </head>
            <body>
                <a class="skip-link" href="#group-content">"Skip to groups"</a>
                crate::pages::site_header(active: "field-notes")
                <main class="container group-main" id="group-content">
                    <section class="intro"><p class="eyebrow">"FIELD NOTES / TOGETHER"</p><h1>"Collection groups"</h1><p class="intro-description">"An adventure for everyone."</p><p class="intro-caption">"Find runs that bring your friends closer to their next collectible."</p><a href="/field-notes" class="group-link">"Open your Field Notes & sync collections ↗"</a></section>
                    <p id="group-feedback" role="status" aria-live="polite"></p>
                    <section id="group-auth" class="group-panel"><h2>"Bring your company"</h2><p id="group-auth-message">"Loading your account…"</p><a id="group-login" class="primary-button" href="/auth/login" hidden="hidden">"Sign in with XIVAuth"</a></section>
                    <section id="group-invitation" class="group-panel" hidden="hidden" aria-label="Group invitation"></section>
                    <div id="group-workspace" class="group-layout" hidden="hidden">
                        <aside aria-label="Your groups"><section class="group-panel"><h2>"My groups"</h2><div id="group-list"></div><button id="group-reload" type="button" class="secondary-button">"Refresh groups"</button></section>
                            <details class="group-panel" id="group-create-details"><summary>"Create a group"</summary><form id="group-create">
                                <label>"Group name"<input name="name" maxlength="80" required="required" placeholder="Friday mount runs"></label>
                                <label>"Group type"<select name="kind"><option value="friends">"Friends · persistent"</option><option value="fc">"Free company · persistent"</option><option value="party">"Party · expires in 24 hours"</option></select></label>
                                <label>"Collection focus"<select name="collection_focus"><option value="all">"All collections"</option><option value="mounts">"Mounts"</option><option value="minions">"Minions"</option><option value="emotes">"Emotes"</option><option value="facewear">"Facewear"</option></select></label>
                                <p class="group-small">"Sets the default comparison for everyone in the group."</p>
                                <div id="group-create-sharing"></div><button type="submit" class="primary-button">"Create group"</button>
                            </form></details>
                        </aside>
                        <div>
                            <section id="group-empty" class="group-panel"><h2>"A place for your next outing"</h2><p>"Create a group or follow a friend’s invitation. Each member chooses a linked character and what to share. Group membership is managed here; it does not follow your in-game party or FC roster."</p></section>
                            <section id="group-detail" hidden="hidden">
                                <div class="group-panel"><p id="group-type" class="eyebrow"></p><h2 id="group-name"></h2><p id="group-expiry"></p><div class="group-actions"><button id="group-refresh" class="secondary-button" type="button">"Refresh shared progress"</button><button id="group-invite" class="secondary-button" type="button" hidden="hidden">"Create new invite link"</button></div><div id="group-invite-output" hidden="hidden"></div>
                                    <details id="group-focus-settings" hidden="hidden"><summary>"Group collection focus"</summary><form id="group-focus-form"><label>"Default collection"<select name="collection_focus" id="group-focus-value"><option value="all">"All collections"</option><option value="mounts">"Mounts"</option><option value="minions">"Minions"</option><option value="emotes">"Emotes"</option><option value="facewear">"Facewear"</option></select></label><p class="group-small">"Sets the group’s default comparison. Members can change their own view; sharing choices are unchanged."</p><button type="submit" class="primary-button">"Save group focus"</button></form></details>
                                    <details id="group-settings"><summary>"My character & sharing"</summary><form id="group-sharing"><div id="group-sharing-fields"></div><button type="submit" class="primary-button">"Save sharing choices"</button></form><p class="group-small">"Each group remembers its own character. Changing your top-right account selection does not change what you share here. Personal notes are never shared."</p></details>
                                    <details id="group-close"><summary id="group-close-title">"Leave group"</summary><p id="group-close-help"></p><button type="button" id="group-leave" class="secondary-button">"Leave group"</button></details>
                                </div>
                                <section class="group-panel" id="group-import" hidden="hidden"><h2>"Add public characters"</h2><p class="group-small">"Choose friends or FC members without requiring them to join Studium. Imports share public collection progress with this group, give no account access, and include no wishlist or notes. Up to 50 public characters per group."</p>
                                    <form id="group-roster-form"><label>"Your linked character"<select id="group-roster-character" name="character_key"></select></label><label>"Public Lodestone roster"<select name="source" id="group-roster-source"><option value="fc">"Free company members"</option><option value="friends">"Friends list"</option></select></label><button class="secondary-button" type="submit">"Load public roster"</button></form>
                                    <p id="group-roster-status" role="status"></p><div id="group-roster-results"></div><div class="group-actions"><button id="group-roster-next" type="button" class="secondary-button" hidden="hidden">"Next roster page"</button><button id="group-roster-add" type="button" class="primary-button" hidden="hidden">"Add selected characters"</button><button id="group-public-refresh" type="button" class="secondary-button">"Sync public collections"</button></div><p class="group-small">"Public collections sync when the owner opens this group, at most once an hour. Private, untracked, or unavailable data stays unknown. Roster changes require another import; remove characters here when needed."</p>
                                </section>
                                <section class="group-panel"><h2>"Who’s coming?"</h2><p class="group-small">"Choose characters for this comparison. Unknown or stale progress never counts as confirmed missing. Wishlists can still suggest a run."</p><div id="group-members"></div></section>
                                <section aria-labelledby="group-runs-heading"><h2 id="group-runs-heading">"What can we run together?"</h2><div class="group-filters">
                                    <label>"Find a duty or reward"<input id="group-search" type="search" maxlength="120" placeholder="A duty, a mount, a minion…"></label>
                                    <label>"Collections"<select id="group-collection"><option value="group" id="group-collection-default">"Group focus: All collections"</option><option value="all">"All collections"</option><option value="mounts">"Mounts"</option><option value="minions">"Minions"</option><option value="emotes">"Emotes"</option><option value="facewear">"Facewear"</option></select></label>
                                    <label>"Sources"<select id="group-scope"><option value="duties">"Duties"</option><option value="all">"All acquisition sources"</option></select></label>
                                    <label class="group-check"><input type="checkbox" id="group-wishlist-only">"Wishlist goals only"</label>
                                    <label class="group-check"><input type="checkbox" id="group-everyone">"Something for everyone selected"</label>
                                </div><p id="group-catalog-status" class="group-small"></p><button id="group-catalog-retry" class="secondary-button" type="button" hidden="hidden">"Retry catalogs"</button><p id="group-result-count" role="status" aria-live="polite"></p><div id="group-results"></div><button id="group-more" class="secondary-button" type="button" hidden="hidden">"Show more activities"</button></section>
                            </section>
                        </div>
                    </div>
                    <details class="group-help"><summary>"About sharing and matching"</summary><p>"Share collection progress, your wishlist, both, or neither. Other group members can see your chosen character and the information you share. You can change these choices or leave at any time. Owners can remove members and delete the group. Invitations can be forwarded, so share them with people you want in your group."</p><p>"Joined members use their Field Notes journals. Imported characters use only public FFXIV Collect profiles and have no group access. Owners can remove imported characters at any time. Progress for joined members comes from each member’s Field Notes journal. Open Field Notes to sync your character; refreshing a group reads the latest saved progress. Data older than 24 hours, or a failed sync, is treated as stale. Private collections remain unknown."</p><p>"Choose Mounts, Minions, Emotes, or Facewear to rank only that collection’s rewards. Group focus uses the owner’s saved default; the comparison dropdown changes only your view. Activities are ranked by how many selected members could benefit, then whose wishlist they advance. Matching uses the same source type and name from FFXIV Collect, including alternative sources. Different difficulty names stay separate. This does not check duty unlocks, party size, drop rates, or guarantee rewards. Achievement and vendor requirements are listed under All acquisition sources."</p></details>
                    <p class="group-small">"Collection sources from "<a href="https://ffxivcollect.com/" target="_blank" rel="noopener noreferrer">"FFXIV Collect ↗"</a>"."</p>
                    <noscript><p>"Enable JavaScript to create and compare collection groups."</p></noscript>
                </main>
                crate::pages::site_footer()
            </body>
        </html>
    }
}
