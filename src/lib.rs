pub use chatpendium_core::catalog;
mod account_pages;
mod field_notes;
mod pages;

use topcoat::{
    Result,
    router::{
        Router,
        content::{Css, Json},
        route,
    },
};

pub fn router() -> Router {
    Router::builder()
        .page(pages::home)
        .page(pages::chatpendium)
        .page(field_notes::field_notes)
        .page(account_pages::account)
        .page(account_pages::privacy)
        .page(account_pages::terms)
        .route(styles)
        .route(script)
        .route(account_script)
        .route(field_notes_script)
        .route(field_notes_styles)
        .route(favicon)
        .route(favicon_png)
        .route(icon_sprite)
        .route(botanical_sprig)
        .route(botanical_branch)
        .route(font_regular)
        .route(font_semibold)
        .route(catalog_json)
        .route(plugin_catalog)
        .route(health)
        .build()
}

#[route(GET "/assets/field-notes.js")]
async fn field_notes_script() -> Result<([(&'static str, &'static str); 1], &'static str)> {
    Ok((
        [("content-type", "text/javascript; charset=utf-8")],
        include_str!("../assets/field-notes.js"),
    ))
}

#[route(GET "/assets/field-notes.css")]
async fn field_notes_styles() -> Result<Css<&'static str>> {
    Ok(Css(include_str!("../assets/field-notes.css")))
}

#[route(GET "/assets/account.js")]
async fn account_script() -> Result<([(&'static str, &'static str); 1], &'static str)> {
    Ok((
        [("content-type", "text/javascript; charset=utf-8")],
        include_str!("../assets/account.js"),
    ))
}

#[route(GET "/assets/app.css")]
async fn styles() -> Result<Css<&'static str>> {
    Ok(Css(include_str!("../assets/app.css")))
}

#[route(GET "/assets/app.js")]
async fn script() -> Result<([(&'static str, &'static str); 1], &'static str)> {
    Ok((
        [("content-type", "text/javascript; charset=utf-8")],
        include_str!("../assets/app.js"),
    ))
}

#[route(GET "/api/emoji")]
async fn catalog_json() -> Result<Json<&'static [catalog::Emoji]>> {
    Ok(Json(catalog::EMOJI))
}

#[route(GET "/api/chatpendium/v1/catalog.json")]
async fn plugin_catalog() -> Result<Json<chatpendium_core::Catalog>> {
    Ok(Json(chatpendium_core::Catalog::bundled()))
}

#[route(GET "/healthz")]
async fn health() -> Result<&'static str> {
    Ok("ok")
}

#[route(GET "/assets/icons.svg")]
async fn icon_sprite() -> Result<([(&'static str, &'static str); 1], &'static [u8])> {
    Ok((
        [("content-type", "image/svg+xml")],
        include_bytes!("../assets/icons.svg"),
    ))
}

#[route(GET "/favicon.ico")]
async fn favicon() -> Result<([(&'static str, &'static str); 1], &'static [u8])> {
    Ok((
        [("content-type", "image/x-icon")],
        include_bytes!("../assets/favicon.ico"),
    ))
}

#[route(GET "/assets/favicon.png")]
async fn favicon_png() -> Result<([(&'static str, &'static str); 1], &'static [u8])> {
    Ok((
        [("content-type", "image/png")],
        include_bytes!("../assets/favicon.png"),
    ))
}

#[route(GET "/assets/botanical/sprig.webp")]
async fn botanical_sprig() -> Result<([(&'static str, &'static str); 1], &'static [u8])> {
    Ok((
        [("content-type", "image/webp")],
        include_bytes!("../assets/botanical/sprig.webp"),
    ))
}

#[route(GET "/assets/botanical/branch.webp")]
async fn botanical_branch() -> Result<([(&'static str, &'static str); 1], &'static [u8])> {
    Ok((
        [("content-type", "image/webp")],
        include_bytes!("../assets/botanical/branch.webp"),
    ))
}

#[route(GET "/assets/fonts/source-sans-3-400.ttf")]
async fn font_regular() -> Result<([(&'static str, &'static str); 1], &'static [u8])> {
    Ok((
        [("content-type", "font/ttf")],
        include_bytes!("../assets/fonts/source-sans-3-400.ttf"),
    ))
}

#[route(GET "/assets/fonts/source-sans-3-600.ttf")]
async fn font_semibold() -> Result<([(&'static str, &'static str); 1], &'static [u8])> {
    Ok((
        [("content-type", "font/ttf")],
        include_bytes!("../assets/fonts/source-sans-3-600.ttf"),
    ))
}
