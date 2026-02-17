# Solana Memecoin Sniper Dashboard — PoC 01

> **Proof of Concept** — Terminal-style dashboard for monitoring new token pools on Solana and simulating snipe transactions via Jito Bundles.

![Status](https://img.shields.io/badge/status-PoC-orange)
![Rust](https://img.shields.io/badge/backend-Rust%20%2B%20Actix--web-orange?logo=rust)
![React](https://img.shields.io/badge/frontend-React%2018%20%2B%20TypeScript-blue?logo=react)
![Solana](https://img.shields.io/badge/chain-Solana-9945FF?logo=solana)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Table des matières

- [Aperçu](#aperçu)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Stack technique](#stack-technique)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Lancement](#lancement)
- [Endpoints API](#endpoints-api)
- [Structure du projet](#structure-du-projet)
- [Configuration](#configuration)
- [Disclaimer](#disclaimer)

---

## Aperçu

Ce dashboard surveille en continu la blockchain Solana via l'API publique **DexScreener**, détecte les nouveaux pools de tokens dès leur création et les affiche dans une interface style **Bloomberg Terminal**.

Les transactions de snipe sont **simulées** (Jito Bundle simulé) — aucun fond réel n'est engagé. Ce projet est un PoC destiné à explorer les patterns d'architecture pour ce type d'outil.

**Capture d'écran :**

```
╔══════════════════════════════════════════════════════════════════╗
║  SOLANA SNIPER v1.0 — TERMINAL ████████████████  LIVE ●         ║
║  Detected: 12   Active: 5   Sniped: 3   Win Rate: 66.7%         ║
╠═══════════════════════════════════╦══════════════════════════════╣
║  TOKEN         PRICE    LIQ  1H%  ║  [INFO]  Watcher started    ║
║  PEPE3 /SOL   $0.0042  $12K +42%  ║  [OK]    New pair detected  ║
║  MOONCAT/SOL  $0.0001  $2K  +18%  ║  [OK]    Bundle simulated   ║
║  ...          ...      ...  ...   ║  [WARN]  Low liquidity      ║
╚═══════════════════════════════════╩══════════════════════════════╝
```

---

## Fonctionnalités

### Backend (Rust)
- **Watcher asynchrone** — Polling DexScreener toutes les 10 secondes avec rotation de queries (`pump`, `moon`, `sol`, `pepe`, `inu`, `cat`, `meme`...)
- **Filtrage des paires** — Chain Solana uniquement, créées dans les dernières 24h, liquidité min. $500
- **Déduplication** — HashSet pour éviter les doublons dans un même cycle
- **Simulation Jito Bundle** — Génère une fausse signature de transaction et met à jour le statut
- **State thread-safe** — `Arc<Mutex<Vec<T>>>` partagé entre le watcher et les handlers HTTP
- **API REST** — 3 endpoints Actix-web avec CORS activé

### Frontend (React)
- **Polling temps réel** — Mise à jour automatique toutes les 3 secondes
- **Liste des opportunités** — Prix, liquidité, variation 1h, mini-sparkline, lien DexScreener
- **Bouton SNIPE** — Déclenche la simulation via `POST /api/snipe/{address}`
- **Panel de logs** — Terminal scrollable, auto-scroll, codes couleur par niveau
- **Header statistiques** — Compteurs animés (Detected, Active, Sniped, Win Rate)
- **UI Bloomberg Terminal** — Dark theme néon, font JetBrains Mono, effet scanline CRT

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              Frontend (React)               │
│  port 3000  ←──── /api/* proxy ────────────►│
└─────────────────────┬───────────────────────┘
                      │ HTTP REST (JSON)
┌─────────────────────▼───────────────────────┐
│              Backend (Rust)                 │
│  port 8080   Actix-web server               │
│                                             │
│  ┌──────────────┐   Arc<Mutex<AppState>>    │
│  │ Watcher Task │──►  opportunities: Vec    │
│  │ (Tokio)      │     logs: Vec             │
│  └──────┬───────┘                           │
│         │ HTTP GET (reqwest)                │
└─────────┼─────────────────────────────────-─┘
          │
┌─────────▼──────────┐
│  DexScreener API   │
│  (public, no auth) │
└────────────────────┘
```

**Pattern producteur-consommateur :**
- Le watcher Tokio produit des `Opportunity` et des `LogEntry` en arrière-plan
- Les handlers HTTP lisent le state partagé et le sérialisent en JSON
- Le frontend consomme l'API toutes les 3s et re-render via React hooks

---

## Stack technique

| Couche | Technologie | Version |
|--------|-------------|---------|
| Backend runtime | Rust + Tokio | 2021 edition |
| Backend framework | Actix-web | 4.x |
| HTTP client backend | reqwest | 0.12 |
| Sérialisation | serde + serde_json | latest |
| Frontend framework | React | 18.3.1 |
| Langage frontend | TypeScript | 5.4.5 |
| Build tool | Vite | 5.3.1 |
| Styling | Tailwind CSS | 3.4.4 |
| Charts | Recharts | 2.12.0 |
| Icons | Lucide React | 0.344.0 |
| Font | JetBrains Mono | Google Fonts |

---

## Prérequis

- **Rust** — [rustup.rs](https://rustup.rs/) (stable toolchain)
- **Node.js** — v18+ recommandé
- **npm** — inclus avec Node.js
- Connexion internet (pour l'API DexScreener)

---

## Installation

### 1. Cloner le repo

```bash
git clone https://github.com/mobel8/Solana-Memecoin-Sniper-Dashboard-PoC-01.git
cd Solana-Memecoin-Sniper-Dashboard-PoC-01
```

### 2. Installer les dépendances frontend

```bash
cd frontend
npm install
```

### 3. Compiler le backend (optionnel en dev — `cargo run` le fait automatiquement)

```bash
cd backend
cargo build
```

---

## Lancement

Il faut lancer **deux terminaux** en parallèle.

### Terminal 1 — Backend Rust

```bash
cd backend
cargo run
```

Le serveur démarre sur `http://0.0.0.0:8080`.
Pour les logs détaillés :

```bash
RUST_LOG=debug cargo run
```

### Terminal 2 — Frontend React

```bash
cd frontend
npm run dev
```

Le dashboard est accessible sur **http://localhost:3000**.

> Le proxy Vite redirige automatiquement `/api/*` vers `http://localhost:8080`.

---

## Endpoints API

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/opportunities` | Liste des tokens détectés (max 50) |
| `GET` | `/api/logs` | Logs système (max 500 entrées) |
| `POST` | `/api/snipe/{token_address}` | Simule un Jito Bundle sur l'adresse donnée |

### Exemple de réponse — `/api/opportunities`

```json
[
  {
    "id": "uuid-v4",
    "token_name": "PepeMoon",
    "token_symbol": "PEPEMOON",
    "token_address": "7xKX...",
    "pair_address": "4aBC...",
    "dex_id": "raydium",
    "price_usd": 0.00000421,
    "liquidity_usd": 12500.0,
    "volume_h24": 48300.0,
    "price_change_h1": 42.5,
    "pair_created_at": 1718000000000,
    "detected_at": "14:23:07",
    "status": "DETECTED"
  }
]
```

### Exemple de réponse — `/api/logs`

```json
[
  {
    "id": "uuid-v4",
    "timestamp": "14:23:07.421",
    "level": "SUCCESS",
    "message": "New pair detected: PEPEMOON/SOL — liq $12,500"
  }
]
```

---

## Structure du projet

```
Solana-Memecoin-Sniper-Dashboard-PoC-01/
│
├── backend/
│   ├── Cargo.toml              # Manifest Rust (dépendances, metadata)
│   ├── Cargo.lock              # Lock file Rust
│   └── src/
│       └── main.rs             # Serveur Actix + watcher Tokio (~620 lignes)
│
├── frontend/
│   ├── package.json            # Dépendances npm + scripts
│   ├── vite.config.ts          # Config Vite (port 3000, proxy /api)
│   ├── tsconfig.json           # Config TypeScript (strict mode)
│   ├── tailwind.config.js      # Thème terminal (couleurs, fonts, animations)
│   ├── postcss.config.js       # PostCSS + Autoprefixer
│   ├── index.html              # HTML entry point
│   └── src/
│       ├── main.tsx            # Mount React App
│       ├── App.tsx             # Composant principal + polling logic
│       ├── index.css           # Styles globaux (scanline, scrollbars)
│       └── components/
│           ├── StatsHeader.tsx # Barre de statistiques (Detected/Sniped/WinRate)
│           ├── TokenRow.tsx    # Ligne de token (prix, liq, sparkline, bouton snipe)
│           └── LogPanel.tsx    # Panel logs terminal (auto-scroll, couleurs)
│
├── .gitignore
└── README.md
```

---

## Configuration

### Variables d'environnement (backend)

| Variable | Défaut | Description |
|----------|--------|-------------|
| `RUST_LOG` | `info` | Niveau de log (`debug`, `info`, `warn`, `error`) |
| `PORT` | `8080` | Port du serveur HTTP *(non implémenté, hardcodé)* |

### Paramètres internes (backend `main.rs`)

| Constante | Valeur | Description |
|-----------|--------|-------------|
| Polling interval | 10s | Fréquence d'appel DexScreener |
| Min liquidity | $500 | Filtre anti-honeypot |
| Max opportunities | 50 | Taille max de la liste en mémoire |
| Max logs | 500 | Taille max du buffer de logs |
| Max new per cycle | 5 | Nouveaux tokens max par cycle |
| Max pair age | 24h | Filtre d'ancienneté des paires |

### Paramètres frontend (`App.tsx`)

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| Polling interval | 3000ms | Fréquence de refresh de l'UI |

---

## Disclaimer

> **Ce projet est un Proof of Concept à but éducatif uniquement.**
>
> - Aucune transaction réelle n'est exécutée. Les "snipes" sont entièrement simulés.
> - Ce code n'est pas prêt pour la production et ne doit pas être utilisé avec des fonds réels sans refactoring complet (gestion des clés privées, sécurité, rate limiting, etc.).
> - Le trading de memecoins est extrêmement risqué. La plupart des tokens détectés sont des rugs ou des scams.
> - L'auteur décline toute responsabilité quant à l'utilisation de ce code.

---

## Licence

MIT — voir [LICENSE](LICENSE) pour les détails.

---

*Built with Rust + React — PoC 01 Studio*
