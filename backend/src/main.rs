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
//                                 ┌─────────────────────────────────────┐
//                                 │  AppState                          │
//                                 │  Arc<RwLock<Vec<Opp>>>             │
//                                 │  Arc<Mutex<Vec<Log>>>              │
//                                 │  Arc<RwLock<JitoConfig>>           │◀── ÉTAT
//                                 │  Arc<RwLock<NetworkStats>>         │    PARTAGÉ
//                                 │  Arc<Mutex<Vec<SnipeHistory>>>     │
//                                 └────────────┬───────────────────────┘
//                                              │ web::Data (injection)
//                                              ▼
//   ┌────────────────────┐       ┌──────────────────────────────────────┐
//   │  React Frontend    │──────▶│  Actix-web HTTP Handlers             │
//   │  (port 3000)       │◀──────│  GET  /api/opportunities             │
//   └────────────────────┘  JSON │  GET  /api/logs                      │
//                                │  POST /api/snipe/:address            │
//                                │  GET  /api/network                   │
//                                │  GET  /api/jito/config               │
//                                │  PUT  /api/jito/config               │
//                                │  POST /api/jupiter/quote             │
//                                │  GET  /api/snipe/history             │
//                                └──────────────────────────────────────┘
//
//  CONCEPTS RUST CLÉS DANS CE FICHIER :
//  ┌─────────────┬────────────────────────────────────────────────────────┐
//  │ Arc<T>      │ "Atomic Reference Counted". Pointeur partagé entre     │
//  │             │ threads. Le compteur est atomique → pas de data race.  │
//  │             │ Clone un Arc = incrémenter le compteur, pas copier T.  │
//  ├─────────────┼────────────────────────────────────────────────────────┤
//  │ RwLock<T>   │ Verrou lecteurs/écrivain. N lecteurs OU 1 écrivain.   │
//  │             │ .read() = accès partagé, .write() = accès exclusif.   │
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
use actix_web::{get, post, put, web, App, HttpResponse, HttpServer, Responder};
use chrono::Utc;
use log::{error, info, warn};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex, RwLock},
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
    pub volume_h1: f64,
    pub price_change_m5:  f64,
    pub price_change_h1:  f64,
    pub price_change_h6:  f64,
    pub price_change_h24: f64,
    pub volume_h6:        f64,
    /// Market cap en USD (peut être 0 si non disponible)
    pub market_cap:       f64,
    /// Fully Diluted Valuation en USD
    pub fdv:              f64,
    /// Transactions (achats / ventes) sur les dernières 1h et 24h
    pub txns_h1_buys:     u64,
    pub txns_h1_sells:    u64,
    pub txns_h24_buys:    u64,
    pub txns_h24_sells:   u64,
    /// Timestamp Unix (ms) de création de la paire sur le DEX
    pub pair_created_at: u64,
    /// Heure de détection par notre watcher (format HH:MM:SS)
    pub detected_at: String,
    pub status: OpportunityStatus,
    /// Score de risque calculé pour ce token (honeypot, rug pull, etc.)
    pub risk_score: Option<RiskScore>,
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
//  SECTION 1b — MODÈLES JITO BUNDLES & JUPITER (Infrastructure Solana)
//
//  Ces structures modélisent les composants clés de l'infrastructure
//  de transactions Solana utilisée en production :
//
//  • Jito Bundles : Regroupement de transactions envoyées directement
//    aux validateurs Jito (MEV-aware) avec un "tip" (pourboire) SOL
//    pour garantir l'inclusion prioritaire dans un block.
//
//  • Jupiter : Agrégateur de liquidité DEX. Il calcule la meilleure
//    route de swap parmi tous les DEX Solana (Raydium, Orca, etc.)
//    pour obtenir le meilleur prix avec le moins de slippage.
//
//  • Priority Fees : Frais additionnels (en micro-lamports par CU)
//    pour prioritiser sa transaction dans la file d'attente du leader.
// ════════════════════════════════════════════════════════════════════════════

/// Configuration du moteur de bundles Jito.
///
/// En production, ces paramètres contrôlent comment nos transactions
/// sont soumises aux validateurs Jito pour une exécution prioritaire.
/// Le tip est crucial : trop bas → le bundle est ignoré,
/// trop haut → on perd de la marge sur le trade.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JitoConfig {
    /// Tip minimum en SOL (ex: 0.0001 SOL ≈ $0.014)
    pub tip_min_sol: f64,
    /// Tip maximum en SOL (ex: 0.01 SOL ≈ $1.40)
    pub tip_max_sol: f64,
    /// Block Engine sélectionné (Amsterdam, Frankfurt, NY, Tokyo)
    /// Chaque block engine a une latence différente selon notre localisation
    pub block_engine: String,
    /// Stratégie de tip : "fixed", "dynamic", "aggressive"
    /// - fixed : toujours le même tip
    /// - dynamic : ajusté selon la congestion réseau
    /// - aggressive : tip maximum pour garantir l'inclusion
    pub tip_strategy: String,
    /// Nombre max de transactions par bundle (1-5 sur Jito)
    pub max_txns_per_bundle: u8,
    /// Slippage toléré en % (ex: 1.0 = 1%)
    pub slippage_bps: u64,
    /// Activer la protection anti-sandwich
    /// (les bundles Jito sont atomiques → protection native contre le front-running)
    pub anti_sandwich: bool,
    /// Compute Unit limit pour la transaction
    /// (chaque instruction Solana consomme des CU, max 1.4M par tx)
    pub compute_unit_limit: u32,
    /// Priority fee en micro-lamports par CU
    /// (1 lamport = 0.000000001 SOL)
    pub priority_fee_micro_lamports: u64,
}

impl Default for JitoConfig {
    fn default() -> Self {
        Self {
            tip_min_sol: 0.0001,
            tip_max_sol: 0.005,
            block_engine: "amsterdam".to_string(),
            tip_strategy: "dynamic".to_string(),
            max_txns_per_bundle: 1,
            slippage_bps: 100, // 1%
            anti_sandwich: true,
            compute_unit_limit: 200_000,
            priority_fee_micro_lamports: 5_000,
        }
    }
}

/// Statistiques réseau Solana simulées.
///
/// En production, ces données viendraient de :
/// - `getRecentPerformanceSamples()` (RPC Solana)
/// - `getSlot()` pour le slot courant
/// - `getRecentPrioritizationFees()` pour les frais de priorité
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkStats {
    /// Transactions par seconde (TPS) du réseau Solana
    /// Solana peut théoriquement atteindre 65 000 TPS
    pub tps: u64,
    /// Slot courant (un slot ≈ 400ms sur Solana)
    /// Le leader du slot produit un block contenant les transactions
    pub current_slot: u64,
    /// Epoch courante (1 epoch ≈ 2-3 jours, regroupe ~432 000 slots)
    pub epoch: u64,
    /// Prix estimé de la priority fee pour une inclusion "rapide"
    /// (en micro-lamports par Compute Unit)
    pub priority_fee_estimate: u64,
    /// Niveau de congestion : "low", "medium", "high", "critical"
    pub congestion_level: String,
    /// Nombre de validateurs actifs
    pub active_validators: u64,
    /// Prix SOL/USD (pour affichage)
    pub sol_price_usd: f64,
    /// Timestamp de dernière mise à jour
    pub last_updated: String,
}

impl Default for NetworkStats {
    fn default() -> Self {
        Self {
            tps: 3200,
            current_slot: 290_000_000,
            epoch: 600,
            priority_fee_estimate: 5_000,
            congestion_level: "medium".to_string(),
            active_validators: 1_900,
            sol_price_usd: 140.0,
            last_updated: Utc::now().format("%H:%M:%S").to_string(),
        }
    }
}

/// Résultat d'une simulation de quote Jupiter.
///
/// En production, on appellerait l'API Jupiter :
/// `GET https://quote-api.jup.ag/v6/quote?inputMint=...&outputMint=...&amount=...`
///
/// Jupiter compare les prix sur tous les DEX Solana et retourne
/// la meilleure route (parfois multi-hop : SOL → USDC → TOKEN).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JupiterQuote {
    pub input_mint: String,
    pub output_mint: String,
    pub input_amount: u64,
    pub output_amount: u64,
    pub price_impact_pct: f64,
    /// Route utilisée (ex: ["Raydium", "Orca"] pour un multi-hop)
    pub route_plan: Vec<JupiterRoutePlan>,
    /// Frais de swap en lamports
    pub swap_fee_lamports: u64,
    /// Slippage estimé en bps
    pub slippage_bps: u64,
    /// Temps estimé d'exécution en ms
    pub estimated_time_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JupiterRoutePlan {
    pub dex: String,
    pub input_mint: String,
    pub output_mint: String,
    pub fee_pct: f64,
    pub liquidity: f64,
}

/// Entrée dans l'historique des snipes (simulés ou réels).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SnipeHistoryEntry {
    pub id: String,
    pub timestamp: String,
    pub token_symbol: String,
    pub token_address: String,
    pub action: String,        // "BUY" ou "SELL"
    pub amount_sol: f64,
    pub price_usd: f64,
    pub tip_sol: f64,
    pub bundle_id: String,
    pub block_engine: String,
    pub landing_slot: u64,
    pub status: String,        // "LANDED", "DROPPED", "PENDING"
    pub pnl_pct: f64,
    pub simulation: bool,
}

/// Score de risque d'un token (détection honeypot / rug pull).
///
/// En production, ce scoring serait basé sur :
/// - Analyse de la mint authority (peut-elle mint à l'infini ?)
/// - Freeze authority (le créateur peut-il geler les comptes ?)
/// - Concentration des holders (top 10 holders > 80% = red flag)
/// - Liquidité lockée ou non
/// - Ancienneté du deployer wallet
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RiskScore {
    /// Score global 0-100 (0 = très risqué, 100 = sûr)
    pub score: u8,
    /// Niveau : "SAFE", "CAUTION", "DANGER", "CRITICAL"
    pub level: String,
    /// Flags détaillés
    pub flags: Vec<RiskFlag>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RiskFlag {
    pub name: String,
    pub severity: String,  // "info", "warning", "danger"
    pub description: String,
    pub passed: bool,
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

    txns: Option<DexTxns>,

    #[serde(rename = "marketCap")]
    market_cap: Option<f64>,

    fdv: Option<f64>,

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
    h6:  Option<f64>,
    h1:  Option<f64>,
}

#[derive(Debug, Deserialize)]
struct DexPriceChange {
    m5:  Option<f64>,
    h1:  Option<f64>,
    h6:  Option<f64>,
    h24: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct DexTxns {
    h1:  Option<DexTxnCount>,
    h24: Option<DexTxnCount>,
}

#[derive(Debug, Deserialize)]
struct DexTxnCount {
    buys:  Option<u64>,
    sells: Option<u64>,
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 3 — ÉTAT PARTAGÉ (Shared Application State)
//
//  AppState est le "singleton" partagé entre :
//    • La tâche de fond (watcher) qui écrit les données
//    • Les handlers HTTP qui lisent les données
//
//  Pourquoi Arc<RwLock<Vec<T>>> pour les opportunités ?
//
//    Vec<T> seul → NOT Send : Rust refuse de l'envoyer entre threads.
//    RwLock<T>   → N lecteurs simultanés OU 1 écrivain exclusif.
//    Arc<T>      → permet d'avoir N pointeurs vers le même RwLock
//                  sans copier la donnée.
//
//  Les opportunités sont lues par le frontend toutes les 3s mais écrites
//  seulement toutes les 10s par le watcher → RwLock est plus approprié
//  que Mutex (qui n'autorise qu'un seul accès à la fois, lecture incluse).
//
//  Les logs gardent un Mutex car ils sont écrits très fréquemment (watcher).
// ════════════════════════════════════════════════════════════════════════════

pub struct AppState {
    pub opportunities: Arc<RwLock<Vec<Opportunity>>>,
    pub logs: Arc<Mutex<Vec<LogEntry>>>,
    pub http_client: Client,
    /// Configuration Jito Bundles (modifiable via PUT /api/jito/config)
    pub jito_config: Arc<RwLock<JitoConfig>>,
    /// Statistiques réseau Solana (mises à jour par le network_watcher)
    pub network_stats: Arc<RwLock<NetworkStats>>,
    /// Historique des snipes simulés
    pub snipe_history: Arc<Mutex<Vec<SnipeHistoryEntry>>>,
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
    // .read() : Acquiert un verrou de lecture partagé (RwLock).
    // Plusieurs threads peuvent lire simultanément — aucun n'attend les autres
    // tant qu'aucun écrivain n'est actif. Idéal ici : le frontend lit toutes
    // les 3s mais le watcher n'écrit que toutes les 10s.
    let opportunities = data.opportunities.read().unwrap();

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

/// DELETE /api/logs
///
/// Vide le buffer de logs en mémoire. Appelé par le bouton "Clear" du frontend.
#[actix_web::delete("/api/logs")]
async fn clear_logs(data: web::Data<AppState>) -> impl Responder {
    let mut logs = data.logs.lock().unwrap();
    let cleared = logs.len();
    logs.clear();
    info!("🗑  Logs cleared ({} entries removed)", cleared);
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "cleared": cleared
    }))
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
        let mut opportunities = data.opportunities.write().unwrap();
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

    // ── Étape 3 : Ajouter à l'historique ────────────────────────────────
    {
        let jito = data.jito_config.read().unwrap();
        let net  = data.network_stats.read().unwrap();
        let mut history = data.snipe_history.lock().unwrap();
        history.push(SnipeHistoryEntry {
            id:            Uuid::new_v4().to_string(),
            timestamp:     Utc::now().format("%H:%M:%S%.3f").to_string(),
            token_symbol:  token_address[..6].to_string(),
            token_address: token_address.clone(),
            action:        "BUY".to_string(),
            amount_sol:    0.1,
            price_usd:     0.0,
            tip_sol:       jito.tip_min_sol,
            bundle_id:     fake_sig.clone(),
            block_engine:  jito.block_engine.clone(),
            landing_slot:  net.current_slot + 2,
            status:        "LANDED".to_string(),
            pnl_pct:       0.0,
            simulation:    true,
        });
        let hlen = history.len();
        if hlen > 100 {
            history.drain(0..hlen - 100);
        }
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
//  SECTION 4b — ENDPOINTS JITO BUNDLES
//
//  Ces endpoints exposent la configuration et le contrôle du moteur
//  de bundles Jito. En production, PUT /api/jito/config permettrait
//  de modifier les paramètres de soumission en temps réel sans
//  redémarrer le serveur (hot-reload de la stratégie de trading).
// ════════════════════════════════════════════════════════════════════════════

/// GET /api/jito/config — Retourne la configuration Jito actuelle
#[get("/api/jito/config")]
async fn get_jito_config(data: web::Data<AppState>) -> impl Responder {
    let config = data.jito_config.read().unwrap();
    HttpResponse::Ok().json(config.clone())
}

/// PUT /api/jito/config — Met à jour la configuration Jito
///
/// Permet de modifier les paramètres du moteur de bundles en temps réel.
/// En production, chaque modification serait validée (ex: tip_min < tip_max)
/// et loggée pour audit.
#[put("/api/jito/config")]
async fn update_jito_config(
    body: web::Json<JitoConfig>,
    data: web::Data<AppState>,
) -> impl Responder {
    let new_config = body.into_inner();
    info!("⚙ Jito config updated: strategy={}, tip={}-{} SOL, engine={}",
        new_config.tip_strategy, new_config.tip_min_sol, new_config.tip_max_sol,
        new_config.block_engine);

    {
        let mut config = data.jito_config.write().unwrap();
        *config = new_config.clone();
    }

    push_log(&data.logs, LogLevel::Info,
        format!("⚙ Jito config updated → strategy={}, tip={}-{} SOL",
            new_config.tip_strategy, new_config.tip_min_sol, new_config.tip_max_sol));

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "config": new_config
    }))
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 4c — ENDPOINT JUPITER SWAP QUOTE (Simulation)
//
//  Jupiter est l'agrégateur DEX #1 sur Solana. Il interroge tous les
//  DEX (Raydium, Orca, Meteora, Phoenix, etc.) pour trouver la route
//  de swap optimale. Il peut faire du "split routing" (diviser l'ordre
//  sur plusieurs DEX) et du "multi-hop" (SOL → USDC → TOKEN).
//
//  En production : POST https://quote-api.jup.ag/v6/quote
// ════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Deserialize)]
pub struct JupiterQuoteRequest {
    pub input_mint: String,
    pub output_mint: String,
    pub amount_lamports: u64,
    pub slippage_bps: Option<u64>,
}

/// POST /api/jupiter/quote — Simule un quote Jupiter
///
/// Calcule une route de swap simulée avec prix, impact et frais estimés.
/// En production, on appellerait l'API Jupiter et on recevrait la route
/// exacte avec les instructions de transaction Solana à signer.
#[post("/api/jupiter/quote")]
async fn get_jupiter_quote(
    body: web::Json<JupiterQuoteRequest>,
    data: web::Data<AppState>,
) -> impl Responder {
    let req = body.into_inner();
    let slippage = req.slippage_bps.unwrap_or(100);

    // Simulation : on cherche le token dans nos opportunités pour son prix
    let price = {
        let opps = data.opportunities.read().unwrap();
        opps.iter()
            .find(|o| o.token_address == req.output_mint)
            .map(|o| o.price_usd)
            .unwrap_or(0.00001)
    };

    // Simuler une route multi-DEX réaliste
    let route_plan = vec![
        JupiterRoutePlan {
            dex: "Raydium".to_string(),
            input_mint: "So11111111111111111111111111111111111111112".to_string(), // SOL mint
            output_mint: req.output_mint.clone(),
            fee_pct: 0.25,
            liquidity: 50_000.0,
        },
    ];

    // Calcul du output simulé (en fonction du prix et du montant)
    let sol_price = data.network_stats.read().unwrap().sol_price_usd;
    let input_sol = req.amount_lamports as f64 / 1_000_000_000.0;
    let input_usd = input_sol * sol_price;
    let output_tokens = if price > 0.0 { input_usd / price } else { 0.0 };
    let price_impact = (input_usd / 50_000.0) * 100.0; // Impact basé sur la liquidité simulée

    let quote = JupiterQuote {
        input_mint: req.input_mint,
        output_mint: req.output_mint,
        input_amount: req.amount_lamports,
        output_amount: (output_tokens * 1_000_000.0) as u64, // 6 décimales (SPL standard)
        price_impact_pct: (price_impact * 100.0).round() / 100.0,
        route_plan,
        swap_fee_lamports: 5_000, // ~0.000005 SOL
        slippage_bps: slippage,
        estimated_time_ms: 400, // ~1 slot Solana
    };

    push_log(&data.logs, LogLevel::Info,
        format!("🔄 Jupiter quote: {:.4} SOL → {:.0} tokens | impact {:.2}%",
            input_sol, output_tokens, price_impact));

    HttpResponse::Ok().json(quote)
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 4d — ENDPOINT NETWORK STATS
//
//  En production, ces données viendraient des RPC Solana :
//  - solana_client::rpc_client::RpcClient::get_recent_performance_samples()
//  - getSlot(), getEpochInfo(), getRecentPrioritizationFees()
// ════════════════════════════════════════════════════════════════════════════

/// GET /api/network — Retourne les stats réseau Solana
#[get("/api/network")]
async fn get_network_stats(data: web::Data<AppState>) -> impl Responder {
    let stats = data.network_stats.read().unwrap();
    HttpResponse::Ok().json(stats.clone())
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 4e — ENDPOINT HISTORIQUE DES SNIPES
// ════════════════════════════════════════════════════════════════════════════

/// GET /api/snipe/history — Historique des snipes simulés
#[get("/api/snipe/history")]
async fn get_snipe_history(data: web::Data<AppState>) -> impl Responder {
    let history = data.snipe_history.lock().unwrap();
    let recent: Vec<SnipeHistoryEntry> = history.iter().rev().take(50).cloned().collect();
    HttpResponse::Ok().json(recent)
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
    opportunities: Arc<RwLock<Vec<Opportunity>>>,
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

                                    // Calculer le score de risque pour chaque token détecté
                                    let risk = compute_risk_score(p);

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
                                        volume_h6: p.volume
                                            .as_ref()
                                            .and_then(|v| v.h6)
                                            .unwrap_or(0.0),
                                        volume_h1: p.volume
                                            .as_ref()
                                            .and_then(|v| v.h1)
                                            .unwrap_or(0.0),
                                        price_change_m5: p.price_change
                                            .as_ref()
                                            .and_then(|pc| pc.m5)
                                            .unwrap_or(0.0),
                                        price_change_h1: p.price_change
                                            .as_ref()
                                            .and_then(|pc| pc.h1)
                                            .unwrap_or(0.0),
                                        price_change_h6: p.price_change
                                            .as_ref()
                                            .and_then(|pc| pc.h6)
                                            .unwrap_or(0.0),
                                        price_change_h24: p.price_change
                                            .as_ref()
                                            .and_then(|pc| pc.h24)
                                            .unwrap_or(0.0),
                                        market_cap: p.market_cap.unwrap_or(0.0),
                                        fdv:        p.fdv.unwrap_or(0.0),
                                        txns_h1_buys: p.txns.as_ref()
                                            .and_then(|t| t.h1.as_ref())
                                            .and_then(|c| c.buys)
                                            .unwrap_or(0),
                                        txns_h1_sells: p.txns.as_ref()
                                            .and_then(|t| t.h1.as_ref())
                                            .and_then(|c| c.sells)
                                            .unwrap_or(0),
                                        txns_h24_buys: p.txns.as_ref()
                                            .and_then(|t| t.h24.as_ref())
                                            .and_then(|c| c.buys)
                                            .unwrap_or(0),
                                        txns_h24_sells: p.txns.as_ref()
                                            .and_then(|t| t.h24.as_ref())
                                            .and_then(|c| c.sells)
                                            .unwrap_or(0),
                                        pair_created_at: p.pair_created_at.unwrap_or(0),
                                        detected_at: Utc::now()
                                            .format("%H:%M:%S")
                                            .to_string(),
                                        status: OpportunityStatus::Detected,
                                        risk_score: Some(risk),
                                    }
                                })
                                .collect();

                            // ── Écriture dans le SharedState ────────────
                            // On acquiert les deux verrous séquentiellement
                            // (jamais en même temps) pour éviter les deadlocks.
                            {
                                let mut opps = opportunities.write().unwrap();
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

        // ── Pruning du cache seen_pairs ────────────────────────────────────
        // Le HashSet grandit indéfiniment si le watcher tourne des heures.
        // Au-delà de 2000 entrées, on le vide. La fenêtre de 24h sur
        // pair_created_at empêche la re-détection de paires trop anciennes.
        if seen_pairs.len() > 2_000 {
            let count = seen_pairs.len();
            seen_pairs.clear();
            push_log(&logs, LogLevel::Warning,
                format!("♻ Cache seen_pairs rotated — {} entries cleared", count));
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

/// Calcule un score de risque simulé pour un token.
///
/// En production, cette fonction analyserait :
/// - La mint authority (peut-elle mint de nouveaux tokens ?)
/// - La freeze authority (peut-elle geler des comptes ?)
/// - La concentration des holders (via getProgramAccounts)
/// - L'historique du deployer wallet (via getSignaturesForAddress)
/// - Si la liquidité est lockée (via un programme de lock comme Raydium)
///
/// C'est un composant critique pour éviter les honeypots et rug pulls.
fn compute_risk_score(pair: &DexPair) -> RiskScore {
    let mut score: i32 = 50; // Score de base neutre
    let mut flags = Vec::new();

    // 1. Vérifier la liquidité
    let liq = pair.liquidity.as_ref().and_then(|l| l.usd).unwrap_or(0.0);
    if liq > 10_000.0 {
        score += 15;
        flags.push(RiskFlag {
            name: "Liquidity".to_string(),
            severity: "info".to_string(),
            description: format!("Liquidity ${:.0} — sufficient for trading", liq),
            passed: true,
        });
    } else if liq > 1_000.0 {
        score += 5;
        flags.push(RiskFlag {
            name: "Liquidity".to_string(),
            severity: "warning".to_string(),
            description: format!("Liquidity ${:.0} — low, high slippage risk", liq),
            passed: false,
        });
    } else {
        score -= 20;
        flags.push(RiskFlag {
            name: "Liquidity".to_string(),
            severity: "danger".to_string(),
            description: format!("Liquidity ${:.0} — critical, possible honeypot", liq),
            passed: false,
        });
    }

    // 2. Vérifier le volume (activité de trading réelle)
    let vol_h1 = pair.volume.as_ref().and_then(|v| v.h1).unwrap_or(0.0);
    if vol_h1 > 5_000.0 {
        score += 10;
        flags.push(RiskFlag {
            name: "Volume".to_string(),
            severity: "info".to_string(),
            description: format!("Vol 1h ${:.0} — active trading", vol_h1),
            passed: true,
        });
    } else if vol_h1 > 0.0 {
        flags.push(RiskFlag {
            name: "Volume".to_string(),
            severity: "warning".to_string(),
            description: format!("Vol 1h ${:.0} — low activity", vol_h1),
            passed: false,
        });
    } else {
        score -= 15;
        flags.push(RiskFlag {
            name: "Volume".to_string(),
            severity: "danger".to_string(),
            description: "No trading volume — possible honeypot".to_string(),
            passed: false,
        });
    }

    // 3. Vérifier les transactions (ratio buy/sell)
    let buys = pair.txns.as_ref()
        .and_then(|t| t.h1.as_ref())
        .and_then(|c| c.buys)
        .unwrap_or(0) as f64;
    let sells = pair.txns.as_ref()
        .and_then(|t| t.h1.as_ref())
        .and_then(|c| c.sells)
        .unwrap_or(0) as f64;
    let total_txns = buys + sells;

    if total_txns > 50.0 {
        score += 10;
        let ratio = if total_txns > 0.0 { buys / total_txns } else { 0.5 };
        flags.push(RiskFlag {
            name: "Txn Activity".to_string(),
            severity: "info".to_string(),
            description: format!("{:.0} txns 1h, buy ratio {:.0}%", total_txns, ratio * 100.0),
            passed: true,
        });
    } else if sells == 0.0 && buys > 5.0 {
        score -= 25;
        flags.push(RiskFlag {
            name: "Sell Block".to_string(),
            severity: "danger".to_string(),
            description: "No sells detected — possible honeypot (can't sell)".to_string(),
            passed: false,
        });
    }

    // 4. Vérifier l'âge de la paire
    let age_ms = pair.pair_created_at
        .map(|t| Utc::now().timestamp_millis() as u64 - t)
        .unwrap_or(0);
    let age_hours = age_ms / (3600 * 1000);

    if age_hours < 1 {
        score -= 10;
        flags.push(RiskFlag {
            name: "Pool Age".to_string(),
            severity: "warning".to_string(),
            description: "Pool < 1h old — very new, higher risk".to_string(),
            passed: false,
        });
    } else if age_hours > 6 {
        score += 10;
        flags.push(RiskFlag {
            name: "Pool Age".to_string(),
            severity: "info".to_string(),
            description: format!("Pool {}h old — survived initial period", age_hours),
            passed: true,
        });
    }

    // 5. FDV check (Fully Diluted Valuation excessive = red flag)
    let fdv = pair.fdv.unwrap_or(0.0);
    if fdv > 100_000_000.0 {
        score -= 15;
        flags.push(RiskFlag {
            name: "FDV".to_string(),
            severity: "danger".to_string(),
            description: format!("FDV ${:.0}M — unrealistically high", fdv / 1_000_000.0),
            passed: false,
        });
    }

    // Clamp score between 0 and 100
    let score = score.clamp(0, 100) as u8;

    let level = match score {
        80..=100 => "SAFE",
        60..=79  => "CAUTION",
        30..=59  => "DANGER",
        _        => "CRITICAL",
    }.to_string();

    RiskScore { score, level, flags }
}

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

/// Tâche de fond qui simule la mise à jour des stats réseau Solana.
///
/// En production, on interrogerait le RPC Solana :
/// - `getRecentPerformanceSamples` pour le TPS
/// - `getSlot` pour le slot courant
/// - `getRecentPrioritizationFees` pour les priority fees
/// - `getEpochInfo` pour l'epoch
///
/// Ces données sont essentielles pour ajuster dynamiquement les tips
/// Jito et les priority fees de nos transactions.
async fn start_network_watcher(
    network_stats: Arc<RwLock<NetworkStats>>,
) {
    loop {
        // Simuler des variations réalistes du réseau
        {
            let mut stats = network_stats.write().unwrap();

            // TPS varie entre 2000 et 5000 (réaliste pour Solana)
            let tps_delta: i64 = ((Utc::now().timestamp() % 7) - 3) * 100;
            stats.tps = ((stats.tps as i64 + tps_delta).clamp(2000, 5000)) as u64;

            // Slot avance d'environ 75 par 30s (2.5 slots/seconde)
            stats.current_slot += 75;
            stats.epoch = stats.current_slot / 432_000;

            // Priority fee s'ajuste selon le "TPS" (congestion simulée)
            stats.priority_fee_estimate = match stats.tps {
                0..=2500     => 50_000,  // Très congestionné
                2501..=3500  => 10_000,  // Modéré
                3501..=4500  => 5_000,   // Normal
                _            => 1_000,   // Peu chargé
            };

            stats.congestion_level = match stats.tps {
                0..=2500     => "high".to_string(),
                2501..=3500  => "medium".to_string(),
                _            => "low".to_string(),
            };

            // Simuler une légère variation du prix SOL
            let delta = ((Utc::now().timestamp() % 5) - 2) as f64 * 0.15;
            stats.sol_price_usd = (stats.sol_price_usd + delta).clamp(130.0, 160.0);

            stats.last_updated = Utc::now().format("%H:%M:%S").to_string();
        }

        sleep(Duration::from_secs(30)).await;
    }
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
    let opportunities: Arc<RwLock<Vec<Opportunity>>> = Arc::new(RwLock::new(Vec::new()));
    let logs:          Arc<Mutex<Vec<LogEntry>>>    = Arc::new(Mutex::new(Vec::new()));
    let jito_config:   Arc<RwLock<JitoConfig>>     = Arc::new(RwLock::new(JitoConfig::default()));
    let network_stats: Arc<RwLock<NetworkStats>>   = Arc::new(RwLock::new(NetworkStats::default()));
    let snipe_history: Arc<Mutex<Vec<SnipeHistoryEntry>>> = Arc::new(Mutex::new(Vec::new()));

    // Le Client HTTP est thread-safe et conçu pour être réutilisé.
    let http_client = Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("SniperBot/1.0 (PoC)")
        .build()
        .expect("Failed to build HTTP client");

    // ── Cloner les Arc pour les tâches de fond ────────────────────────────
    let opps_watcher   = Arc::clone(&opportunities);
    let logs_watcher   = Arc::clone(&logs);
    let client_watcher = http_client.clone();
    let net_watcher    = Arc::clone(&network_stats);

    // ── Lancer le Watcher DexScreener en tâche de fond ────────────────────
    tokio::spawn(async move {
        start_watcher(opps_watcher, logs_watcher, client_watcher).await;
    });

    // ── Lancer le Watcher Network Stats en tâche de fond ──────────────────
    tokio::spawn(async move {
        start_network_watcher(net_watcher).await;
    });

    // ── Préparer l'AppState partagé pour Actix ────────────────────────────
    let app_state = web::Data::new(AppState {
        opportunities,
        logs,
        http_client,
        jito_config,
        network_stats,
        snipe_history,
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
            .allowed_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .app_data(app_state.clone())
            // Enregistrement des routes
            .service(get_opportunities)
            .service(get_logs)
            .service(clear_logs)
            .service(simulate_snipe)
            // Jito Bundles
            .service(get_jito_config)
            .service(update_jito_config)
            // Jupiter DEX Aggregator
            .service(get_jupiter_quote)
            // Solana Network
            .service(get_network_stats)
            // Snipe History
            .service(get_snipe_history)
    })
    .bind("0.0.0.0:8080")?
    .workers(2) // 2 worker threads Actix (suffisant pour un PoC)
    .run()
    .await
}
