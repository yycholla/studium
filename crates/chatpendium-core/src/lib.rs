//! Shared, game-independent catalog and search used by the website and Dalamud adapter.
pub mod catalog;

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const MAX_REQUEST_BYTES: usize = 1_048_576;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub text: String,
    pub category: String,
    pub tags: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Catalog {
    pub schema_version: u32,
    pub entries: Vec<Entry>,
}

impl Catalog {
    pub fn bundled() -> Self {
        Self {
            schema_version: 1,
            entries: catalog::EMOJI
                .iter()
                .map(|e| Entry {
                    id: e.id.into(),
                    name: e.name.into(),
                    text: e.text.into(),
                    category: e.category.into(),
                    tags: e.tags.into(),
                })
                .collect(),
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err("Unsupported catalog schema; update Chatpendium.".into());
        }
        if self.entries.is_empty() || self.entries.len() > 4096 {
            return Err("Catalog must contain 1 to 4096 entries.".into());
        }
        let mut ids = HashSet::new();
        for entry in &self.entries {
            if entry.id.is_empty()
                || entry.id.len() > 64
                || !entry
                    .id
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
                || !ids.insert(&entry.id)
            {
                return Err("Catalog contains an invalid or duplicate ID.".into());
            }
            if !catalog::CATEGORIES
                .iter()
                .any(|(id, _)| *id == entry.category)
            {
                return Err("Catalog contains an unknown category.".into());
            }
            if entry.name.trim().is_empty()
                || entry.name.len() > 128
                || entry.tags.len() > 512
                || entry
                    .name
                    .chars()
                    .chain(entry.tags.chars())
                    .any(char::is_control)
            {
                return Err("Catalog contains invalid metadata.".into());
            }
            // Text is copied verbatim, so reject controls, newlines, PUA and unlisted glyphs.
            if entry.text.trim().is_empty()
                || entry.text.len() > 180
                || !entry.text.chars().all(|c| {
                    c == ' ' || c.is_ascii_graphic() || catalog::SUPPORTED_SYMBOLS.contains(c)
                })
            {
                return Err("Catalog contains unsupported chat text.".into());
            }
        }
        Ok(())
    }

    pub fn search(&self, filter: &Filter) -> Vec<Entry> {
        let query = filter.query.to_lowercase();
        let terms: Vec<_> = query.split_whitespace().collect();
        let favorites: HashSet<_> = filter.favorites.iter().map(String::as_str).collect();
        self.entries
            .iter()
            .filter(|e| {
                (filter.category.is_empty()
                    || filter.category == "all"
                    || filter.category == e.category)
                    && (!filter.ascii_only || e.text.is_ascii())
                    && (!filter.favorites_only || favorites.contains(e.id.as_str()))
                    && {
                        let haystack = format!("{} {} {} {}", e.name, e.text, e.category, e.tags)
                            .to_lowercase();
                        terms.iter().all(|term| haystack.contains(term))
                    }
            })
            .cloned()
            .collect()
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Filter {
    pub query: String,
    pub category: String,
    pub ascii_only: bool,
    pub favorites_only: bool,
    pub favorites: Vec<String>,
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
enum Request {
    Catalog,
    Validate {
        catalog: Catalog,
    },
    Search {
        catalog: Catalog,
        #[serde(default)]
        filter: Filter,
    },
}

/// A versioned JSON boundary keeps Rust types and allocators out of the .NET ABI.
pub fn execute(input: &[u8]) -> Result<serde_json::Value, String> {
    if input.len() > MAX_REQUEST_BYTES {
        return Err("Request is too large.".into());
    }
    let request: Request =
        serde_json::from_slice(input).map_err(|_| "Invalid request JSON.".to_string())?;
    match request {
        Request::Catalog => serde_json::to_value(Catalog::bundled()).map_err(|e| e.to_string()),
        Request::Validate { catalog } => {
            catalog.validate()?;
            serde_json::to_value(catalog).map_err(|e| e.to_string())
        }
        Request::Search { catalog, filter } => {
            catalog.validate()?;
            if filter.query.len() > 1024 || filter.favorites.len() > 4096 {
                return Err("Search input is too large.".into());
            }
            Ok(serde_json::json!({
                "entries": catalog.search(&filter),
                "categories": catalog::CATEGORIES.iter().map(|(id, name)| serde_json::json!({"id": id, "name": name})).collect::<Vec<_>>()
            }))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_catalog_round_trips_without_changing_text() {
        let bundled = Catalog::bundled();
        bundled.validate().unwrap();
        let decoded: Catalog =
            serde_json::from_slice(&serde_json::to_vec(&bundled).unwrap()).unwrap();
        assert_eq!(bundled.entries, decoded.entries);
    }

    #[test]
    fn searches_words_symbols_and_combined_filters() {
        let catalog = Catalog::bundled();
        let result = catalog.search(&Filter {
            query: "CAT cute".into(),
            ..Default::default()
        });
        assert!(result.iter().any(|e| e.id == "cat"));
        assert!(
            result
                .iter()
                .all(|e| e.tags.contains("cat") && e.tags.contains("cute"))
        );
        let filter = Filter {
            query: "♥".into(),
            favorites_only: true,
            favorites: vec!["heart".into(), "missing".into()],
            ..Default::default()
        };
        assert_eq!(catalog.search(&filter)[0].text, "♥");
        assert!(
            catalog
                .search(&Filter {
                    ascii_only: true,
                    ..filter
                })
                .is_empty()
        );
        assert!(
            catalog
                .search(&Filter {
                    category: "invalid".into(),
                    ..Default::default()
                })
                .is_empty()
        );
    }

    #[test]
    fn refuses_incompatible_or_unsafe_catalogs() {
        for text in [
            "hello\n/p test",
            "\0",
            "\u{e000}",
            "😀",
            "e\u{301}",
            "\t",
            "   ",
        ] {
            let mut c = Catalog::bundled();
            c.entries[0].text = text.into();
            assert!(c.validate().is_err(), "accepted {text:?}");
        }
        let mut c = Catalog::bundled();
        c.schema_version = 2;
        assert!(c.validate().is_err());
        let mut c = Catalog::bundled();
        c.entries.push(c.entries[0].clone());
        assert!(c.validate().is_err());
        let mut c = Catalog::bundled();
        c.entries[0].category = "other".into();
        assert!(c.validate().is_err());
    }

    #[test]
    fn rejects_bad_requests_and_preserves_search_results_over_json() {
        for input in [b"{".as_slice(), b"{\"op\":\"unknown\"}"] {
            assert!(execute(input).is_err());
        }
        assert!(execute(&vec![b' '; MAX_REQUEST_BYTES + 1]).is_err());
        let request = serde_json::json!({"op":"search", "catalog":Catalog::bundled(), "filter":{"query":"♥"}});
        let response = execute(&serde_json::to_vec(&request).unwrap()).unwrap();
        assert!(
            response["entries"]
                .as_array()
                .unwrap()
                .iter()
                .any(|e| e["text"] == "♥")
        );
        assert_eq!(
            response["categories"].as_array().unwrap().len(),
            catalog::CATEGORIES.len()
        );
    }
}
