use ffxiv_emoji::{catalog::EMOJI, router};
use topcoat::router::{Body, Request, StatusCode, to_bytes};

async fn get(path: &str) -> (StatusCode, String, String) {
    let response = router()
        .handle(Request::builder().uri(path).body(Body::empty()).unwrap())
        .await;
    let status = response.status();
    let content_type = response
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap()
        .to_owned();
    let body = to_bytes(response.into_body(), 1_000_000).await.unwrap();
    (
        status,
        content_type,
        String::from_utf8(body.to_vec()).unwrap(),
    )
}

#[tokio::test]
async fn page_renders_complete_catalog_without_javascript() {
    let (status, kind, html) = get("/chatpendium").await;
    assert_eq!(status, StatusCode::OK);
    assert!(kind.starts_with("text/html"));
    assert!(html.contains("Chatpendium · The Studium"));
    assert_eq!(
        html.matches("class=\"expression-card\"").count(),
        EMOJI.len()
    );
    assert!(
        html.contains("&lt;(^_^&lt;)"),
        "expressions must be escaped as text"
    );
    assert!(html.contains("<noscript>"));
}

#[tokio::test]
async fn hub_links_to_tool_without_loading_tool_javascript() {
    let (status, _, html) = get("/").await;
    assert_eq!(status, StatusCode::OK);
    assert!(html.contains("Little tools for life in Eorzea."));
    assert!(html.contains("href=\"/chatpendium\""));
    assert!(
        !html.contains("/assets/app.js"),
        "tool script must not run on the hub"
    );
}

#[tokio::test]
async fn catalog_api_preserves_exact_copy_text() {
    let (status, kind, json) = get("/api/emoji").await;
    assert_eq!(status, StatusCode::OK);
    assert!(kind.starts_with("application/json"));
    let entries: serde_json::Value = serde_json::from_str(&json).unwrap();
    let entries = entries.as_array().unwrap();
    assert_eq!(entries.len(), EMOJI.len());
    for (actual, expected) in entries.iter().zip(EMOJI) {
        assert_eq!(actual["id"], expected.id);
        assert_eq!(actual["text"], expected.text);
    }
}

#[tokio::test]
async fn plugin_catalog_is_versioned_and_matches_website() {
    let (status, kind, json) = get("/api/chatpendium/v1/catalog.json").await;
    assert_eq!(status, StatusCode::OK);
    assert!(kind.starts_with("application/json"));
    let catalog: chatpendium_core::Catalog = serde_json::from_str(&json).unwrap();
    catalog.validate().unwrap();
    assert_eq!(catalog.schema_version, 1);
    assert_eq!(catalog.entries.len(), EMOJI.len());
    for (actual, expected) in catalog.entries.iter().zip(EMOJI) {
        assert_eq!(actual.id, expected.id);
        assert_eq!(actual.text, expected.text);
    }
}

#[tokio::test]
async fn embedded_assets_have_browser_content_types() {
    for (path, kind, marker) in [
        ("/assets/app.css", "text/css", ".expression-grid"),
        ("/assets/app.js", "text/javascript", "navigator.clipboard"),
    ] {
        let (status, content_type, body) = get(path).await;
        assert_eq!(status, StatusCode::OK);
        assert!(content_type.starts_with(kind));
        assert!(body.contains(marker));
    }
    assert_eq!(get("/healthz").await.2, "ok");
}

#[tokio::test]
async fn unknown_paths_are_not_served_as_the_app() {
    let response = router()
        .handle(
            Request::builder()
                .uri("/missing")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn design_assets_are_embedded_with_their_binary_content_types() {
    for (path, kind, signature) in [
        (
            "/favicon.ico",
            "image/x-icon",
            b"\x00\x00\x01\x00".as_slice(),
        ),
        (
            "/assets/favicon.png",
            "image/png",
            b"\x89PNG\r\n\x1a\n".as_slice(),
        ),
        (
            "/assets/botanical/sprig.webp",
            "image/webp",
            b"RIFF".as_slice(),
        ),
        (
            "/assets/botanical/branch.webp",
            "image/webp",
            b"RIFF".as_slice(),
        ),
        (
            "/assets/fonts/source-sans-3-400.ttf",
            "font/ttf",
            b"\x00\x01\x00\x00".as_slice(),
        ),
        (
            "/assets/fonts/source-sans-3-600.ttf",
            "font/ttf",
            b"\x00\x01\x00\x00".as_slice(),
        ),
        ("/assets/icons.svg", "image/svg+xml", b"<svg".as_slice()),
    ] {
        let response = router()
            .handle(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await;
        assert_eq!(response.status(), StatusCode::OK, "{path}");
        assert_eq!(response.headers().get("content-type").unwrap(), kind);
        let bytes = to_bytes(response.into_body(), 1_000_000).await.unwrap();
        assert!(
            bytes.starts_with(signature),
            "{path} must return the original asset bytes"
        );
    }
}
