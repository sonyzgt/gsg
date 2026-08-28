# 🏹 PONSEye — Real-Time X/Twitter CA Sniper & DEX Trading Engine

<div align="center">

![PONSEye Banner](public/icon.png)

**Autonomous, Sub-Millisecond Twitter Contract Address (CA) Detection & DEX Execution on Robinhood Chain**

[![Network](https://img.shields.io/badge/Network-Robinhood%20Chain%20(4663)-red)](https://robinhoodchain.blockscout.com/)
[![DEX Support](https://img.shields.io/badge/DEX-Pons%20V2%20%7C%20SushiSwap%20V3-emerald)](#smart-contracts--dex-routing)
[![Auth](https://img.shields.io/badge/Auth-Privy%20(Twitter%20%2B%20Embedded%20Wallet)-blue)](https://privy.io)
[![Telegram](https://img.shields.io/badge/Telegram-Command%20Center%20Integration-blue?logo=telegram)](#-key-features)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## 📖 Overview

**PONSEye** is a high-speed trading terminal and autonomous sniper engine built specifically for **Robinhood Chain (Chain ID: 4663)**. It connects Twitter/X influencer alpha feeds directly to on-chain liquidity curves, enabling instantaneous token discovery, verification, and automated DEX execution with sub-millisecond latency.

---

## ✨ Key Features

- 🎯 **Target Account Monitoring**: Add any Twitter/X handle to monitor their timeline and replies in real-time.
- ⚡ **Sub-Millisecond CA Detector**: High-speed regex parser validates EVM contract addresses (`0x[a-fA-F0-9]{40}`) the exact moment a tweet is published.
- 🏹 **Multi-DEX Autonomous Execution**:
  - **Pons V2 Bonding Curves**: Direct execution on the bonding curve smart contract with zero confirmation friction.
  - **SushiSwap V3 / Uniswap V3**: Multi-hop swap router with atomic WETH wrapping and unwrapping.
- 🔐 **100% Non-Custodial Privy Wallet**: Embedded EVM wallet linked directly to Twitter auth. Private keys remain strictly client-side.
- 🤖 **Telegram Bot Command Center (Customizable per User)**:
  - `/balance`: Check real-time native ETH balance with an interactive **🔄 Refresh Balance** button.
  - `/add <username> [amount]`: Remotely add or update sniper targets with live bi-directional sync to the web UI.
  - `/remove <username>` / `/del <username>`: Delete targets remotely.
  - `/targets`: View all active monitored targets and buy limits.
  - `/wallet`: View connected wallet address with direct Blockscout explorer links.
  - `/status`: Check sniper engine health and real-time polling status.
  - **Instant Alerts**: Telegram push notifications for CA detections, buy executions, and sell orders with direct block explorer links.
- 📱 **Fully Mobile-Responsive**: Beautiful cyberpunk UI optimized for smartphones, tablets, and desktop workstations.

---

## 🛠️ How It Works

```
┌─────────────────┐       ┌─────────────────┐       ┌──────────────────────┐
│  Target Tweets  │ ────> │ Regex CA Parser │ ────> │ Multi-DEX Auto-Snipe │
│ (Twitter API v2)│       │ (Sub-Millisecond│       │ (Pons V2 / Sushi V3) │
└─────────────────┘       └─────────────────┘       └──────────────────────┘
                                                               │
                                                               ▼
┌─────────────────┐       ┌─────────────────┐       ┌──────────────────────┐
│ Telegram Alerts │ <──── │ Live UI Feed &  │ <──── │ Non-Custodial Privy  │
│  & Bot Commands │       │ Portfolio Sync  │       │    Embedded Wallet   │
└─────────────────┘       └─────────────────┘       └──────────────────────┘
```

1. **Step 01 — Twitter OAuth & Embedded Wallet**: Users log in using Twitter via Privy. A secure, non-custodial EVM wallet on Robinhood Chain is automatically generated.
2. **Step 02 — Real-Time Post Ingestion**: The engine streams latest posts and replies from monitored targets.
3. **Step 03 — CA Extraction & Verification**: Regex verifies any contract address format and cross-checks network validity.
4. **Step 04 — Instant DEX Swap**: The engine automatically detects whether the token is on a **Pons V2 Bonding Curve** or **SushiSwap V3 pool**, routing the trade directly on-chain.
5. **Step 05 — Portfolio Auto-Discovery**: Newly acquired tokens automatically appear in the user's Token Holdings with live price charts and 1-click Sell options.
6. **Step 06 — Telegram Command Center**: Receive instant alerts and control sniper targets remotely from your smartphone.

---

## 🌐 Network Specifications

| Parameter | Details |
|---|---|
| **Network Name** | Robinhood Chain Mainnet |
| **Chain ID** | `4663` |
| **Native Currency** | Ether (`ETH`) |
| **RPC Endpoint** | `https://robinhood-rpc.publicnode.com` |
| **Block Explorer** | `https://robinhoodchain.blockscout.com` |

---

## 📜 Smart Contracts & DEX Routing

- **Pons V2 Factory**: `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e`
- **Pons Meme Hook**: `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044`
- **SushiSwap V3 Swap Router**: `0x1e406484F1F204b23cE84B9901C0171a738fd406`
- **Wrapped Ether (WETH)**: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`
- **Global Dollar (USDG)**: `0x5fc5360d0400a0fd4f2af552add042d716f1d168`

---

## 🚀 Quick Start & Installation

### 1. Clone the repository

```bash
git clone https://github.com/ponseye/ponseye.git
cd ponseye
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env.local` file based on `.env.example`:

```bash
cp .env.example .env.local
```

Fill in your API keys:
```env
NEXT_PUBLIC_PRIVY_APP_ID="your_privy_app_id"
TWITTER_BEARER_TOKEN="your_twitter_api_bearer_token"
NEXT_PUBLIC_DEFAULT_BOT_TOKEN="your_telegram_bot_token"
NEXT_PUBLIC_DEFAULT_BOT_USERNAME="your_bot_username"
```

### 4. Run development server

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

### 5. Build for production

```bash
npm run build
npm run start
```

---

## 📁 Project Structure

```
├── app/
│   ├── api/
│   │   ├── balance/              # RPC-cached native balance endpoint
│   │   ├── telegram/             # Telegram command center & webhook polling
│   │   ├── token-price/          # Multi-DEX price resolver (Pons V2, Sushi, Gecko)
│   │   ├── tokens/               # Auto-discovery on-chain ERC20 token balances
│   │   └── twitter/              # Twitter timeline ingestion & user resolution
│   ├── dashboard/                # Main trading & sniper terminal
│   ├── how-it-works/             # Visual architecture & documentation page
│   ├── layout.tsx                # Global layout with Privy & Toast providers
│   └── page.tsx                  # Cyberpunk landing page & Twitter OAuth login
├── components/
│   ├── dashboard/                # Twitter feed, CA detection, target manager
│   ├── how-it-works/             # Interactive flow diagrams & walkthrough modals
│   ├── landing/                  # Hero animations & feature highlights
│   ├── telegram/                 # Telegram configuration modal
│   ├── ui/                       # Reusable buttons, cards, modals
│   └── wallet/                   # Non-custodial wallet card, Swap, Send, Receive
├── hooks/
│   ├── useSniper.ts              # Auto-sniper state machine & DEX execution
│   ├── useTelegram.ts            # Telegram bot bridge & bi-directional sync
│   ├── useTokens.ts              # Token portfolio state & live balances
│   └── useWallet.ts              # Privy embedded wallet & viem client
├── lib/
│   ├── chains.ts                 # Robinhood Chain viem definition
│   ├── pons-v2.ts                # Pons V2 bonding curve & pool ID resolution
│   ├── priceCache.ts             # In-memory token price cache
│   ├── sniper.ts                 # Regex CA parser & target sanitization
│   └── telegram.ts               # Telegram HTML formatters & inline keyboards
└── README.md
```

---

## 🔒 Security & Privacy

- **Non-Custodial**: Neither PONSEye nor any backend server ever has custody of your private keys or funds.
- **Isolated State**: Target lists, auto-buy limits, and trade history are isolated per user in secure local storage.
- **Strict Idempotency**: Built-in in-memory locks and persistent transaction tracking guarantee exactly-once execution per tweet.

---

## 📄 License

MIT License. Built with ❤️ for the Robinhood Chain ecosystem.
