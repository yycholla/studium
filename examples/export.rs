//! Render the same Topcoat routes as static files for preview or static hosting.
use std::{fs, path::PathBuf};
use topcoat::router::{Body, Request, StatusCode, to_bytes};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let output = PathBuf::from(std::env::args_os().nth(1).unwrap_or_else(|| "dist".into()));
    let router = ffxiv_emoji::router();
    for (route, file) in [
        ("/", "index.html"),
        ("/chatpendium", "chatpendium/index.html"),
        ("/field-notes", "field-notes/index.html"),
        ("/groups", "groups/index.html"),
        ("/assets/groups.js", "assets/groups.js"),
        ("/assets/group-planner.js", "assets/group-planner.js"),
        ("/assets/groups.css", "assets/groups.css"),
        ("/assets/field-notes.js", "assets/field-notes.js"),
        ("/assets/field-notes.css", "assets/field-notes.css"),
        ("/account", "account/index.html"),
        ("/privacy", "privacy/index.html"),
        ("/terms", "terms/index.html"),
        ("/favicon.ico", "favicon.ico"),
        ("/assets/favicon.png", "assets/favicon.png"),
        ("/assets/app.css", "assets/app.css"),
        ("/assets/app.js", "assets/app.js"),
        ("/assets/account.js", "assets/account.js"),
        ("/assets/icons.svg", "assets/icons.svg"),
        (
            "/assets/botanical/sprig.webp",
            "assets/botanical/sprig.webp",
        ),
        (
            "/assets/botanical/branch.webp",
            "assets/botanical/branch.webp",
        ),
        (
            "/assets/fonts/source-sans-3-400.ttf",
            "assets/fonts/source-sans-3-400.ttf",
        ),
        (
            "/assets/fonts/source-sans-3-600.ttf",
            "assets/fonts/source-sans-3-600.ttf",
        ),
        ("/api/emoji", "api/emoji.json"),
        (
            "/api/chatpendium/v1/catalog.json",
            "api/chatpendium/v1/catalog.json",
        ),
        ("/healthz", "healthz"),
    ] {
        let response = router
            .handle(Request::builder().uri(route).body(Body::empty())?)
            .await;
        if response.status() != StatusCode::OK {
            return Err(format!("rendering {route} failed: {}", response.status()).into());
        }
        let body = to_bytes(response.into_body(), 1_000_000).await?;
        let destination = output.join(file);
        fs::create_dir_all(destination.parent().unwrap())?;
        fs::write(destination, body)?;
    }
    println!("Rendered Topcoat application to {}", output.display());
    Ok(())
}
