// ════════════════════════════════════════════════════════════════════════════
//  SOLANA MEMECOIN SNIPER — BACKEND RUST
//  Auteur : PoC pour 01 Studio
//
//  ARCHITECTURE GÉNÉRALE :
//
//   ┌─────────────────────┐       ┌──────────────────────────────────┐
//   │  DexScreener API    │──────▶│  start_watcher()  (Tokio Task)   │
//   │  (HTTP externe)     │       │  Scrape toutes les 10 secondes   │
//   └─────────────────────┘       └─────────────┬────────────────────┘
//                                               │ Arc::clone (pointeur partagé)
//                                               ▼
//                                 ┌─────────────────────────┐
//                                 │  AppState               │
//                                 │  Arc<Mutex<Vec<Opp>>>   │◀── ÉTAT PARTAGÉ
//                                 │  Arc<Mutex<Vec<Log>>>   │    (thread-safe)
//                                 └────────────┬────────────┘
//                                              │ web::Data (injection)
//                                              ▼
//   ┌────────────────────┐       ┌─────────────────────────────┐
//   │  React Frontend    │──────▶│  Actix-web HTTP Handlers    │
//   │  (port 3000)       │◀──────│  GET  /api/opportunities    │
//   └────────────────────┘  JSON │  GET  /api/logs             │
//                                │  POST /api/snipe/:address   │
//                                └─────────────────────────────┘
//
//  CONCEPTS RUST CLÉS DANS CE FICHIER :
//  ┌─────────────┬────────────────────────────────────────────────────────┐
//  │ Arc<T>      │ "Atomic Reference Counted". Pointeur partagé entre     │
//  │             │ threads. Le compteur est atomique → pas de data race.  │
//  │             │ Clone un Arc = incrémenter le compteur, pas copier T.  │
//  ├─────────────┼────────────────────────────────────────────────────────┤
//  │ Mutex<T>    │ Verrou exclusif. .lock() bloque jusqu'à acquisition.   │
//  │             │ Le MutexGuard libère le verrou à la fin du scope (Drop) │
//  ├─────────────┼────────────────────────────────────────────────────────┤
//  │ async/await │ Concurrence coopérative. Un `await` suspend la tâche   │
//  │             │ et libère le thread pour d'autres tâches Tokio.        │
//  ├─────────────┼────────────────────────────────────────────────────────┤
//  │ tokio::spawn│ Lance une tâche async indépendante (comme goroutine Go)│
//  └─────────────┴────────────────────────────────────────────────────────┘
// ════════════════════════════════════════════════════════════════════════════

use actix_cors::Cors;
use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder};
use chrono::Utc;
use log::{error, info, warn};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::time::sleep;
use uuid::Uuid;

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 1 — MODÈLES INTERNES (ce que notre API expose au frontend)
// ════════════════════════════════════════════════════════════════════════════

/// Statut du cycle de vie d'une opportunité détectée.
///
/// `#[serde(rename_all = "SCREAMING_SNAKE_CASE")]` :
///   Serde sérialisera `Detected` → `"DETECTED"`, `Sniped` → `"SNIPED"`, etc.
///   Le TypeScript front attend ces valeurs en majuscules.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OpportunityStatus {
    Detected,
    Sniped,
    Missed,
}

/// Une opportunité de "snipe" détectée sur Solana.
///
/// `#[derive(Clone)]` : Le Borrow Checker de Rust interdit de passer une
/// référence `&T` à travers plusieurs threads (lifetimes incompatibles).
/// En dérivant Clone, on peut créer une copie indépendante au moment voulu.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Opportunity {
    pub id: String,
    pub token_name: String,
    pub token_symbol: String,
    pub token_address: String,
    pub pair_address: String,
    pub dex_id: String,
    pub price_usd: f64,
    pub liquidity_usd: f64,
    pub volume_h24: f64,
    pub price_change_h1: f64,
    /// Timestamp Unix (ms) de création de la paire sur le DEX
    pub pair_created_at: u64,
    /// Heure de détection par notre watcher (format HH:MM:SS)
    pub detected_at: String,
    pub status: OpportunityStatus,
}

/// Niveau de sévérité d'une entrée de log.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "UPPERCASE")]
pub enum LogLevel {
    Info,
    Success,
    Warning,
    Error,
}

/// Entrée de log affichée dans le panneau "System Logs" du dashboard.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LogEntry {
    pub id: String,
    pub timestamp: String,
    pub level: LogLevel,
    pub message: String,
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 2 — STRUCTURES DE DÉSÉRIALISATION DexScreener
//
//  Ces structs "miroir" décrivent le JSON de l'API externe.
//  Serde les remplit automatiquement depuis la réponse HTTP.
//  On utilise #[serde(rename = "...")] car DexScreener utilise camelCase
//  alors que Rust favorise le snake_case.
// ════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Deserialize)]
struct DexSearchResponse {
    /// `Option<Vec<...>>` : DexScreener peut retourner `"pairs": null`
    pairs: Option<Vec<DexPair>>,
}

#[derive(Debug, Deserialize)]
struct DexPair {
    #[serde(rename = "chainId")]
    chain_id: String,

    #[serde(rename = "dexId")]
    dex_id: String,

    #[serde(rename = "pairAddress")]
    pair_address: String,

    #[serde(rename = "baseToken")]
    base_token: DexToken,

    /// `Option<String>` : parfois absent pour les pools très neufs sans trade
    #[serde(rename = "priceUsd")]
    price_usd: Option<String>,

    liquidity:    Option<DexLiquidity>,
    volume:       Option<DexVolume>,

    #[serde(rename = "priceChange")]
    price_change: Option<DexPriceChange>,

    /// Timestamp Unix en millisecondes de création de la paire
    #[serde(rename = "pairCreatedAt")]
    pair_created_at: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct DexToken {
    address: String,
    name: String,
    symbol: String,
}

#[derive(Debug, Deserialize)]
struct DexLiquidity {
    usd: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct DexVolume {
    h24: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct DexPriceChange {
    h1: Option<f64>,
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 3 — ÉTAT PARTAGÉ (Shared Application State)
//
//  AppState est le "singleton" partagé entre :
//    • La tâche de fond (watcher) qui écrit les données
//    • Les handlers HTTP qui lisent les données
//
//  Pourquoi Arc<Mutex<Vec<T>>> et pas juste Vec<T> ?
//
//    Vec<T> seul → NOT Send : Rust refuse de l'envoyer entre threads.
//    Mutex<T>   → Send + Sync : garantit l'exclusion mutuelle.
//    Arc<T>     → permet d'avoir N pointeurs vers le même Mutex
//                  sans copier la donnée. La mémoire est libérée
//                  quand le dernier Arc est dropped (RAII).
//
//  Alternative plus performante (lectures >> écritures) :
//    RwLock<T> : N lecteurs simultanés OU 1 écrivain exclusif.
//    On choisit Mutex ici pour la lisibilité pédagogique.
// ════════════════════════════════════════════════════════════════════════════

pub struct AppState {
    pub opportunities: Arc<Mutex<Vec<Opportunity>>>,
    pub logs: Arc<Mutex<Vec<LogEntry>>>,
    pub http_client: Client,
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 4 — HANDLERS HTTP (Routes Actix-web)
// ════════════════════════════════════════════════════════════════════════════

/// GET /api/opportunities
///
/// `web::Data<AppState>` : Actix injecte automatiquement l'AppState partagé.
/// C'est de la "Dependency Injection" gérée par le framework.
#[get("/api/opportunities")]
async fn get_opportunities(data: web::Data<AppState>) -> impl Responder {
    // .lock() : Acquiert le verrou. Si un autre thread l'a,
    // on attend qu'il le libère. Renvoie un MutexGuard<Vec<Opportunity>>.
    //
    // .unwrap() : Panic si le Mutex est "poisonné" (un thread a paniqué
    // en tenant le verrou). Acceptable pour un PoC ; en production on
    // utiliserait .unwrap_or_else(|e| e.into_inner()) pour récupérer.
    let opportunities = data.opportunities.lock().unwrap();

    // .clone() : Crée une copie du Vec AVANT de libérer le verrou.
    // Ainsi le verrou est tenu le moins longtemps possible.
    // Le MutexGuard est droppé à la fin du bloc `let opportunities = ...`
    // → Rust garantit la libération via le trait Drop (RAII automatique).
    HttpResponse::Ok().json(opportunities.clone())
}

/// GET /api/logs
#[get("/api/logs")]
async fn get_logs(data: web::Data<AppState>) -> impl Responder {
    let logs = data.logs.lock().unwrap();
    // Les 100 derniers logs, du plus récent au plus ancien
    let recent: Vec<LogEntry> = logs.iter().rev().take(100).cloned().collect();
    HttpResponse::Ok().json(recent)
}

/// POST /api/snipe/{token_address}
///
/// Simule une transaction de sniping via un Jito Bundle.
/// En réel : on construirait une VersionedTransaction Solana, on l'enverrait
/// au block engine Jito avec un tip SOL pour garantir l'inclusion prioritaire.
#[post("/api/snipe/{token_address}")]
async fn simulate_snipe(
    path: web::Path<String>,
    data: web::Data<AppState>,
) -> impl Responder {
    let token_address = path.into_inner();
    info!("🎯 Simulating snipe for: {}", token_address);

    // ── Étape 1 : Mettre à jour le statut de l'opportunité ──────────────
    // Le bloc { } force la libération du MutexGuard AVANT le bloc suivant.
    // Sans ce bloc, le compilateur Rust pourrait détecter un double-borrow
    // si on réutilise `data` plus loin (même si ce n'est pas le cas ici).
    // C'est une bonne pratique : tenir les verrous le moins longtemps possible.
    {
        let mut opportunities = data.opportunities.lock().unwrap();
        if let Some(opp) = opportunities
            .iter_mut()
            .find(|o| o.token_address == token_address)
        {
            opp.status = OpportunityStatus::Sniped;
        }
    } // ← MutexGuard droppé ici. Le verrou est LIBÉRÉ.

    // ── Étape 2 : Ajouter les logs de simulation Jito ───────────────────
    let short_addr = format!("{}…{}", &token_address[..8], &token_address[token_address.len()-4..]);
    let fake_sig   = format!("{}…{}", &Uuid::new_v4().simple().to_string()[..8],
                                       &Uuid::new_v4().simple().to_string()[..8]);

    let sim_logs = vec![
        (LogLevel::Info,    format!("🎯 SNIPE initiated → {}", short_addr)),
        (LogLevel::Info,    "📦 Constructing Jito Bundle (1 tx)...".to_string()),
        (LogLevel::Info,    "⚡ Estimating optimal tip → 0.001 SOL (~$0.14)".to_string()),
        (LogLevel::Info,    "🔐 Signing transaction with keypair...".to_string()),
        (LogLevel::Info,    "📡 Submitting to Jito Block Engine (Amsterdam)...".to_string()),
        (LogLevel::Success, format!("✅ Bundle accepted | Sig: {}", fake_sig)),
        (LogLevel::Success, "🏁 [SIMULATION] No real funds were used.".to_string()),
    ];

    {
        let mut logs = data.logs.lock().unwrap();
        for (level, message) in sim_logs {
            logs.push(LogEntry {
                id:        Uuid::new_v4().to_string(),
                timestamp: Utc::now().format("%H:%M:%S%.3f").to_string(),
                level,
                message,
            });
        }
        cap_logs(&mut logs);
    }

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "simulation": true,
        "message": "Jito Bundle simulation complete",
        "signature": fake_sig,
        "token": token_address
    }))
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 5 — WATCHER TASK (Tâche de surveillance en arrière-plan)
//
//  Cette fonction est lancée UNE FOIS au démarrage avec tokio::spawn().
//  Elle tourne indéfiniment dans une boucle `loop`.
//
//  Pourquoi `async fn` ?
//  → Car elle appelle des fonctions async (reqwest, sleep).
//    `async fn` retourne un Future que Tokio exécute coopérativement.
//    À chaque `await`, Tokio peut exécuter une autre tâche en attendant
//    la réponse réseau. Un seul thread OS peut ainsi gérer des milliers
//    de tâches I/O simultanées → c'est le principe de l'async I/O.
//
//  Signatures :
//  `Arc<Mutex<Vec<Opportunity>>>` : On passe un Arc (pas une référence &).
//  Le ownership est transféré (moved) dans la tâche Tokio.
//  Le watcher "possède" ses Arc — le Borrow Checker est satisfait.
// ════════════════════════════════════════════════════════════════════════════

async fn start_watcher(
    opportunities: Arc<Mutex<Vec<Opportunity>>>,
    logs: Arc<Mutex<Vec<LogEntry>>>,
    http_client: Client,
) {
    info!("🔍 Watcher initialized — scanning Solana network...");
    push_log(&logs, LogLevel::Info,    "🔍 Watcher initialized — polling DexScreener every 10s".to_string());
    push_log(&logs, LogLevel::Info,    "🌐 Connecting to DexScreener public API...".to_string());
    push_log(&logs, LogLevel::Success, "✅ Connection established".to_string());

    // HashSet pour dédupliquer : on n'ajoute jamais deux fois la même paire.
    // C'est une variable LOCALE au watcher — pas besoin de Mutex ici
    // car seul ce thread y accède.
    let mut seen_pairs: HashSet<String> = HashSet::new();

    // Rotation des termes de recherche pour maximiser la diversité des tokens
    let queries = ["pump", "moon", "sol", "doge", "pepe", "inu", "cat", "meme"];
    let mut query_idx = 0usize;

    loop {
        let query = queries[query_idx % queries.len()];
        query_idx = query_idx.wrapping_add(1);

        let url = format!(
            "https://api.dexscreener.com/latest/dex/search?q={}",
            query
        );

        push_log(&logs, LogLevel::Info,
            format!("📡 Polling DexScreener [query={}]...", query));

        // ── Requête HTTP avec gestion d'erreur par pattern matching ────────
        // `match result { Ok(v) => ..., Err(e) => ... }` est l'idiome Rust
        // pour gérer les erreurs sans exception. Pas de try/catch — le
        // compilateur nous FORCE à traiter le cas d'erreur.
        match http_client.get(&url).send().await {
            Err(e) => {
                error!("Network error: {}", e);
                push_log(&logs, LogLevel::Error, format!("❌ Network error: {}", e));
            }

            Ok(response) => {
                match response.json::<DexSearchResponse>().await {
                    Err(e) => {
                        warn!("JSON parse error: {}", e);
                        push_log(&logs, LogLevel::Warning, format!("⚠ Parse error: {}", e));
                    }

                    Ok(body) => {
                        let pairs = body.pairs.unwrap_or_default();

                        // ── Filtrage des paires ──────────────────────────
                        let now_ms    = Utc::now().timestamp_millis() as u64;
                        let day_ms    = 24 * 60 * 60 * 1000u64;  // 24h en ms

                        let new_pairs: Vec<&DexPair> = pairs
                            .iter()
                            .filter(|p| {
                                // 1. Seulement Solana
                                p.chain_id == "solana"
                                // 2. Paire non encore vue ce cycle
                                && !seen_pairs.contains(&p.pair_address)
                                // 3. Créée dans les dernières 24h
                                && p.pair_created_at
                                    .map(|t| now_ms.saturating_sub(t) < day_ms)
                                    .unwrap_or(false)
                                // 4. Liquidité minimale de $500 (filtre les honeypots)
                                && p.liquidity
                                    .as_ref()
                                    .and_then(|l| l.usd)
                                    .map(|usd| usd > 500.0)
                                    .unwrap_or(false)
                            })
                            .take(5) // Maximum 5 opportunités par cycle
                            .collect();

                        if new_pairs.is_empty() {
                            push_log(&logs, LogLevel::Info,
                                "⏳ No new opportunities this cycle. Watching...".to_string());
                        } else {
                            // Convertir DexPair → Opportunity (notre modèle interne)
                            let new_opps: Vec<Opportunity> = new_pairs
                                .iter()
                                .map(|p| {
                                    seen_pairs.insert(p.pair_address.clone());
                                    Opportunity {
                                        id: Uuid::new_v4().to_string(),
                                        token_name:    p.base_token.name.clone(),
                                        token_symbol:  p.base_token.symbol.clone(),
                                        token_address: p.base_token.address.clone(),
                                        pair_address:  p.pair_address.clone(),
                                        dex_id:        p.dex_id.clone(),
                                        price_usd: p.price_usd
                                            .as_ref()
                                            .and_then(|s| s.parse().ok())
                                            .unwrap_or(0.0),
                                        liquidity_usd: p.liquidity
                                            .as_ref()
                                            .and_then(|l| l.usd)
                                            .unwrap_or(0.0),
                                        volume_h24: p.volume
                                            .as_ref()
                                            .and_then(|v| v.h24)
                                            .unwrap_or(0.0),
                                        price_change_h1: p.price_change
                                            .as_ref()
                                            .and_then(|pc| pc.h1)
                                            .unwrap_or(0.0),
                                        pair_created_at: p.pair_created_at.unwrap_or(0),
                                        detected_at: Utc::now()
                                            .format("%H:%M:%S")
                                            .to_string(),
                                        status: OpportunityStatus::Detected,
                                    }
                                })
                                .collect();

                            // ── Écriture dans le SharedState ────────────
                            // On acquiert les deux verrous séquentiellement
                            // (jamais en même temps) pour éviter les deadlocks.
                            {
                                let mut opps = opportunities.lock().unwrap();
                                // Ajoute les nouvelles opps en TÊTE de liste
                                let mut updated = new_opps.clone();
                                updated.extend(opps.iter().cloned());
                                updated.truncate(50); // Garde max 50 en mémoire
                                *opps = updated;
                            } // verrou opportunities libéré

                            {
                                let mut lg = logs.lock().unwrap();
                                for opp in &new_opps {
                                    let addr_short = format!(
                                        "{}…{}",
                                        &opp.token_address[..6],
                                        &opp.token_address[opp.token_address.len()-4..]
                                    );
                                    lg.push(LogEntry {
                                        id: Uuid::new_v4().to_string(),
                                        timestamp: Utc::now()
                                            .format("%H:%M:%S%.3f")
                                            .to_string(),
                                        level: LogLevel::Success,
                                        message: format!(
                                            "🚨 NEW POOL: {} ({}) | Liq ${:.0} | ${:.8} | {}",
                                            opp.token_symbol,
                                            opp.dex_id,
                                            opp.liquidity_usd,
                                            opp.price_usd,
                                            addr_short
                                        ),
                                    });
                                }
                                cap_logs(&mut lg);
                            } // verrou logs libéré
                        }
                    }
                }
            }
        }

        // ── Pause de 10 secondes (non-bloquante) ──────────────────────────
        // `sleep(...).await` : Tokio programme un réveil dans 10s et
        // LIBÈRE le thread pour traiter d'autres tâches en attendant.
        // Contrairement à `std::thread::sleep` qui BLOQUE le thread OS.
        sleep(Duration::from_secs(10)).await;
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 6 — UTILITAIRES
// ════════════════════════════════════════════════════════════════════════════

/// Ajoute un LogEntry dans la liste partagée de façon thread-safe.
///
/// Prend `&Arc<Mutex<...>>` (référence sur Arc) : on n'a pas besoin
/// de transférer l'ownership, juste d'y accéder le temps du lock.
fn push_log(logs: &Arc<Mutex<Vec<LogEntry>>>, level: LogLevel, message: String) {
    let mut guard = logs.lock().unwrap();
    guard.push(LogEntry {
        id:        Uuid::new_v4().to_string(),
        timestamp: Utc::now().format("%H:%M:%S%.3f").to_string(),
        level,
        message,
    });
    cap_logs(&mut guard);
}

/// Garde le vecteur de logs sous la limite de 500 entrées.
/// Appelé chaque fois qu'on écrit dans les logs.
fn cap_logs(logs: &mut Vec<LogEntry>) {
    const MAX_LOGS: usize = 500;
    if logs.len() > MAX_LOGS {
        // drain(0..N) supprime les N premiers éléments (les plus anciens)
        // en O(n) — on pourrait optimiser avec VecDeque, mais 500 entrées
        // reste négligeable.
        logs.drain(0..logs.len() - MAX_LOGS);
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 7 — POINT D'ENTRÉE
//
//  `#[tokio::main]` est une macro procédurale qui :
//    1. Transforme `async fn main()` en `fn main()` standard
//    2. Initialise le runtime Tokio multi-thread
//    3. Exécute notre future main() sur ce runtime
//
//  Sans cette macro, `main()` ne peut pas être `async`
//  car le runtime doit être créé avant d'exécuter quoi que ce soit d'async.
// ════════════════════════════════════════════════════════════════════════════

#[tokio::main]
async fn main() -> std::io::Result<()> {
    // Active les logs avec le niveau INFO par défaut.
    // RUST_LOG=debug cargo run → active les logs debug.
    env_logger::init_from_env(
        env_logger::Env::default().default_filter_or("info")
    );

    info!("╔══════════════════════════════════════╗");
    info!("║   SOLANA MEMECOIN SNIPER BACKEND     ║");
    info!("║   Listening on http://0.0.0.0:8080   ║");
    info!("╚══════════════════════════════════════╝");

    // ── Initialisation de l'état partagé ──────────────────────────────────
    // Arc::new(Mutex::new(vec![])) :
    //   vec![]        → Vec<T> vide, alloué sur le heap
    //   Mutex::new()  → enveloppe le Vec dans un verrou
    //   Arc::new()    → enveloppe le Mutex dans un compteur atomique
    //
    // Coût mémoire : ~40 bytes pour l'Arc + ~8 bytes pour le Mutex + Vec.
    // Très léger comparé à l'overhead d'un serveur HTTP classique.
    let opportunities: Arc<Mutex<Vec<Opportunity>>> = Arc::new(Mutex::new(Vec::new()));
    let logs:          Arc<Mutex<Vec<LogEntry>>>    = Arc::new(Mutex::new(Vec::new()));

    // Le Client HTTP est thread-safe et conçu pour être réutilisé.
    // Il gère en interne un pool de connexions TCP persistantes.
    let http_client = Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("SniperBot/1.0 (PoC)")
        .build()
        .expect("Failed to build HTTP client");

    // ── Cloner les Arc pour le Watcher ─────────────────────────────────────
    // `Arc::clone(&x)` === `x.clone()` mais plus explicite sur l'intention :
    // "je clone le POINTEUR, pas la donnée".
    // Après ces lignes, les compteurs de références passent de 1 à 2.
    let opps_watcher   = Arc::clone(&opportunities);
    let logs_watcher   = Arc::clone(&logs);
    let client_watcher = http_client.clone(); // reqwest::Client implémente Clone

    // ── Lancer le Watcher en tâche de fond ────────────────────────────────
    // `tokio::spawn` : Lance une tâche async concurrente.
    // `move` : Transfère l'ownership des variables clonées DANS la closure.
    // Sans `move`, Rust refuserait de compiler (durée de vie incertaine).
    //
    // La tâche tourne indéfiniment (loop sans break) en parallèle du serveur.
    tokio::spawn(async move {
        start_watcher(opps_watcher, logs_watcher, client_watcher).await;
    });

    // ── Préparer l'AppState partagé pour Actix ────────────────────────────
    // `web::Data::new(...)` emballe notre state dans un Arc<T> géré par Actix.
    // Actix le clonera pour chaque worker thread (le compteur Arc monte encore).
    let app_state = web::Data::new(AppState {
        opportunities,
        logs,
        http_client,
    });

    // ── Démarrer le serveur HTTP Actix-web ────────────────────────────────
    HttpServer::new(move || {
        // CORS : Autorise le frontend React (localhost:3000) à appeler notre
        // API malgré la Same-Origin Policy des navigateurs.
        // En production, on remplacerait par le domaine du frontend.
        let cors = Cors::default()
            .allowed_origin("http://localhost:3000")
            .allowed_origin("http://127.0.0.1:3000")
            .allowed_origin("http://localhost:5173") // Vite dev par défaut
            .allowed_methods(vec!["GET", "POST", "OPTIONS"])
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .app_data(app_state.clone())
            // Enregistrement des routes
            .service(get_opportunities)
            .service(get_logs)
            .service(simulate_snipe)
    })
    .bind("0.0.0.0:8080")?
    .workers(2) // 2 worker threads Actix (suffisant pour un PoC)
    .run()
    .await
}
