# GUIDE D'ENTRETIEN — Solana Memecoin Sniper Dashboard
## Préparation technique pour le poste Dev Rust/Solana chez 01 Studio

---

## TABLE DES MATIÈRES

1. [C'est quoi ce projet ?](#1-cest-quoi-ce-projet-)
2. [Comment ça marche (vue simple)](#2-comment-ça-marche-vue-simple)
3. [Chaque page du site expliquée](#3-chaque-page-du-site-expliquée)
4. [Architecture technique](#4-architecture-technique)
5. [Concepts Solana essentiels](#5-concepts-solana-essentiels)
6. [Jito Bundles — expliqué simplement](#6-jito-bundles--expliqué-simplement)
7. [Jupiter — expliqué simplement](#7-jupiter--expliqué-simplement)
8. [Priority Fees & Compute Units](#8-priority-fees--compute-units)
9. [Concepts Rust utilisés](#9-concepts-rust-utilisés)
10. [Concepts React/TypeScript utilisés](#10-concepts-reacttypescript-utilisés)
11. [Questions d'entretien probables + réponses](#11-questions-dentretien-probables--réponses)
12. [Comment parler du projet en entretien](#12-comment-parler-du-projet-en-entretien)

---

## 1. C'est quoi ce projet ?

### En une phrase
Un **dashboard de monitoring et de trading automatisé** pour les nouveaux tokens (memecoins) qui apparaissent sur la blockchain Solana, avec simulation de transactions via Jito Bundles.

### L'analogie simple
Imagine un radar qui scanne en permanence la blockchain Solana. Dès qu'un nouveau token apparaît sur un DEX (exchange décentralisé), le radar le détecte, analyse s'il est sûr ou dangereux (score de risque), et te permet d'acheter en un clic avant que le prix monte.

### Pourquoi c'est utile ?
Sur Solana, des centaines de nouveaux tokens sont créés **chaque heure**. 99% sont des arnaques (honeypots, rug pulls), mais certains font x100. Le problème : comment les détecter avant tout le monde et acheter en premier ? C'est exactement ce que fait notre outil.

### Le contexte business (B2B)
01 Studio développe cette infrastructure de transactions pour des **clients professionnels** (traders institutionnels, fonds crypto, market makers). L'outil est en PoC (Proof of Concept) et sera transformé en produit B2B avec :
- Un moteur d'orchestration de transactions
- Une couche d'optimisation on-chain (Jito, priority fees)
- Un dashboard de pilotage pour les opérateurs

---

## 2. Comment ça marche (vue simple)

```
┌────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  DexScreener   │────▶│  Backend Rust    │────▶│  Frontend React    │
│  (API publique)│     │  (serveur :8080) │     │  (navigateur :3000)│
│                │     │                  │     │                    │
│  Donne la liste│     │  1. Scrape /10s  │     │  1. Affiche tokens │
│  des nouveaux  │     │  2. Filtre       │     │  2. Graphes prix   │
│  tokens Solana │     │  3. Score risque │     │  3. Score de risque│
│                │     │  4. Stocke       │     │  4. Bouton SNIPE   │
│                │     │  5. Expose API   │     │  5. Config Jito    │
└────────────────┘     └──────────────────┘     └────────────────────┘
```

### Le flux étape par étape :

1. **Le backend Rust** tourne en permanence et interroge l'API DexScreener toutes les 10 secondes
2. Il récupère les nouveaux tokens listés sur Solana
3. Il **filtre** : seulement les tokens récents (< 24h), avec un minimum de liquidité ($500)
4. Il **calcule un score de risque** pour chaque token (honeypot ? rug pull ?)
5. Il expose tout via une API REST (JSON)
6. **Le frontend React** affiche les tokens dans un dashboard style Bloomberg Terminal
7. L'utilisateur peut cliquer **SNIPE** pour simuler un achat via Jito Bundle
8. Le réseau Solana est monitoré en temps réel (TPS, slots, congestion)

---

## 3. Chaque page du site expliquée

### 3.1 — Header (barre supérieure)

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚡ SOLANA SNIPER  PoC—01 Studio  |  🟢 LIVE  |  Jito  Theme  │
└─────────────────────────────────────────────────────────────────┘
```

**Composants :**
- **Logo "SOLANA SNIPER"** : Nom du projet avec animation glow (néon)
- **Indicateur LIVE/OFFLINE** : Vert = connecté au backend Rust, Rouge = déconnecté
- **Bouton Refresh** : Force un rechargement des données
- **Bouton Jito** : Ouvre/ferme le panneau de configuration Jito Bundles
- **Sélecteur de thème** : 5 thèmes visuels (Matrix, Cyberpunk, Midnight, Blood, Ghost)
- **Indicateur "Rust :8080"** : Montre que le backend tourne sur le port 8080

**Utilité** : Navigation et contrôle global. Le statut LIVE/OFFLINE est critique car si le backend est down, aucune donnée n'arrive.

---

### 3.2 — Barre de statistiques (StatsHeader)

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ 👁 Total     │ 🎯 Active    │ ✓ Sniped     │ 📊 Win Rate  │
│ Detected: 23 │ Opps: 18     │ Simulated: 5 │ 22%          │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

**4 cartes :**
1. **Total Detected** : Nombre total de tokens repérés depuis le démarrage
2. **Active** : Tokens encore en statut "DETECTED" (pas encore snipés)
3. **Sniped** : Nombre de simulations de snipe effectuées
4. **Win Rate** : Ratio sniped/total (pertinent en production pour mesurer le succès)

**Utilité** : Vue d'ensemble instantanée de l'activité. En production, le Win Rate mesurerait le pourcentage de trades profitables.

---

### 3.3 — Barre réseau Solana (NetworkBar) — NOUVEAU

```
┌──────────────────────────────────────────────────────────────┐
│ 🔵 Solana Network | TPS 3,200 | Slot 290,000,075 | Epoch 600│
│ Priority 5,000 μL/CU | 🟡 MEDIUM | Validators 1,900 | SOL $140│
└──────────────────────────────────────────────────────────────┘
```

**Métriques :**
- **TPS** (Transactions Per Second) : Combien de transactions Solana traite par seconde (~2000-5000 en conditions normales, théorique max 65 000)
- **Slot** : Le "numéro de block" courant. Un slot = ~400ms sur Solana. Le validateur leader du slot produit un block
- **Epoch** : Un groupe de ~432 000 slots (~2-3 jours). Sert pour le staking et la rotation des leaders
- **Priority Fee** : Le coût en micro-lamports par Compute Unit pour être prioritaire. Plus le réseau est congestionné, plus il faut payer
- **Congestion** : Niveau de charge du réseau (low/medium/high). Affecte le coût des transactions
- **Validators** : Nombre de nœuds validateurs actifs sur Solana
- **SOL Price** : Prix du SOL en USD (pour calculer les coûts en dollars)

**Utilité** : Savoir si le réseau est congestionné AVANT d'envoyer une transaction. Si la congestion est "high", il faut augmenter les tips Jito et les priority fees.

---

### 3.4 — Panneau Jito Bundle Engine (JitoPanel) — NOUVEAU

```
┌─────────────────────────────────────────────────────────────────┐
│ 🛡 JITO BUNDLE ENGINE                               [Apply]   │
├──────────────┬──────────────┬────────────────┬─────────────────┤
│ Block Engine │ Tip Strategy │ Transaction    │ Protection      │
│              │              │                │                 │
│ ○ Amsterdam  │ ○ Fixed      │ Slippage: 100  │ ☑ Anti-Sandwich│
│ ● Frankfurt  │ ● Dynamic    │ CU Limit: 200K │ Max Txns: 1    │
│ ○ New York   │ ○ Aggressive │ Priority: 5000 │                 │
│ ○ Tokyo      │              │                │ Est. Cost:      │
│              │ Min: 0.0001  │                │ ~0.001 SOL      │
│              │ Max: 0.005   │                │                 │
└──────────────┴──────────────┴────────────────┴─────────────────┘
```

**Sections :**

1. **Block Engine** : Serveur Jito auquel envoyer le bundle. Choisis celui le plus proche géographiquement pour minimiser la latence
   - Amsterdam (EU ~25ms) — le plus proche pour Paris
   - Frankfurt (EU ~22ms)
   - New York (US ~45ms)
   - Tokyo (JP ~120ms)

2. **Tip Strategy** : Comment déterminer le pourboire pour le validateur Jito
   - **Fixed** : Toujours le même montant (prévisible mais peut rater si le réseau est chargé)
   - **Dynamic** : S'ajuste selon la congestion (meilleur ratio coût/inclusion)
   - **Aggressive** : Toujours le max (garantit l'inclusion mais coûte plus)

3. **Transaction** :
   - **Slippage** : Tolérance de prix en "basis points" (100 bps = 1%). Si le prix bouge de plus de 1% entre ta requête et l'exécution, la transaction échoue plutôt que de t'arnaquer
   - **Compute Unit Limit** : Nombre max de CU que ta transaction peut consommer (chaque instruction Solana coûte des CU, max 1.4M par tx)
   - **Priority Fee** : Frais additionnels en micro-lamports par CU pour passer devant les autres transactions dans la file

4. **Protection** :
   - **Anti-Sandwich** : Les bundles Jito sont **atomiques** — soit toutes les transactions du bundle sont exécutées, soit aucune. Ça empêche les attaques sandwich (quelqu'un achète avant toi et vend après pour voler la différence)
   - **Max Txns/Bundle** : Combien de transactions dans un seul bundle (max 5 sur Jito)

**Utilité** : Contrôler précisément comment les transactions sont soumises au réseau. En production, ces paramètres font la différence entre une transaction qui passe et une qui échoue.

---

### 3.5 — Barre de filtres

```
┌────────────────────────────────────────────────────────────────┐
│ 🎚 Filters | Status [ALL] [DETECTED] [SNIPED] | Sort ▼ | DEX ▼│
│                                               12/23 tokens    │
└────────────────────────────────────────────────────────────────┘
```

- **Status** : Filtrer par statut (tous, détectés seulement, snipés seulement)
- **Sort** : Trier par date, changement de prix, liquidité, volume
- **DEX** : Filtrer par exchange (Raydium, Orca, etc.)
- **Compteur** : Affiche X/Y tokens correspondant aux filtres

---

### 3.6 — Liste des tokens (TokenRow)

```
┌──────────────────────────────────────────────────────────────────┐
│ 🟢 PEPE  PepeToken       $0.00042  📊   $12.5K   ▲+42.5%  raydium │
│    7xKX…2d4f  📋  3h ago     ───────      liq    1h        [SNIPE] │
│    🛡72                                                     [📤][↗] │
├──────────────────────────────────────────────────────────────────┤
│ (quand on clique, le détail s'expande)                          │
│                                                                  │
│ [Graphe prix 60 points]                                         │
│                                                                  │
│ Price Change │ Transactions  │ Market        │ Risk Analysis     │
│ 5m   +2.5%   │ 1h  234B/56S │ MCap $850K    │ Score: 72/100     │
│ 1h  +42.5%   │ ████████░░   │ FDV  $1.25M   │ ✓ Liquidity OK    │
│ 6h  +15.3%   │ 24h 1200/340 │ Vol 1h $1.5K  │ ✗ Pool < 1h old   │
│ 24h +89.2%   │ ████████░░   │ Vol 24h $48K  │ ✓ Active trading  │
└──────────────────────────────────────────────────────────────────┘
```

**Chaque ligne contient :**
- **Symbole + Nom** : Le nom du token (ex: PEPE)
- **Badge Risk** : Score de risque coloré (vert = safe, jaune = caution, rouge = danger) — NOUVEAU
- **Adresse** : Adresse tronquée + bouton copier
- **Âge** : Depuis quand la pool existe
- **Prix** : Prix actuel en USD
- **Mini Sparkline** : Graphe miniature de l'évolution du prix (24 points)
- **Liquidité** : Combien d'argent est disponible dans la pool (plus c'est haut, plus c'est sûr)
- **Volume 1h** : Combien a été échangé dans la dernière heure
- **Changement 1h** : Variation du prix sur 1 heure (vert = hausse, rouge = baisse)
- **DEX** : Sur quel exchange décentralisé (Raydium, Orca, etc.)
- **Bouton SNIPE** : Lance la simulation d'achat via Jito Bundle
- **Bouton Maximize** : Ouvre la page de détail en plein écran
- **Lien DexScreener** : Ouvre le token sur dexscreener.com

**Quand on clique sur la ligne** (expand) :
- **Graphe détaillé** : 60 points de données prix avec gradient
- **Price Change** : Variations sur 4 timeframes (5m, 1h, 6h, 24h)
- **Transactions** : Ratio achats/ventes avec barre de progression
- **Market** : Market cap, FDV, volumes
- **Risk Analysis** : Score détaillé avec tous les flags de risque — NOUVEAU

---

### 3.7 — Page détail token (TokenDetail)

Quand on clique sur "Maximize" d'un token, on arrive sur cette page plein écran :

- **Header** : Infos résumées + bouton Back + SNIPE + lien DexScreener
- **Grand graphe** : 120 points de données, axes X (temps) et Y (prix), reference line
- **4 panneaux d'info** : Price Change, Transactions, Market Data, Token Info
- **Panneau Risk Analysis** : Score complet avec toutes les alertes détaillées — NOUVEAU

---

### 3.8 — Panneau System Logs (LogPanel)

```
┌────────────────────────────────────────────┐
│ 🖥 System Logs              3 OK  0 ERR   │
├────────────────────────────────────────────┤
│ 14:23:07 [INFO]  📡 Polling [query=pump]  │
│ 14:23:08 [OK]    🚨 NEW POOL: PEPE (ray)  │
│ 14:23:08 [OK]    🚨 NEW POOL: DOGE (orca) │
│ 14:23:17 [INFO]  📡 Polling [query=moon]  │
│ 14:23:18 [INFO]  ⏳ No new opportunities   │
│ 14:24:30 [INFO]  🎯 SNIPE initiated       │
│ 14:24:30 [INFO]  📦 Constructing Bundle   │
│ 14:24:30 [OK]    ✅ Bundle accepted        │
├────────────────────────────────────────────┤
│ root@sniper :~$ monitoring solana network █│
└────────────────────────────────────────────┘
```

**Fonctionnalités :**
- Affichage style terminal Linux
- Logs colorés par niveau (bleu=info, vert=success, jaune=warning, rouge=error)
- Auto-scroll vers le bas (se pause si l'utilisateur scrolle manuellement)
- Bouton "Clear" pour vider les logs
- Compteurs de succès/erreurs
- Prompt simulé en bas (cosmétique)

---

### 3.9 — Sélecteur de thèmes (ThemeSwitcher)

5 thèmes disponibles :
1. **MATRIX** (défaut) : Bloomberg Terminal — vert néon sur noir
2. **CYBERPUNK** : Night City — rose/cyan sur violet
3. **MIDNIGHT** : Ocean Dark — or/bleu sur navy
4. **BLOOD MARKET** : War Room — orange sur noir
5. **GHOST** : Clean Light — indigo sur blanc

Le thème est sauvegardé dans `localStorage` (persiste entre les sessions).

---

## 4. Architecture technique

### Backend (Rust + Tokio + Actix-web)

```
                    ┌─────────────────────────────────┐
                    │         tokio::runtime           │
                    │  (runtime async multi-thread)    │
                    ├─────────────────────────────────┤
                    │                                 │
  tokio::spawn ──▶  │  start_watcher()               │
                    │  └─ loop { fetch + filter }     │
                    │     └─ sleep(10s).await          │
                    │                                 │
  tokio::spawn ──▶  │  start_network_watcher()       │
                    │  └─ loop { update stats }       │
                    │     └─ sleep(30s).await          │
                    │                                 │
  HttpServer    ──▶ │  actix-web handlers             │
                    │  ├─ GET  /api/opportunities      │
                    │  ├─ GET  /api/logs               │
                    │  ├─ POST /api/snipe/:addr        │
                    │  ├─ GET  /api/network            │
                    │  ├─ GET  /api/jito/config        │
                    │  ├─ PUT  /api/jito/config        │
                    │  ├─ POST /api/jupiter/quote      │
                    │  └─ GET  /api/snipe/history      │
                    └─────────────────────────────────┘
                                    │
                          Arc<RwLock/Mutex>
                                    │
                    ┌─────────────────────────────────┐
                    │          AppState               │
                    │  opportunities: Vec<Opportunity> │
                    │  logs:          Vec<LogEntry>    │
                    │  jito_config:   JitoConfig       │
                    │  network_stats: NetworkStats     │
                    │  snipe_history: Vec<SnipeHistory>│
                    └─────────────────────────────────┘
```

### Frontend (React + TypeScript + Vite)

```
  App.tsx (composant racine)
  ├── StatsHeader     (4 cartes statistiques)
  ├── NetworkBar      (métriques réseau Solana)     ← NOUVEAU
  ├── JitoPanel       (config bundles Jito)         ← NOUVEAU
  ├── Filter Bar      (filtres inline)
  ├── TokenRow[]      (liste des tokens)
  │   ├── RiskBadge   (score de risque)             ← NOUVEAU
  │   └── ExpandedPanel (détails + graphe)
  │       └── Risk Analysis (flags détaillés)       ← NOUVEAU
  ├── LogPanel        (terminal de logs)
  ├── ThemeSwitcher   (sélecteur de thème)
  └── TokenDetail     (page plein écran)
      └── Risk Analysis Panel                       ← NOUVEAU
```

### Communication Front ↔ Back

```
Frontend (port 3000)  ──── Vite Proxy ────▶  Backend (port 8080)
    fetch('/api/...')  ────────────────────▶  Actix-web handler
    JSON response      ◀────────────────────  HttpResponse::Ok().json(...)
```

Le **Vite Proxy** redirige toutes les requêtes `/api/*` vers le backend Rust. Le navigateur pense parler au même serveur (pas de problème CORS en dev).

---

## 5. Concepts Solana essentiels

### 5.1 — Le modèle de comptes

Solana utilise un **modèle de comptes** (pas de modèle UTXO comme Bitcoin) :

```
┌─────────────────────────────┐
│ Account (Compte Solana)     │
├─────────────────────────────┤
│ address:   7xKX...2d4f     │ ← Clé publique (32 bytes)
│ owner:     TokenProgram    │ ← Programme qui contrôle ce compte
│ lamports:  1000000         │ ← Solde en lamports (1 SOL = 10^9 lamports)
│ data:      [bytes...]      │ ← Données arbitraires (état du programme)
│ executable: false          │ ← Est-ce un programme ?
└─────────────────────────────┘
```

**Points clés :**
- Tout sur Solana est un **compte** : ton wallet, un token, un programme
- Chaque compte a un **owner** (le programme qui peut modifier ses données)
- Les **lamports** sont l'unité de base (comme les satoshi pour Bitcoin)
- **1 SOL = 1 000 000 000 lamports** (10^9)

### 5.2 — Les transactions

```
Transaction
├── Signatures[]      ← Le wallet signe avec sa clé privée
├── Message
│   ├── Header        ← Nombre de signers, readonly accounts
│   ├── Account Keys  ← Liste de tous les comptes impliqués
│   └── Instructions[]
│       ├── program_id  ← Quel programme exécuter
│       ├── accounts[]  ← Quels comptes passer au programme
│       └── data[]      ← Arguments de l'instruction
```

**En français :** Une transaction = "je veux exécuter cette instruction sur ces comptes, signée par mon wallet". Chaque instruction appelle un **programme** (smart contract) avec des paramètres.

### 5.3 — Les programmes (Smart Contracts)

Sur Solana, les smart contracts s'appellent **programmes**. Ils sont écrits en **Rust** et compilés en **BPF bytecode** (Berkeley Packet Filter).

- **SPL Token Program** : Le programme standard pour créer/gérer des tokens
- **System Program** : Transferts SOL, création de comptes
- **Associated Token Account Program** : Lie un wallet à un token

**Anchor Framework** : Un framework qui simplifie l'écriture de programmes Solana en Rust. Il gère automatiquement la sérialisation des comptes et la validation des contraintes.

### 5.4 — Les DEX (Exchanges Décentralisés)

Un DEX permet d'échanger des tokens sans intermédiaire central :
- **Raydium** : Le plus gros DEX sur Solana (AMM — Automated Market Maker)
- **Orca** : DEX avec des "whirlpools" (liquidité concentrée)
- **Meteora** : DEX avec des "dynamic vaults"
- **Phoenix** : Order book décentralisé

---

## 6. Jito Bundles — expliqué simplement

### C'est quoi un Bundle ?

Imagine une **file d'attente** pour les transactions Solana. Normalement, ta transaction attend son tour. Avec un **Jito Bundle**, tu payes un **pourboire** (tip) directement au validateur pour qu'il inclue ta transaction **en priorité** dans le prochain block.

```
Sans Jito :
  Transaction A  →  File d'attente  →  ???  →  Block (peut-être)

Avec Jito :
  Bundle { Tx A + Tip 0.001 SOL }  →  Block Engine  →  Validateur  →  Block (garanti)
```

### Pourquoi c'est important pour le sniping ?

Quand un nouveau token apparaît, des centaines de bots essaient d'acheter en premier. Celui qui arrive en premier dans le block achète au prix le plus bas. Avec Jito :

1. **Priorité** : Ton bundle est traité avant les transactions normales
2. **Atomicité** : Soit tout le bundle passe, soit rien (pas de partial execution)
3. **Anti-sandwich** : Personne ne peut insérer une transaction entre les tiennes

### Les Block Engines

Jito a des serveurs dans le monde entier. Tu envoies ton bundle au **Block Engine** le plus proche de toi :
- Amsterdam (EU) — idéal depuis Paris
- Frankfurt (EU)
- New York (US)
- Tokyo (JP)

### Le MEV (Maximal Extractable Value)

Le MEV c'est l'argent qu'on peut gagner en **réordonnant les transactions** dans un block. Exemples :
- **Front-running** : Acheter juste avant un gros achat (le prix monte)
- **Sandwich** : Acheter avant + vendre après un gros achat
- **Liquidation** : Liquider une position avant les autres

Jito permet d'extraire du MEV de manière "propre" (tips plutôt que spam réseau).

---

## 7. Jupiter — expliqué simplement

### C'est quoi ?

Jupiter est un **agrégateur de DEX** sur Solana. Au lieu de chercher toi-même le meilleur prix sur chaque DEX, Jupiter compare les prix **sur tous les DEX** et te donne la meilleure route.

```
Toi : "Je veux échanger 1 SOL contre du PEPE"

Jupiter cherche :
  Route 1 : SOL → PEPE sur Raydium      → 1,000,000 PEPE
  Route 2 : SOL → PEPE sur Orca          → 980,000 PEPE
  Route 3 : SOL → USDC → PEPE (multi-hop) → 1,020,000 PEPE  ← meilleure !

Jupiter retourne : Route 3 (multi-hop via USDC)
```

### Concepts clés

- **Quote** : Devis — combien de tokens tu obtiens pour un montant donné
- **Route Plan** : Le chemin exact (quels DEX, dans quel ordre)
- **Price Impact** : Combien ton achat fait bouger le prix (plus tu achètes, plus l'impact est grand)
- **Slippage** : La différence entre le prix affiché et le prix réel d'exécution
- **Multi-hop** : Passer par un token intermédiaire (SOL → USDC → TOKEN)

### En production

L'API Jupiter retourne les **instructions de transaction Solana** prêtes à signer. On les met dans un Jito Bundle pour les exécuter en priorité.

---

## 8. Priority Fees & Compute Units

### Compute Units (CU)

Chaque instruction Solana consomme des **Compute Units** (comme le "gas" sur Ethereum). Exemples :
- Transfer SOL : ~150 CU
- SPL Token Transfer : ~4,000 CU
- Swap sur Raydium : ~100,000 CU
- Max par transaction : **1,400,000 CU**

### Priority Fees

Ce sont des frais **additionnels** que tu payes pour être priorisé :

```
Coût = priority_fee (μL/CU) × compute_units

Exemple :
  priority_fee = 5,000 μL/CU
  compute_units = 200,000 CU
  coût = 5,000 × 200,000 = 1,000,000,000 μL = 0.001 SOL (~$0.14)
```

**μL** = micro-lamports. 1 lamport = 1,000,000 μL.

Plus le réseau est congestionné, plus il faut payer de priority fees pour que ta transaction soit incluse rapidement.

### SetComputeUnitLimit & SetComputeUnitPrice

En production, on ajoute ces deux instructions au début de chaque transaction :
1. `SetComputeUnitLimit(200_000)` — "ma tx ne dépassera pas 200K CU"
2. `SetComputeUnitPrice(5_000)` — "je paye 5000 μL par CU"

---

## 9. Concepts Rust utilisés

### 9.1 — Ownership & Borrow Checker

C'est LE concept central de Rust. Chaque valeur a un seul **propriétaire** (owner). Quand le propriétaire sort du scope, la valeur est libérée.

```rust
let s1 = String::from("hello"); // s1 est le propriétaire
let s2 = s1;                     // ownership transféré à s2
// println!("{}", s1);           // ❌ ERREUR : s1 n'est plus valide
println!("{}", s2);              // ✅ OK : s2 est le propriétaire
```

**Borrowing** (emprunter) :
```rust
let s1 = String::from("hello");
let len = calculate_length(&s1); // &s1 = référence (emprunt immutable)
println!("{} has length {}", s1, len); // ✅ s1 est toujours valide
```

### 9.2 — Arc<T> (Atomic Reference Counted)

Permet de **partager** une donnée entre plusieurs threads de manière thread-safe.

```rust
let data = Arc::new(vec![1, 2, 3]);
let data_clone = Arc::clone(&data); // On clone le POINTEUR, pas les données

// data et data_clone pointent vers le même Vec
// Le Vec sera libéré quand le dernier Arc est droppé
```

**Dans notre projet** : Les opportunités et les logs sont partagés entre le watcher (écrit) et les handlers HTTP (lisent). Sans Arc, Rust refuse de compiler car les threads ne peuvent pas partager de données.

### 9.3 — RwLock<T> (Reader-Writer Lock)

Permet N lecteurs simultanés OU 1 écrivain exclusif :

```rust
let data = Arc::new(RwLock::new(vec![]));

// Lecture (plusieurs threads peuvent lire en même temps)
let guard = data.read().unwrap();
println!("{:?}", *guard);
// guard est droppé ici → verrou libéré

// Écriture (un seul thread peut écrire)
let mut guard = data.write().unwrap();
guard.push(42);
// guard est droppé ici → verrou libéré
```

**Pourquoi RwLock et pas Mutex ?** : Le frontend lit les données toutes les 3 secondes, mais le watcher n'écrit que toutes les 10 secondes. Avec un Mutex, chaque lecture bloquerait les autres lectures. Avec un RwLock, plusieurs lectures sont simultanées → plus performant.

### 9.4 — async/await + Tokio

Rust utilise un modèle de concurrence **coopérative** :

```rust
async fn fetch_data() -> String {
    let response = reqwest::get("https://api.example.com")
        .await;    // ← Suspend la tâche, libère le thread
    // Le thread peut exécuter d'autres tâches en attendant la réponse HTTP
    response.text().await
}
```

**Tokio** est le runtime qui gère ces tâches async. `tokio::spawn` lance une tâche indépendante (comme une goroutine en Go).

### 9.5 — Serde (Serialization/Deserialization)

Transforme automatiquement des structs Rust en JSON et vice-versa :

```rust
#[derive(Serialize, Deserialize)]
struct User {
    name: String,
    age: u32,
}

let user = User { name: "Alice".into(), age: 30 };
let json = serde_json::to_string(&user)?; // → {"name":"Alice","age":30}
let user2: User = serde_json::from_str(&json)?; // JSON → struct
```

### 9.6 — Pattern Matching

Rust force à gérer TOUS les cas possibles :

```rust
match result {
    Ok(value) => println!("Success: {}", value),
    Err(error) => println!("Error: {}", error),
}
// Le compilateur refuse de compiler si un cas manque
```

---

## 10. Concepts React/TypeScript utilisés

### 10.1 — Hooks principaux

```typescript
// State (données qui changent et déclenchent un re-render)
const [tokens, setTokens] = useState<Token[]>([])

// Effect (effets de bord : fetch, timers, subscriptions)
useEffect(() => {
  const id = setInterval(fetchData, 3000)
  return () => clearInterval(id)  // Cleanup au démontage
}, [fetchData])  // Se re-exécute si fetchData change

// Callback (mémorise une fonction pour éviter les re-renders inutiles)
const handleClick = useCallback(() => { ... }, [])

// Memo (mémorise un calcul coûteux)
const filtered = useMemo(() => tokens.filter(...), [tokens, filter])
```

### 10.2 — TypeScript strict mode

```typescript
// Interfaces (contrat de données)
interface Opportunity {
  token_name: string      // DOIT être une string
  price_usd: number       // DOIT être un nombre
  status: 'DETECTED' | 'SNIPED'  // DOIT être une de ces valeurs
  risk_score: RiskScore | null    // Peut être null
}
```

### 10.3 — CSS avec Tailwind + CSS Custom Properties

Les thèmes utilisent des variables CSS au format RGB :
```css
:root { --c-accent: 0 255 136; }  /* RGB sans virgules */
```
Tailwind les consomme via :
```
bg-terminal-green → rgb(var(--c-accent) / <alpha-value>)
bg-terminal-green/20 → rgb(0 255 136 / 0.2)
```

---

## 11. Questions d'entretien probables + réponses

### Q1 : "Peux-tu nous expliquer l'architecture de ton projet ?"

**Réponse :**
> "Le projet a une architecture client-serveur classique. Le backend en Rust utilise Tokio comme runtime async et Actix-web comme framework HTTP. Il y a deux tâches de fond qui tournent en parallèle du serveur : le watcher qui scrape DexScreener toutes les 10 secondes, et le network watcher qui simule les métriques réseau Solana. L'état est partagé entre les threads via Arc<RwLock> pour les données en lecture fréquente (opportunités) et Arc<Mutex> pour les logs en écriture fréquente. Le frontend en React/TypeScript poll l'API toutes les 3 secondes et affiche un dashboard temps réel avec graphiques, filtres et un panneau de configuration Jito."

### Q2 : "Pourquoi Rust pour ce projet ?"

**Réponse :**
> "Rust est le langage natif de Solana — tous les programmes on-chain sont écrits en Rust. C'est aussi excellent pour les applications à faible latence grâce à son absence de garbage collector et sa gestion mémoire déterministe. Pour un outil de trading, la latence est critique : chaque milliseconde compte pour être le premier à exécuter un trade. De plus, Rust garantit la thread-safety à la compilation, ce qui évite les data races dans un système concurrent comme le nôtre."

### Q3 : "Comment fonctionne un Jito Bundle ?"

**Réponse :**
> "Un Jito Bundle est un ensemble de transactions (1 à 5) envoyées directement à un validateur Jito via un Block Engine. Le bundle est atomique : soit toutes les transactions sont exécutées dans l'ordre, soit aucune. On y inclut un 'tip' — un transfert SOL vers un wallet du validateur — qui sert de pourboire pour garantir l'inclusion prioritaire. C'est l'équivalent de Flashbots sur Ethereum. L'avantage pour le sniping c'est la protection anti-sandwich : personne ne peut insérer une transaction entre les nôtres."

### Q4 : "Qu'est-ce que le slippage ?"

**Réponse :**
> "Le slippage c'est la différence entre le prix qu'on voit au moment de créer la transaction et le prix réel d'exécution. Si je demande d'acheter un token à $0.001 avec 1% de slippage, la transaction échouera si le prix a bougé au-delà de $0.00101 au moment de l'exécution. C'est un paramètre de sécurité : sans slippage limit, un bot pourrait front-runner notre transaction et nous faire acheter à un prix beaucoup plus élevé."

### Q5 : "Explique-nous Arc<RwLock<Vec<T>>> dans ton code"

**Réponse :**
> "C'est un pattern de partage de données thread-safe en Rust. Vec<T> c'est notre vecteur de données. RwLock l'enveloppe pour permettre plusieurs lecteurs simultanés OU un seul écrivain à la fois — idéal car le frontend lit souvent mais le watcher écrit rarement. Arc est un compteur de références atomique qui permet à plusieurs threads de posséder un pointeur vers le même RwLock. Quand le dernier Arc est droppé, la mémoire est automatiquement libérée. C'est le pattern standard en Rust pour le shared state multi-thread."

### Q6 : "Comment tu détectes les honeypots / rug pulls ?"

**Réponse :**
> "J'ai implémenté un système de scoring sur 100 points qui analyse plusieurs signaux : la liquidité de la pool (trop faible = suspect), le volume de trading (pas de volume = possible honeypot), le ratio buy/sell (que des achats et aucune vente = impossible de vendre = honeypot), l'âge de la pool (très récente = plus risqué), et la FDV (trop élevée par rapport au market cap = red flag). En production, on ajouterait l'analyse de la mint authority, la freeze authority, la concentration des holders, et si la liquidité est lockée."

### Q7 : "C'est quoi la différence entre Priority Fees et Jito Tips ?"

**Réponse :**
> "Les priority fees sont le mécanisme natif de Solana : tu payes plus de micro-lamports par Compute Unit pour que ta transaction soit priorisée par le scheduler du leader. Les Jito Tips sont un mécanisme séparé : tu inclus un transfert SOL direct au validateur Jito comme pourboire. La différence c'est que les priority fees passent par le protocol standard tandis que les tips Jito garantissent l'inclusion dans le prochain block du validateur. En pratique, on utilise les deux : priority fees + Jito tip pour maximiser les chances."

### Q8 : "C'est quoi Anchor Framework ?"

**Réponse :**
> "Anchor est un framework pour écrire des programmes on-chain Solana en Rust. Il simplifie énormément le code en générant automatiquement la sérialisation/désérialisation des comptes, la validation des contraintes (ex: vérifier que le signer est bien le owner), et les interfaces IDL pour le frontend. C'est l'équivalent de Hardhat/Foundry pour Ethereum mais pour Solana. Dans le cadre de ce poste, si on développe des programmes on-chain, Anchor permettrait de coder plus vite et de manière plus sûre."

### Q9 : "Pourquoi tu utilises polling (3s) au lieu de WebSocket ?"

**Réponse :**
> "Pour le PoC, le polling HTTP est plus simple à implémenter et suffisant pour un dashboard avec un nombre limité d'utilisateurs. En production, je migrerais vers WebSocket (via actix-web-actors ou tokio-tungstenite) pour réduire la latence et le nombre de requêtes. Le watcher pourrait push directement les nouvelles opportunités aux clients connectés plutôt que d'attendre leur poll. C'est prévu dans la roadmap."

### Q10 : "Qu'est-ce que tu apporterais au projet si tu étais embauché ?"

**Réponse :**
> "Premièrement, je transformerais la simulation en vrai moteur de transactions : intégration du SDK Solana pour construire les VersionedTransactions, intégration du SDK Jito pour la soumission réelle de bundles, et Jupiter pour le routing de swaps. Deuxièmement, j'ajouterais la persistance avec PostgreSQL pour l'historique et l'analytics. Troisièmement, je renforcerais la sécurité : gestion sécurisée des keypairs, rate limiting, et audit des transactions. Je suis motivé pour apprendre rapidement ce qui me manque et je suis autonome dans ma montée en compétences."

---

## 12. Comment parler du projet en entretien

### Le pitch (30 secondes)

> "J'ai développé un outil d'infrastructure de transactions Solana avec un backend Rust async (Tokio + Actix-web) et un frontend React/TypeScript. Il monitore en temps réel les nouvelles pools sur Solana, analyse les risques de chaque token, et simule des transactions via Jito Bundles. Le dashboard affiche les métriques réseau Solana, permet de configurer les paramètres Jito (tip, block engine, slippage) et intègre un simulateur de swap Jupiter. C'est un PoC qui démontre ma compréhension de l'infrastructure blockchain Solana."

### Ce qui montre ta valeur technique

1. **Rust** : "J'utilise Arc, RwLock, Mutex, async/await, Tokio, pattern matching, Serde — les patterns essentiels pour du Rust en production"
2. **Architecture** : "Pattern producteur-consommateur thread-safe avec état partagé, API REST, polling temps réel"
3. **Solana** : "Je comprends le modèle de comptes, les transactions, les priority fees, Jito, Jupiter, les DEX"
4. **Frontend** : "React hooks, TypeScript strict, CSS custom properties pour les thèmes, Recharts pour la data viz"
5. **DevOps** : "Cargo + Vite, proxy de dev, CORS, structured logging"

### Ce que tu peux dire sur ta progression

> "Ce projet m'a permis de comprendre concrètement l'infrastructure Solana. Je ne suis pas encore expert en Rust ou Solana, mais j'apprends vite et de manière autonome. Ce PoC montre que je suis capable de construire un système complet, de comprendre les concepts techniques, et de les implémenter. Je suis prêt à approfondir Anchor, le SDK Solana natif, et les intégrations Jito/Jupiter en production."

### Points forts à souligner

- **Autonomie** : "J'ai développé ce projet seul, du backend à la production"
- **Rapidité d'apprentissage** : "J'ai appris Rust et Solana en construisant ce projet"
- **Compréhension produit** : "Je ne fais pas que du code, je comprends le use case business — pourquoi le sniping nécessite de la faible latence, pourquoi les bundles Jito sont essentiels"
- **Outils IA** : "J'utilise Claude Code et Windsurf pour accélérer mes cycles de développement"

---

## Glossaire rapide

| Terme | Définition simple |
|-------|-------------------|
| **AMM** | Automated Market Maker — algorithme qui fixe le prix automatiquement sur un DEX |
| **Block Engine** | Serveur Jito qui reçoit les bundles et les transmet aux validateurs |
| **BPF** | Berkeley Packet Filter — format de compilation des programmes Solana |
| **Bundle** | Groupe de transactions atomique soumis via Jito |
| **CPI** | Cross-Program Invocation — un programme qui appelle un autre programme |
| **CU** | Compute Unit — unité de mesure du coût de calcul d'une instruction |
| **DEX** | Decentralized Exchange — plateforme d'échange sans intermédiaire |
| **FDV** | Fully Diluted Valuation — capitalisation si tous les tokens étaient en circulation |
| **Honeypot** | Token arnaque impossible à revendre |
| **IDL** | Interface Definition Language — description des instructions d'un programme Anchor |
| **Lamport** | Plus petite unité de SOL (1 SOL = 10^9 lamports) |
| **MEV** | Maximal Extractable Value — profit extractible par le réordonnancement de transactions |
| **Mint** | L'adresse d'un type de token SPL (équivalent de l'adresse du contrat ERC-20) |
| **Priority Fee** | Frais additionnels pour être priorisé dans un block |
| **Rug Pull** | Arnaque où le créateur retire toute la liquidité |
| **Sandwich** | Attaque : acheter avant + vendre après une grosse transaction |
| **Slippage** | Différence entre prix attendu et prix d'exécution |
| **Slot** | Intervalle de temps (~400ms) pendant lequel un validateur produit un block |
| **SPL Token** | Standard de tokens sur Solana (équivalent ERC-20 sur Ethereum) |
| **Tip** | Pourboire SOL payé au validateur Jito pour garantir l'inclusion |
| **TPS** | Transactions Per Second — débit du réseau |
| **Versioned Transaction** | Format de transaction Solana supportant les "address lookup tables" |
