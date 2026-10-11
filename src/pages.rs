use crate::catalog::{CATEGORIES, EMOJI, Emoji, SYMBOL_SOURCE};
use topcoat::{
    Result,
    router::page,
    view::{component, view},
};

#[page("/")]
pub async fn home() -> Result {
    view! {
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="theme-color" content="#17251f">
                <meta name="description" content="The Studium: little tools for life in Eorzea. Explore a growing collection of FFXIV companion tools, starting with Chatpendium.">
                <title>"The Studium · Little tools for life in Eorzea"</title>
                favicon_links()
                <link rel="stylesheet" href="/assets/app.css">
                <script src="/assets/account.js" defer="defer"></script>
            </head>
            <body class="hub-page">
                <a class="skip-link" href="#tools">"Skip to tools"</a>
                site_header(active: "hub")
                <main class="container hub-main">
                    <section class="hub-intro" aria-labelledby="hub-heading">
                        <p class="eyebrow">"A COLLECTION FOR THE CURIOUS"</p>
                        <h1 id="hub-heading">"Little tools for life in Eorzea."</h1>
                        <p class="intro-description">"A collection of FFXIV companion tools, made by yycholla. Start with Chatpendium: text faces and symbols for your next hello, party clear, or o7."</p>
                    </section>
                    <section id="tools" aria-labelledby="tools-heading">
                        <div class="section-heading"><h2 id="tools-heading">"Explore the collection"</h2><span class="section-meta">"Made by yycholla"</span></div>
                        <a class="tool-card" href="/chatpendium" aria-labelledby="chatpendium-title" aria-describedby="chatpendium-description">
                            <div class="tool-illustration" aria-hidden="true"><span>"(^ω^)"</span><span>"(^_^)/"</span><span>"♡"</span></div>
                            <div class="tool-description">
                                <p class="eyebrow">"CHAT & EXPRESSION"</p>
                                <h3 id="chatpendium-title">"Chatpendium"</h3>
                                <p id="chatpendium-description">"Text faces and symbols for FFXIV chat. Find a face, keep your favorites, and copy it into chat."</p>
                                <div class="tool-card-bottom"><span>(EMOJI.len()) " expressions · No account needed"</span><span class="tool-open">"Open Chatpendium ↗"</span></div>
                            </div>
                        </a>
                    </section>
                    <p class="hub-note">"One tool to start. Room for more as the collection grows."</p>
                </main>
                site_footer()
            </body>
        </html>
    }
}

#[page("/chatpendium")]
pub async fn chatpendium() -> Result {
    view! { chatpendium_document() }
}

#[component]
async fn chatpendium_document() -> Result {
    view! {
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="theme-color" content="#17251f">
                <meta name="description" content="Text faces and symbols for FFXIV chat. Search, save your favorites, and copy a face into chat.">
                <title>"Chatpendium · The Studium"</title>
                favicon_links()
                <link rel="stylesheet" href="/assets/app.css">
                <script src="/assets/app.js" defer="defer"></script>
                <script src="/assets/account.js" defer="defer"></script>
            </head>
            <body class="catalog-page">
                <a class="skip-link" href="#library">"Skip to expressions"</a>
                site_header(active: "chatpendium")
                <div class="catalog-shell">
                    <aside class="catalog-sidebar" aria-label="Expression filters">
                        <p class="eyebrow">"CHAT & EXPRESSION"</p>
                        <div class="filters" role="group" aria-label="Expression categories">
                            <button class="filter" data-category="all" aria-pressed="true" disabled="disabled">glyph(name: "chat-circle") <span>"All expressions"</span></button>
                            for (id, name) in CATEGORIES {
                                <button class="filter" data-category=(*id) aria-pressed="false" disabled="disabled">glyph(name: category_icon(id)) <span>(*name)</span></button>
                            }
                        </div>
                        <div class="botanical-divider" aria-hidden="true"><img src="/assets/botanical/sprig.webp" alt="" width="22" height="36"></div>
                        <button id="favorites-filter" class="filter" aria-pressed="false" disabled="disabled">glyph(name: "star") <span>"Favorites"</span><span id="favorite-count">"0"</span></button>
                        <div class="sidebar-note"><p>(EMOJI.len()) " text faces and symbols."<br>"No account needed."</p><img src="/assets/botanical/branch.webp" alt="" width="215" height="215" aria-hidden="true"></div>
                    </aside>
                    <main class="catalog-main">
                        <section class="intro" aria-labelledby="intro-heading">
                            <p class="eyebrow">"THE STUDIUM / CHATPENDIUM"</p>
                            <h1 id="intro-heading">"Chatpendium"</h1>
                            <p class="intro-description">"Text faces and symbols for FFXIV chat."</p>
                            <p class="intro-caption">"Find a face. Copy it into chat."</p>
                        </section>
                        <section id="library" aria-labelledby="library-heading">
                            <h2 id="library-heading" class="sr-only">"The expression library"</h2>
                            <div class="library-controls">
                                <div class="search-wrap">
                                    glyph(name: "magnifying-glass")
                                    <label class="sr-only" for="search">"Search expressions"</label>
                                    <input id="search" type="search" autocomplete="off" maxlength="120" placeholder="Search a feeling, a face, or a phrase…" aria-describedby="search-hint" disabled="disabled">
                                    <kbd aria-hidden="true">"/"</kbd>
                                </div>
                                <label class="ascii-toggle"><input id="ascii-only" type="checkbox" disabled="disabled">"ASCII only"</label>
                                <div class="view-toggle" role="group" aria-label="Expression view">
                                    <button type="button" data-view="grid" aria-pressed="true" disabled="disabled">glyph(name: "squares-four") <span>"Grid"</span></button>
                                    <button type="button" data-view="list" aria-pressed="false" disabled="disabled">glyph(name: "list") <span>"List"</span></button>
                                </div>
                            </div>
                            <p id="search-hint" class="sr-only">"Search names, moods, literal text, and aliases such as hello, happy, cat, or gg. Press slash to focus search; Escape clears it."</p>
                            <div class="results-toolbar"><p id="results-count" role="status" aria-live="polite">(EMOJI.len()) " expressions"</p></div>
                            <noscript><p class="notice">"You can select and copy any expression below. Enable JavaScript for search, favorites, view switching, and one-click copying."</p></noscript>
                            <div class="expression-grid" id="results" data-view="grid">
                                for emoji in EMOJI { expression(emoji: emoji) }
                            </div>
                            <div id="empty-state" class="empty-state" hidden="hidden">
                                <span class="empty-face" aria-hidden="true">"(._.)"</span>
                                <h3 id="empty-title">"No expressions found"</h3>
                                <p id="empty-description">"Try a different feeling or clear your filters."</p>
                                <button id="reset-filters" class="secondary-button">"Clear filters"</button>
                            </div>
                            <button id="show-more" class="show-more" hidden="hidden">"Show more expressions"</button>
                        </section>
                        <details class="compatibility">
                            <summary>"Chat compatibility help"</summary>
                            <p>"Faces use printable ASCII or symbols from a community-maintained FFXIV character list. Combinations have not been individually tested in the game client; spacing and glyph shapes can differ."</p>
                            <p>"Use ASCII only for the simplest options. Regular color emoji and game-specific private-use glyphs are excluded."</p>
                            <a href=(SYMBOL_SOURCE) target="_blank" rel="noopener noreferrer">"View the character source" glyph(name: "arrow-up-right")</a>
                        </details>
                    </main>
                </div>
                site_footer()
                <div id="toast" class="toast" role="status" aria-live="polite" hidden="hidden"></div>
                <dialog id="copy-dialog" aria-labelledby="copy-title">
                    <form method="dialog"><button class="dialog-close" aria-label="Close">glyph(name: "x")</button></form>
                    <h2 id="copy-title">"Copy your expression"</h2><p>"Your browser couldn't copy automatically. Select the text below and copy it."</p>
                    <label class="sr-only" for="manual-copy">"Expression to copy"</label><input id="manual-copy" readonly="readonly">
                    <form method="dialog"><button class="primary-button">"Done"</button></form>
                </dialog>
            </body>
        </html>
    }
}

#[component]
pub(crate) async fn favicon_links() -> Result {
    view! {
        <link rel="icon" href="/favicon.ico" type="image/x-icon" sizes="16x16 32x32 48x48 64x64">
        <link rel="icon" href="/assets/favicon.png" type="image/png" sizes="64x64">
    }
}

#[component]
pub(crate) async fn site_header(active: &'static str) -> Result {
    view! {
        <header class="site-header">
            <div class="header-inner">
                <a href="/" class="brand" aria-label="The Studium home">
                    <img class="brand-mark" src="/assets/botanical/sprig.webp" alt="" width="40" height="67" aria-hidden="true">
                    <span>"The Studium"<span class="brand-byline">"by yycholla"</span></span>
                </a>
                <nav aria-label="Main navigation">
                    <a href="/" class=(if active == "hub" { "nav-current" } else { "" }) aria-current=(if active == "hub" { Some("page") } else { None })>"All tools"</a>
                    <a href="/chatpendium" class=(if active == "chatpendium" { "nav-current" } else { "" }) aria-current=(if active == "chatpendium" { Some("page") } else { None })>"Chatpendium"</a>
                    <a id="account-link" href="/account" class=(if active == "account" { "nav-current" } else { "" }) aria-current=(if active == "account" { Some("page") } else { None })>"Account"</a>
                </nav>
                <span class="header-note">"An FFXIV companion."</span>
            </div>
        </header>
    }
}

#[component]
pub(crate) async fn site_footer() -> Result {
    view! {
        <footer class="site-footer container">
            <div><p>"Plain text, ready to paste. No plugins or account needed."</p><p class="footer-links"><a href="/">"The Studium"</a>" · "<a href="/privacy">"Privacy"</a>" · "<a href="/terms">"Terms"</a></p></div>
            <p>"An unofficial fan project by yycholla."<br>"FINAL FANTASY XIV is a trademark of Square Enix. Not affiliated with Square Enix."</p>
        </footer>
    }
}

#[component]
async fn expression(emoji: &'static Emoji) -> Result {
    view! {
        <article class="expression-card" data-id=(emoji.id) data-name=(emoji.name) data-category=(emoji.category) data-tags=(emoji.tags) data-text=(emoji.text) data-ascii=(if emoji.ascii() { "true" } else { "false" })>
            <button class="favorite-button" aria-label=(format!("Favorite {}", emoji.name)) aria-pressed="false" data-action="favorite" disabled="disabled">glyph(name: "star")</button>
            <div class="expression-text">(emoji.text)</div>
            <div class="card-bottom"><div><h3>(emoji.name)</h3><span class="expression-type">(category_name(emoji.category))</span></div><button class="copy-button" data-action="copy" aria-label=(format!("Copy {}", emoji.name)) disabled="disabled">glyph(name: "copy") <span>"Copy"</span></button></div>
        </article>
    }
}

/// Phosphor Light icons, served as a local, licensed SVG sprite.
#[component]
async fn glyph(name: &'static str) -> Result {
    view! {
        <svg class="icon" aria-hidden="true" focusable="false" viewBox="0 0 256 256"><"use" href=(format!("/assets/icons.svg#{name}"))></"use"></svg>
    }
}

fn category_icon(category: &str) -> &'static str {
    match category {
        "greetings" => "hand-waving",
        "happy" => "smiley",
        "love" => "heart",
        "sad" => "drop",
        "surprised" => "smiley-nervous",
        "playful" => "sparkle",
        _ => "shapes",
    }
}

fn category_name(category: &'static str) -> &'static str {
    CATEGORIES
        .iter()
        .find(|(id, _)| *id == category)
        .map_or(category, |(_, name)| *name)
}
