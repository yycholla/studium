FROM rust:1.98-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY src ./src
COPY assets ./assets
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN groupadd --system chatbook && useradd --system --gid chatbook chatbook
COPY --from=builder /app/target/release/ffxiv-emoji /usr/local/bin/ffxiv-emoji
USER chatbook
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/ffxiv-emoji"]
