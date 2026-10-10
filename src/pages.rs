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
                <meta name="theme-color" content="#15191f">
                <meta name="description" content="The Studium: little tools for life in Eorzea. Explore a growing collection of FFXIV companion tools, starting with Chatpendium.">
                <title>"The Studium · Little tools for life in Eorzea"</title>
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
                        <p class="intro-description">"Welcome to The Studium. A growing collection of thoughtful tools for the small things that make your adventures your own."</p>
                    </section>
                    <section id="tools" aria-labelledby="tools-heading">
                        <div class="section-heading"><h2 id="tools-heading">"Explore the collection"</h2><span class="section-meta">"Made by yycholla"</span></div>
                        <a class="tool-card" href="/chatpendium" aria-labelledby="chatpendium-title" aria-describedby="chatpendium-description">
                            <div class="tool-illustration" aria-hidden="true"><span>"(^ω^)"</span><span>"(^_^)/"</span><span>"♡"</span></div>
                            <div class="tool-description">
                                <p class="eyebrow">"CHAT & EXPRESSION"</p>
                                <h3 id="chatpendium-title">"Chatpendium"</h3>
                                <p id="chatpendium-description">"A little more you in every message. Find text faces and symbols, keep your favorites, and copy them straight into FFXIV chat."</p>
                                <div class="tool-card-bottom"><span>(EMOJI.len()) " expressions · No account needed"</span><span class="tool-open">"Open Chatpendium ↗"</span></div>
                            </div>
                        </a>
                    </section>
                    <p class="hub-note">"The collection begins here. More tools will find their home in The Studium."</p>
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
                <meta name="theme-color" content="#15191f">
                <meta name="description" content="Find your next FFXIV chat expression. Search text faces and symbols, save your favorites, and copy them into Eorzea.">
                <title>"Chatpendium · The Studium"</title>
                <link rel="stylesheet" href="/assets/app.css">
                <script src="/assets/app.js" defer="defer"></script>
                <script src="/assets/account.js" defer="defer"></script>
            </head>
            <body>
                <a class="skip-link" href="#library">"Skip to expressions"</a>
                site_header(active: "chatpendium")
                <main class="container">
                    <section class="intro" aria-labelledby="intro-heading">
                        <div>
                            <p class="eyebrow"><span aria-hidden="true">"✦"</span> " THE STUDIUM / CHAT & EXPRESSION"</p>
                            <h1 id="intro-heading">"Chatpendium"</h1>
                            <p class="intro-description">"From your first hello to your next party clear. Find text faces and symbols for a little more you in FFXIV chat."</p>
                            <p class="intro-caption">"Find an expression. Copy it. Make someone's day."</p>
                        </div>
                        <div class="intro-art" aria-hidden="true">
                            <span class="orbit orbit-one"></span><span class="orbit orbit-two"></span>
                            <span class="art-star star-one">"✧"</span><span class="art-star star-two">"✦"</span>
                            <div class="floating-expression expression-back">"(^ω^)"</div>
                            <div class="floating-expression expression-front">"(^_^)/"<span>"a little hello goes a long way"</span></div>
                            <div class="floating-expression expression-small">"♥"</div>
                        </div>
                    </section>
                    <section id="library" aria-labelledby="library-heading">
                        <div class="section-heading">
                            <h2 id="library-heading">"The expression library"</h2>
                            <span class="section-meta">(EMOJI.len()) " little ways to connect"</span>
                        </div>
                        <div class="search-wrap">
                            <span class="search-icon" aria-hidden="true"></span>
                            <label class="sr-only" for="search">"Search expressions"</label>
                            <input id="search" type="search" autocomplete="off" maxlength="120" placeholder="Search a feeling, a face, or a phrase…" aria-describedby="search-hint" disabled="disabled">
                            <kbd aria-hidden="true">"/"</kbd>
                        </div>
                        <p id="search-hint" class="search-hint">"Try "<button type="button" data-query="hello" disabled="disabled">"hello"</button>", "<button type="button" data-query="happy" disabled="disabled">"happy"</button>", "<button type="button" data-query="cat" disabled="disabled">"cat"</button>" or "<button type="button" data-query="gg" disabled="disabled">"gg"</button>". Search includes names, moods, and chat phrases."</p>
                        <div class="library-layout">
                            <div class="library-main">
                                <div class="filters" role="group" aria-label="Expression categories">
                                    <button class="filter" data-category="all" aria-pressed="true" disabled="disabled">"All expressions"</button>
                                    for (id, name) in CATEGORIES {
                                        <button class="filter" data-category=(*id) aria-pressed="false" disabled="disabled">(*name)</button>
                                    }
                                </div>
                                <div class="results-toolbar">
                                    <p id="results-count" role="status" aria-live="polite">(EMOJI.len()) " expressions"</p>
                                    <div class="toolbar-options">
                                        <label class="ascii-toggle"><input id="ascii-only" type="checkbox" disabled="disabled">"ASCII only"</label>
                                        <button id="favorites-filter" aria-pressed="false" disabled="disabled"><span aria-hidden="true">"☆"</span> " Favorites "<span id="favorite-count">"0"</span></button>
                                    </div>
                                </div>
                                <noscript><p class="notice">"You can select and copy any expression below. Enable JavaScript for search, favorites, and one-click copying."</p></noscript>
                                <div class="expression-grid" id="results">
                                    for emoji in EMOJI { expression(emoji: emoji) }
                                </div>
                                <div id="empty-state" class="empty-state" hidden="hidden">
                                    <span class="empty-face" aria-hidden="true">"(._.)"</span>
                                    <h3 id="empty-title">"No expressions found"</h3>
                                    <p id="empty-description">"Try a different feeling or clear your filters."</p>
                                    <button id="reset-filters" class="secondary-button">"Clear filters"</button>
                                </div>
                                <button id="show-more" class="show-more" hidden="hidden">"Show more expressions"</button>
                                <p class="library-footnote">"Plain text, ready to paste. No plugins or account needed."</p>
                            </div>
                            <aside class="preview-column" aria-label="Chat preview and tips">
                                <section class="preview-panel" aria-labelledby="preview-heading">
                                    <div class="panel-heading"><h3 id="preview-heading">"A peek in chat"</h3><span class="tiny-label">"PREVIEW"</span></div>
                                    <div class="chat-window">
                                        <div class="chat-tabs"><span>"Party"</span><span>"General"</span><span class="chat-menu" aria-hidden="true">"···"</span></div>
                                        <p class="chat-line"><span class="chat-time">"12:34"</span> <span class="chat-name">"You"</span> <span id="preview-text">"(^_^)/"</span></p>
                                        <div class="chat-input" aria-hidden="true"><span>"Party"</span><span class="cursor"></span></div>
                                    </div>
                                    <div class="preview-details"><p id="preview-name">"Hello there"</p><span id="preview-kind">"ASCII expression"</span></div>
                                    <button id="copy-preview" class="primary-button" data-text="(^_^)/" disabled="disabled">"Copy expression" <span aria-hidden="true">"↗"</span></button>
                                    <p class="preview-note">"A browser preview. Spacing and glyph shapes can differ in game."</p>
                                </section>
                                <section id="guide" class="guide-panel" aria-labelledby="guide-heading">
                                    <span class="eyebrow">"A QUICK REMINDER"</span>
                                    <h3 id="guide-heading">"Bring it to Eorzea."</h3>
                                    <ol><li>"Pick an expression and hit Copy."</li><li>"Open your FFXIV chat box."</li><li>"Paste, then send when you're ready."</li></ol>
                                    <div class="keyboard-tip"><kbd>"Ctrl"</kbd><span>"+"</span><kbd>"V"</kbd><span>"to paste on Windows"</span></div>
                                </section>
                                <details class="compatibility">
                                    <summary>"About chat compatibility"</summary>
                                    <p>"Faces use printable ASCII or symbols from a community-maintained FFXIV character list. Combinations have not been individually tested in the game client."</p>
                                    <p>"Use ASCII only for the simplest options. Regular color emoji and game-specific private-use glyphs are excluded."</p>
                                    <a href=(SYMBOL_SOURCE) target="_blank" rel="noopener noreferrer">"View the character source ↗"</a>
                                </details>
                            </aside>
                        </div>
                    </section>
                </main>
                site_footer()
                <div id="toast" class="toast" role="status" aria-live="polite" hidden="hidden"></div>
                <dialog id="copy-dialog" aria-labelledby="copy-title">
                    <form method="dialog"><button class="dialog-close" aria-label="Close">"×"</button></form>
                    <h2 id="copy-title">"Copy your expression"</h2><p>"Your browser couldn't copy automatically. Select the text below and copy it."</p>
                    <label class="sr-only" for="manual-copy">"Expression to copy"</label><input id="manual-copy" readonly="readonly">
                    <form method="dialog"><button class="primary-button">"Done"</button></form>
                </dialog>
            </body>
        </html>
    }
}

#[component]
pub(crate) async fn site_header(active: &'static str) -> Result {
    view! {
        <header class="site-header">
            <div class="header-inner">
                <a href="/" class="brand" aria-label="The Studium home">
                    <span class="brand-mark" aria-hidden="true">"XIV"</span>
                    <span>"The Studium"<span class="brand-byline">"by yycholla"</span></span>
                </a>
                <nav aria-label="Main navigation">
                    <a href="/" class=(if active == "hub" { "nav-current" } else { "" }) aria-current=(if active == "hub" { Some("page") } else { None })>"All tools"</a>
                    <a href="/chatpendium" class=(if active == "chatpendium" { "nav-current" } else { "" }) aria-current=(if active == "chatpendium" { Some("page") } else { None })>"Chatpendium"</a>
                    <a id="account-link" href="/account" class=(if active == "account" { "nav-current" } else { "" }) aria-current=(if active == "account" { Some("page") } else { None })>"Account"</a>
                </nav>
                <span class="header-note">"A companion for Eorzea"</span>
            </div>
        </header>
    }
}

#[component]
pub(crate) async fn site_footer() -> Result {
    view! {
        <footer class="site-footer container">
            <div><a href="/" class="footer-brand">"The Studium"</a><p>"Little tools for life in Eorzea."</p><p><a href="/privacy">"Privacy"</a>" · "<a href="/terms">"Terms"</a></p></div>
            <p>"An unofficial fan project by yycholla."<br>"FINAL FANTASY XIV is a trademark of Square Enix. Not affiliated with Square Enix."</p>
        </footer>
    }
}

#[component]
async fn expression(emoji: &'static Emoji) -> Result {
    view! {
        <article class="expression-card" data-id=(emoji.id) data-name=(emoji.name) data-category=(emoji.category) data-tags=(emoji.tags) data-text=(emoji.text) data-ascii=(if emoji.ascii() { "true" } else { "false" })>
            <button class="favorite-button" aria-label=(format!("Favorite {}", emoji.name)) aria-pressed="false" data-action="favorite" disabled="disabled">"☆"</button>
            <div class="expression-text">(emoji.text)</div>
            <div class="card-bottom"><div><h3>(emoji.name)</h3><span class="expression-type">(if emoji.ascii() { "ASCII" } else { "Text symbol" })</span></div><button class="copy-button" data-action="copy" aria-label=(format!("Copy {}", emoji.name)) disabled="disabled">"Copy"</button></div>
        </article>
    }
}
