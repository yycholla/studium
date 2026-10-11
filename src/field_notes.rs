use topcoat::{Result, router::page, view::view};

#[page("/field-notes")]
pub async fn field_notes() -> Result {
    view! {
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="theme-color" content="#17251f">
                <meta name="description" content="Plan your next FFXIV collectible. Save character goals and automatically sync public mounts, minions, emotes, and facewear.">
                <title>"Field Notes · The Studium"</title>
                crate::pages::favicon_links()
                <link rel="stylesheet" href="/assets/app.css">
                <link rel="stylesheet" href="/assets/field-notes.css">
                <script src="/assets/account.js" defer="defer"></script>
                <script src="/assets/field-notes.js" defer="defer"></script>
            </head>
            <body class="catalog-page field-page">
                <a class="skip-link" href="#field-library">"Skip to collections"</a>
                crate::pages::site_header(active: "field-notes")
                <div class="catalog-shell">
                    <aside class="catalog-sidebar" aria-label="Collection filters">
                        <p class="eyebrow">"YOUR FIELD JOURNAL"</p>
                        <div class="filters field-kinds" role="group" aria-label="Collection">
                            <button type="button" class="filter" data-kind="all" aria-pressed="true">"All collections"</button>
                            <button type="button" class="filter" data-kind="mounts" aria-pressed="false">"Mounts"</button>
                            <button type="button" class="filter" data-kind="minions" aria-pressed="false">"Minions"</button>
                            <button type="button" class="filter" data-kind="emotes" aria-pressed="false">"Emotes"</button>
                            <button type="button" class="filter" data-kind="facewear" aria-pressed="false">"Facewear"</button>
                        </div>
                        <div class="botanical-divider" aria-hidden="true"><img src="/assets/botanical/sprig.webp" alt="" width="22" height="36"></div>
                        <button type="button" id="field-wishlist" class="filter" aria-pressed="false">"My wishlist "<span id="field-goal-count">"0"</span></button>
                        <a href="/groups" class="filter">"Collection groups ↗"</a>
                        <div class="sidebar-note"><p>"A little journal for your next adventure."</p><img src="/assets/botanical/branch.webp" alt="" width="215" height="215" aria-hidden="true"></div>
                    </aside>
                    <main class="catalog-main">
                        <section class="intro" aria-labelledby="field-heading">
                            <p class="eyebrow">"THE STUDIUM / COLLECTIONS & GOALS"</p>
                            <h1 id="field-heading">"Field Notes"</h1>
                            <p class="intro-description">"Something worth setting out for."</p>
                            <p class="intro-caption">"Find a collectible. Note a goal. Watch your collection grow."</p>
                        </section>
                        <section class="field-sync" aria-labelledby="field-character">
                            <div><h2 id="field-character">"Your character journal"</h2><p id="field-sync-status" role="status" aria-live="polite">"Loading your account…"</p><p id="field-sync-time"></p></div>
                            <div class="field-sync-actions"><a class="primary-button" id="field-sign-in" href="/auth/login" hidden="hidden">"Sign in with XIVAuth"</a><a class="secondary-button" id="field-character-help" href="/account" hidden="hidden">"Link a character"</a><button type="button" class="secondary-button" id="field-refresh" hidden="hidden">"Check for updates"</button><a id="field-collect-profile" href="https://ffxivcollect.com/characters/search" target="_blank" rel="noopener noreferrer" hidden="hidden">"Open in FFXIV Collect ↗"</a></div>
                        </section>
                        <section id="field-library" aria-label="Collectible library">
                            <div class="field-controls">
                                <label class="field-search">"Search collections"<input id="field-search" type="search" maxlength="120" placeholder="A name, a duty, a place…" autocomplete="off"></label>
                                <label>"Show"<select id="field-owned"><option value="all">"Everything"</option><option value="missing">"Not collected"</option><option value="owned">"Collected"</option><option value="unknown">"Ownership unknown"</option></select></label>
                                <label>"Group by"<select id="field-group"><option value="collection">"Collection"</option><option value="source">"Source type"</option></select></label>
                            </div>
                            <p class="field-hint" id="field-group-hint" hidden="hidden">"Grouped by the first listed source type. Specific requirements and alternative sources appear on each card."</p>
                            <p id="field-feedback" class="notice" role="status" aria-live="polite"></p>
                            <div class="results-toolbar"><p id="field-count" role="status" aria-live="polite">"Loading collections…"</p><button type="button" id="field-retry" hidden="hidden">"Retry loading"</button></div>
                            <div id="field-results" aria-busy="true"></div>
                            <button type="button" class="show-more" id="field-more" hidden="hidden">"Show more"</button>
                            <noscript><p class="notice">"Enable JavaScript to search and sync collections. You can also browse them directly on "<a href="https://ffxivcollect.com/">"FFXIV Collect"</a>"."</p></noscript>
                        </section>
                        <details class="compatibility">
                            <summary>"How collection sync works"</summary>
                            <p>"Your selected XIVAuth character supplies the Lodestone ID. Your browser checks public collection data from FFXIV Collect automatically when you open this page or switch characters, at most once an hour. While this page is open, it checks again periodically. FFXIV Collect refreshes stale Lodestone data on its own schedule, so new items may take several hours to appear."</p>
                            <p>"Mounts, minions, emotes, and facewear can sync when their Lodestone collections and FFXIV Collect profile are public. A character not yet tracked needs to be added on FFXIV Collect first. Private or unavailable collections have unknown ownership. Orchestrion rolls and other private collections are not included in this version."</p>
                            <p>"Wishlists and notes belong to each character. Collected goals stay in your journal and update automatically; there is no manual completion checkbox."</p>
                            <a href="https://ffxivcollect.com/faq" target="_blank" rel="noopener noreferrer">"Collection visibility help ↗"</a>
                        </details>
                        <p class="field-credit">"Collection data and icons from "<a href="https://ffxivcollect.com/" target="_blank" rel="noopener noreferrer">"FFXIV Collect"</a>". Sources are community maintained. The catalog refreshes with the daily site build."</p>
                    </main>
                </div>
                crate::pages::site_footer()
            </body>
        </html>
    }
}
