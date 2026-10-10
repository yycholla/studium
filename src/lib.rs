pub use chatpendium_core::catalog;
mod account_pages;
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
        .page(account_pages::account)
        .page(account_pages::privacy)
        .page(account_pages::terms)
        .route(styles)
        .route(script)
        .route(account_script)
        .route(catalog_json)
        .route(plugin_catalog)
        .route(health)
        .build()
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
