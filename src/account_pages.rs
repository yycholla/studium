use topcoat::{Result, router::page, view::view};

#[page("/account")]
pub async fn account() -> Result {
    view! {
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="robots" content="noindex">
                <title>"Your account · The Studium"</title>
                crate::pages::favicon_links()
                <link rel="stylesheet" href="/assets/app.css">
                <script src="/assets/account.js" defer="defer"></script>
            </head>
            <body>
                <a class="skip-link" href="#account">"Skip to account"</a>
                crate::pages::site_header(active: "account")
                <main id="account" class="container account-main">
                    <p class="eyebrow">"YOUR PLACE IN THE STUDIUM"</p>
                    <h1>"One account. Your characters."</h1>
                    <p class="intro-description">"Sign in with XIVAuth and choose which verified characters to share with The Studium."</p>
                    <p id="account-status" class="account-status" role="status" aria-live="polite">"Checking sign-in…"</p>
                    <noscript><p class="notice">"Enable JavaScript to sign in and manage your characters. Chatpendium remains available without an account."</p></noscript>
                    <section id="account-signed-out" class="account-panel" hidden="hidden" aria-labelledby="signin-title">
                        <h2 id="signin-title">"Welcome to your Studium"</h2>
                        <p>"XIVAuth handles sign-in and character verification. You decide which characters Studium can see."</p>
                        <a class="primary-button account-action" href="/auth/login">"Continue with XIVAuth ↗"</a>
                        <p class="account-small">"By continuing, you agree to the "<a href="/terms">"terms"</a>" and can review our "<a href="/privacy">"privacy policy"</a>". No Square Enix password is requested by Studium."</p>
                    </section>
                    <section id="account-signed-in" class="account-panel" hidden="hidden" aria-labelledby="characters-title">
                        <p id="account-greeting"></p>
                        <h2 id="characters-title">"Your linked characters"</h2>
                        <p>"Choose the character to use across Studium. Field Notes uses this character to sync public collections from FFXIV Collect; it does not read your inventory."</p>
                        <div id="account-characters" class="account-characters"></div>
                        <p id="account-no-characters" hidden="hidden">"No verified characters were shared. Add and verify a character in XIVAuth, then choose Refresh characters."</p>
                        <p id="account-updated" class="account-small"></p>
                        <div class="account-actions">
                            <a class="primary-button account-action" href="/auth/login">"Refresh characters"</a>
                            <a class="secondary-button account-action" href="https://xivauth.net/characters" target="_blank" rel="noopener noreferrer">"Manage in XIVAuth ↗"</a>
                            <button id="account-logout" class="secondary-button" type="button">"Sign out"</button>
                        </div>
                        <details class="account-remove">
                            <summary>"Remove your Studium account"</summary>
                            <p>"This deletes your stored profile, linked characters, collection snapshots, wishlists, notes, group memberships, groups you own, and all Studium sign-in sessions. Your XIVAuth account and browser-saved Chatpendium favorites remain yours."</p>
                            <button id="account-delete" class="secondary-button" type="button">"Remove my account"</button>
                        </details>
                    </section>
                    <p class="account-small"><a href="/groups">"Open collection groups or review a pending invitation ↗"</a></p>
                    <p class="account-small">"Just here for an expression? "<a href="/chatpendium">"Chatpendium is open to everyone."</a></p>
                </main>
                crate::pages::site_footer()
            </body>
        </html>
    }
}

#[page("/privacy")]
pub async fn privacy() -> Result {
    view! {
        <!DOCTYPE html>
        <html lang="en">
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>"Privacy · The Studium"</title>crate::pages::favicon_links()<link rel="stylesheet" href="/assets/app.css"><script src="/assets/account.js" defer="defer"></script></head>
            <body>
                crate::pages::site_header(active: "")
                <main class="container policy-main">
                    <p class="eyebrow">"THE STUDIUM"</p><h1>"Privacy"</h1><p>"Updated October 10, 2026."</p>
                    <h2>"What we store"</h2>
                    <p>"When you sign in, Studium stores your XIVAuth user ID and display name, the verified characters you authorize, your selected character, and when the information was refreshed. Character records include the XIVAuth persistent key, Lodestone ID, name, home world, data center, verification date, and avatar and portrait URLs. We use these records to recognize your account and provide character selection."</p>
                    <p>"Studium does not request your email address, linked social accounts, Square Enix password, inventory, or chat history. XIVAuth access tokens are used on the server during sign-in, then discarded; they are not stored in your browser or our database."</p>
                    <p>"When you use Field Notes, we store public collection IDs and visibility, source and check timestamps, and the wishlist goals and notes you save for each character. These records are private unless you explicitly share collection progress or wishlist goals with a collection group. Personal notes always remain private. We do not store private collection IDs returned by a provider."</p>
                    <p>"Collection groups store their name, type, owner, memberships, chosen characters, sharing choices, and hashed invitation tokens. Members can see each other’s chosen character name and world, and only the progress or wishlist goals each member chooses to share. Invite previews show the group name, type, and expiry, never its roster. Leaving or disabling sharing stops future access; information already viewed cannot be recalled."</p>
                    <h2>"Cookies and local storage"</h2>
                    <p>"Essential cookies protect the sign-in flow and keep you signed in. Sign-in requests expire after ten minutes and sessions after eight hours. Chatpendium favorites and your grid/list view preference are stored separately in this browser and do not sync with your account. Pending group invitations are kept in this tab’s session storage until joined, dismissed, or signed out; invite tokens are removed from the address bar and are never included in page requests."</p>
                    <h2>"Services involved"</h2>
                    <p>"Cloudflare hosts the website and account database and processes network requests. XIVAuth provides authentication and the character information you choose to share, under its own "<a href="https://xivauth.net/legal/privacy">"privacy policy"</a>". These providers may process request metadata under their own policies. Character portraits load directly from Square Enix’s image servers without sending a page referrer. Studium does not add advertising or analytics trackers."</p>
                    <p>"Field Notes asks your browser to read the selected character’s public Lodestone collections from FFXIV Collect, without sending Studium cookies or XIVAuth tokens. FFXIV Collect receives the public character ID and normal browser request metadata. The browser sends only the supported collection fields to Studium to update your private journal. Collectible icons also load directly from FFXIV Collect without a page referrer. Its "<a href="https://ffxivcollect.com/faq">"FAQ and privacy policy"</a>" describe that service."</p>
                    <h2>"Your choices"</h2>
                    <p>"Use the tools without signing in, change shared characters through XIVAuth, or refresh the linked characters from your account page. Removing your Studium account deletes its profile, characters, sessions, collection snapshots, wishlists, notes, group memberships, and groups you own from the active database. Hosting-provider backups may retain deleted data according to their retention policies. Signing out ends this browser's session; it does not sign you out of XIVAuth."</p>
                    <p>"Profile, character, and collection records remain until you remove your account; goals and notes can also be removed individually. Removing a shared character in XIVAuth and refreshing your linked characters prevents access to its journal; its stored goals remain available if you link it again. Expired sessions and unfinished sign-in requests are deleted during subsequent sign-ins. Character identity is a snapshot from your last sign-in. Field Notes checks collections when you open its page, switch characters, and periodically while the page is open, with at most one successful check per hour. Private or missing profiles clear saved collection snapshots; temporary service failures retain the last successful snapshot."</p>
                    <p>"Persistent groups remain until their owner deletes them. Temporary parties expire after 24 hours and become inaccessible; expired party records are deleted on subsequent group activity. Removing your account deletes groups you own and your other memberships. Invitation links expire after seven days or when a party expires, whichever comes first. Owners can replace invitations; removing a member also revokes the current invitation."</p>
                    <h2>"Contact"</h2>
                    <p>"For questions, contact yycholla through the "<a href="https://github.com/yycholla/studium">"Studium GitHub repository"</a>". Do not post passwords, tokens, or other private information in public issues."</p>
                </main>
                crate::pages::site_footer()
            </body>
        </html>
    }
}

#[page("/terms")]
pub async fn terms() -> Result {
    view! {
        <!DOCTYPE html>
        <html lang="en">
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>"Terms · The Studium"</title>crate::pages::favicon_links()<link rel="stylesheet" href="/assets/app.css"><script src="/assets/account.js" defer="defer"></script></head>
            <body>
                crate::pages::site_header(active: "")
                <main class="container policy-main">
                    <p class="eyebrow">"THE STUDIUM"</p><h1>"Terms of use"</h1><p>"Updated October 10, 2026."</p>
                    <h2>"A community project"</h2>
                    <p>"The Studium is a free, unofficial FFXIV companion project maintained by yycholla. It is not affiliated with or endorsed by Square Enix. FINAL FANTASY XIV and related marks belong to Square Enix."</p>
                    <h2>"Using the service"</h2>
                    <p>"Use the service respectfully. Do not impersonate other players, attempt to access another user's account, or disrupt the service. Only link characters that XIVAuth verifies for your account."</p>
                    <h2>"Information and availability"</h2>
                    <p>"Tools and community data may be incomplete, outdated, or temporarily unavailable. Check important information in game. Features may change as the project develops."</p>
                    <h2>"Accounts and connected services"</h2>
                    <p>"Signing in is optional. XIVAuth manages authentication under its own terms. You can remove your Studium account from the account page. The "<a href="/privacy">"privacy policy"</a>" describes the information Studium stores and how to remove it."</p>
                    <h2>"Contact and changes"</h2>
                    <p>"Questions and feedback can be sent through the "<a href="https://github.com/yycholla/studium">"Studium repository"</a>". Changes to these terms will be posted here with an updated date."</p>
                </main>
                crate::pages::site_footer()
            </body>
        </html>
    }
}
