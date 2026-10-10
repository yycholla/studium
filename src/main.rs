#[tokio::main]
async fn main() -> std::io::Result<()> {
    eprintln!("Starting The Studium (HOST defaults to 127.0.0.1, PORT to 3000)");
    topcoat::start(ffxiv_emoji::router()).await
}
