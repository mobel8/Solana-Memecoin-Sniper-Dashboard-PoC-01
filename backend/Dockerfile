# ─────────────────────────────────────────────────────────────────────────────
#  STAGE 1 — BUILD
#  On compile en release dans un conteneur Rust complet,
#  puis on copie uniquement le binaire dans l'image finale (beaucoup plus légère).
# ─────────────────────────────────────────────────────────────────────────────
FROM rust:1.76-slim AS builder

WORKDIR /app

# Copier les manifestes en premier pour profiter du cache Docker :
# si seul le code source change, cargo ne retélécharge pas les dépendances.
COPY Cargo.toml Cargo.lock ./

# Astuce de cache : créer un main.rs vide pour compiler les dépendances seules
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -f target/release/deps/sniper_backend*

# Maintenant copier le vrai code source et compiler
COPY src ./src
RUN cargo build --release

# ─────────────────────────────────────────────────────────────────────────────
#  STAGE 2 — RUNTIME
#  Image minimale Debian : ~80 Mo contre ~1.5 Go pour l'image Rust complète.
# ─────────────────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim

# ca-certificates : requis pour les appels HTTPS (DexScreener, etc.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/sniper-backend .

# Niveau de log par défaut (Railway peut surcharger via variable d'env)
ENV RUST_LOG=info

# Railway injecte automatiquement $PORT — le backend lit cette variable.
# EXPOSE est documentaire, Railway gère le routing.
EXPOSE 8080

CMD ["./sniper-backend"]
