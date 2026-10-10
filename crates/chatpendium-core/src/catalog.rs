use serde::Serialize;

/// The Unicode inventory is community documented, not an in-game test report.
pub const SYMBOL_SOURCE: &str =
    "https://na.finalfantasyxiv.com/lodestone/character/12444232/blog/5384056/";
pub const SUPPORTED_SYMBOLS: &str = "ωψ↑↓→←⇔⇒♂♀♪±＜＞≥≤≡÷♥♡★☆◆◇♦♣♠♤♧∩∀°∇ΘΦΩδ∂∃∈∋∑√∝∞∠∟∥∪∨∧∫∮∬∴∵∽≒≠≦≧⊂⊃⊆⊇⊥⊿⌒─━│┃┗┓└┏┐┌┘┛├┤┬┳┴┻╋╳╲╱☁☂☀☃♭♯✓●◎○■□▲△▼▽…￣＾";

#[derive(Debug, Serialize)]
pub struct Emoji {
    pub id: &'static str,
    pub name: &'static str,
    pub text: &'static str,
    pub category: &'static str,
    pub tags: &'static str,
}

impl Emoji {
    pub fn ascii(&self) -> bool {
        self.text.is_ascii()
    }
}

pub const CATEGORIES: &[(&str, &str)] = &[
    ("greetings", "Greetings"),
    ("happy", "Happy"),
    ("love", "Love"),
    ("sad", "Sad"),
    ("surprised", "Surprised"),
    ("playful", "Playful"),
    ("symbols", "Symbols"),
];

macro_rules! emoji {
    ($id:literal, $name:literal, $text:literal, $category:literal, $tags:literal) => {
        Emoji {
            id: $id,
            name: $name,
            text: $text,
            category: $category,
            tags: $tags,
        }
    };
}

pub const EMOJI: &[Emoji] = &[
    emoji!(
        "wave",
        "Hello there",
        "(^_^)/",
        "greetings",
        "hello hi wave hey greeting o/ lali ho"
    ),
    emoji!(
        "joy",
        "Little joy",
        "(^ω^)",
        "happy",
        "happy smile cute cat excited"
    ),
    emoji!(
        "heart",
        "A little love",
        "♥",
        "love",
        "heart love thanks thank you healer"
    ),
    emoji!(
        "cheer",
        "You did it!",
        "\\(^o^)/",
        "happy",
        "cheer yay clear gg congratulations victory"
    ),
    emoji!(
        "cat",
        "Catlike curiosity",
        "(=^ω^=)",
        "playful",
        "cat cute miqote miqo'te kitty meow"
    ),
    emoji!(
        "tear",
        "A single tear",
        "(T_T)",
        "sad",
        "cry sad tears wipe rip"
    ),
    emoji!(
        "salute",
        "Reporting for duty",
        "o7",
        "greetings",
        "salute hello goodbye duty tank"
    ),
    emoji!(
        "star",
        "Gold star",
        "★",
        "symbols",
        "star favorite favourite commendation"
    ),
    emoji!(
        "hug",
        "Hugs for you",
        "(>^_^)> <(^_^<)",
        "love",
        "hug love comfort friend together"
    ),
    emoji!(
        "surprise",
        "Wait, what?",
        "(O_O)",
        "surprised",
        "shock surprise what wow mechanic"
    ),
    emoji!(
        "smile",
        "Warm welcome",
        "(^_^)",
        "happy",
        "smile happy thanks welcome sprout"
    ),
    emoji!(
        "sleep",
        "Away for a moment",
        "(-_-) zZ",
        "playful",
        "sleep tired afk brb sleepy"
    ),
    emoji!(
        "hello",
        "A quick hello",
        "o/",
        "greetings",
        "hello hi wave hey party greeting"
    ),
    emoji!(
        "bye",
        "Until next time",
        "(^_^)/~",
        "greetings",
        "bye goodbye see you wave"
    ),
    emoji!(
        "bow",
        "Much appreciated",
        "m(_ _)m",
        "greetings",
        "bow sorry thank you thanks respect"
    ),
    emoji!(
        "welcome",
        "Welcome, friend",
        "\\(^_^)/",
        "greetings",
        "welcome hug hello hi sprout"
    ),
    emoji!(
        "grin",
        "Big grin",
        "(^o^)",
        "happy",
        "happy laugh smile grin"
    ),
    emoji!(
        "glee",
        "Full of glee",
        "(*^_^*)",
        "happy",
        "happy blush smile shy"
    ),
    emoji!(
        "content",
        "Feeling content",
        "(∩_∩)",
        "happy",
        "content pleased happy smile"
    ),
    emoji!(
        "excited",
        "Ready to go",
        "(>ω<)",
        "happy",
        "excited happy yay cute"
    ),
    emoji!(
        "sparkle",
        "A stellar mood",
        "☆(^_^)☆",
        "happy",
        "sparkle star happy clear"
    ),
    emoji!(
        "laugh",
        "Can't stop laughing",
        "(^∀^)",
        "happy",
        "laugh lol lmao happy funny"
    ),
    emoji!(
        "open-heart",
        "With love",
        "♡",
        "love",
        "heart love affection thank you"
    ),
    emoji!(
        "blush",
        "A little bashful",
        "(*^ω^*)",
        "love",
        "blush shy love cute"
    ),
    emoji!(
        "hearts",
        "Love, love, love",
        "♥ ♡ ♥",
        "love",
        "hearts love thanks affection"
    ),
    emoji!("kiss", "A tiny kiss", "(^3^)", "love", "kiss love mwah"),
    emoji!(
        "heart-eyes",
        "You have my heart",
        "(♥_♥)",
        "love",
        "love heart eyes adore"
    ),
    emoji!(
        "sob",
        "Having a moment",
        "(;_;)",
        "sad",
        "cry sob sad tears wipe"
    ),
    emoji!(
        "down",
        "Downcast",
        "(._.)",
        "sad",
        "sad sorry down embarrassed"
    ),
    emoji!(
        "sigh",
        "One of those days",
        "(-_-)",
        "sad",
        "sigh tired sad disappointed bored"
    ),
    emoji!(
        "cry",
        "Let it all out",
        "(TωT)",
        "sad",
        "cry tears sad comfort"
    ),
    emoji!(
        "dead",
        "Floor tank",
        "(x_x)",
        "sad",
        "dead rip wipe floor tank ko"
    ),
    emoji!(
        "sweat",
        "That was close",
        "(^_^;)",
        "surprised",
        "sweat nervous awkward close panic"
    ),
    emoji!(
        "wide",
        "Eyes wide open",
        "(°o°)",
        "surprised",
        "wow shock surprise amazed"
    ),
    emoji!(
        "confused",
        "Lost in the mechanics",
        "(?_?)",
        "surprised",
        "confused what mechanic question help"
    ),
    emoji!(
        "huh",
        "Come again?",
        "(o_O)",
        "surprised",
        "huh confused what really"
    ),
    emoji!(
        "gasp",
        "The plot thickens",
        "(O_o)!",
        "surprised",
        "gasp shock surprise story"
    ),
    emoji!(
        "wink",
        "Just between us",
        "(^_~)",
        "playful",
        "wink secret playful"
    ),
    emoji!(
        "tongue",
        "Only kidding",
        "(^p^)",
        "playful",
        "tongue silly joking kidding"
    ),
    emoji!(
        "dance",
        "Victory dance",
        "<(^_^<) (>^_^)>",
        "playful",
        "dance victory clear celebrate gg"
    ),
    emoji!("cool", "Cool as ice", "(■_■)", "playful", "cool sunglasses"),
    emoji!(
        "fish",
        "Gone fishing",
        "><(((°>",
        "playful",
        "fish fishing fisher ocean"
    ),
    emoji!(
        "music",
        "Bard at heart",
        "♪",
        "symbols",
        "music note bard song performance"
    ),
    emoji!(
        "stars",
        "A little sparkle",
        "☆",
        "symbols",
        "star sparkle favorite"
    ),
    emoji!(
        "diamond",
        "Diamond",
        "◆",
        "symbols",
        "diamond marker bullet divider"
    ),
    emoji!(
        "check",
        "Ready check",
        "✓",
        "symbols",
        "check ready done yes complete"
    ),
    emoji!(
        "arrow-right",
        "This way",
        "→",
        "symbols",
        "right arrow direction east"
    ),
    emoji!(
        "arrow-left",
        "Over here",
        "←",
        "symbols",
        "left arrow direction west"
    ),
    emoji!(
        "arrow-up",
        "Look up",
        "↑",
        "symbols",
        "up arrow north direction"
    ),
    emoji!(
        "arrow-down",
        "Down below",
        "↓",
        "symbols",
        "down arrow south direction"
    ),
    emoji!(
        "sun",
        "Clear skies",
        "☀",
        "symbols",
        "sun weather sunny day"
    ),
    emoji!(
        "cloud",
        "Cloud watching",
        "☁",
        "symbols",
        "cloud weather cloudy"
    ),
    emoji!(
        "umbrella",
        "Rainy day",
        "☂",
        "symbols",
        "rain umbrella weather"
    ),
    emoji!(
        "snowman",
        "Starlight wishes",
        "☃",
        "symbols",
        "snow snowman winter starlight"
    ),
];

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn catalog_uses_only_documented_symbols_and_printable_ascii() {
        let mut ids = HashSet::new();
        for emoji in EMOJI {
            assert!(ids.insert(emoji.id), "duplicate id: {}", emoji.id);
            assert!(CATEGORIES.iter().any(|(id, _)| *id == emoji.category));
            assert!(!emoji.text.is_empty());
            assert!(emoji.text.len() < 180, "leave room for a chat message");
            for c in emoji.text.chars() {
                assert!(
                    c.is_ascii_graphic() || c == ' ' || SUPPORTED_SYMBOLS.contains(c),
                    "undocumented character {c} in {}",
                    emoji.id
                );
            }
        }
    }
}
