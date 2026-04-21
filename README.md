# MilestonePay

> Anti-ghosting milestone escrow for freelancers — get paid automatically, even if the client disappears.

**Live App:** https://milestone-pay-psi.vercel.app

---

## About

MilestonePay is a decentralized escrow platform built on the Stellar testnet that protects freelancers from payment ghosting. Clients lock XLM into a Soroban smart contract per milestone. If the client fails to review or dispute within the agreed window, funds automatically release to the freelancer — no trust required.

Built for freelancers across SEA who source clients informally (Facebook groups, Discord, Telegram) with no payment protection. The smart contract is the escrow. The deadline is the enforcer.

---

## Problem

A freelance designer in Quezon City completes project milestones for clients found on Facebook or Discord, but doesn't get paid when the client becomes unresponsive — losing several days of work with no protection or legal recourse.

## Solution

Clients lock XLM per milestone into a Soroban smart contract. If they fail to confirm or dispute within a set time window, the funds automatically release to the freelancer — guaranteeing staged payment without relying on trust.

---

## Stellar Features Used

| Feature | Purpose |
|---|---|
| **XLM Transfers** | Payment currency. Clients lock XLM; freelancers receive XLM. |
| **Soroban Smart Contracts** | Core escrow logic: fund locking, deadline tracking, auto-release, dispute handling — all enforced on-chain. |
| **Freighter Wallet** | Browser extension wallet used for signing all transactions. |

---

## How the App Works

### User Roles

| Role | Description |
|---|---|
| **Client** | Posts projects, locks XLM into escrow, reviews milestone submissions |
| **Freelancer** | Accepts projects, submits work, receives automatic payments |
| **Admin** | Resolves disputes — can release funds to either party or refund and close the project |

---

### Client Flow

1. **Connect** — Connect Freighter wallet. Set your display name and select "Client" role.
2. **Create Project** — Enter project name, freelancer's Stellar wallet address, project deadline, and define milestones (title, description, XLM amount each). Set the auto-release window (24 / 48 / 72 hours). Lock the total XLM in a single on-chain transaction.
3. **Dashboard** — View all your projects with status filters (Not Started / In Progress / For Review / For Revision / Done). See the transaction history sidebar.
4. **Project Page** — See milestones grouped by status. When a freelancer submits work, you receive a proof link and timer.
5. **Review a Milestone** — Three options:
   - **Approve & Release** — Immediately pays the freelancer.
   - **Request Revision** — Records a revision fee (20 / 35 / 50% of the milestone amount), puts the milestone back to "Revision" status so the freelancer can re-submit.
   - **Dispute** — Freezes funds, notifies admin to arbitrate.
6. **Auto-Release** — If you do nothing before the window expires, the freelancer can claim payment automatically.
7. **Withdraw Project** — If the freelancer hasn't started any milestone yet, you can withdraw the project and get a full XLM refund.

---

### Freelancer Flow

1. **Connect** — Connect Freighter wallet. Set your display name and select "Freelancer" role.
2. **Dashboard** — Projects assigned to your wallet appear automatically. Filter and search across all projects.
3. **Project Page** — See all milestones. For each "Not Started" milestone, click **Start Work**.
4. **Submit Milestone** — When done, click **Submit for Review**. Attach a delivery link (Figma, GitHub, Drive) or upload a file. This calls `mark_complete` on-chain and starts the client's review countdown.
5. **Revision** — If the client requests revision, the milestone moves back to "Revision" with their feedback. Re-submit when changes are done (no extra on-chain call needed — `confirm_delivery` still works).
6. **Claim Payment** — If the review timer expires and the client didn't act, click **Claim Payment** to auto-release funds.
7. **Dispute** — If you believe the client is acting in bad faith (e.g. timer expiring with no response and they blocked you), raise a dispute.

---

### Admin Flow

1. **Connect** — Connect with the admin Freighter wallet. You're automatically routed to the Admin Panel.
2. **Dispute Queue** — See all open disputes with reason, evidence links, and wallet addresses.
3. **Resolve** — Two options:
   - **Release to Freelancer** — Calls `resolve_dispute` on-chain, releases funds to freelancer, milestone closes.
   - **Refund & Cancel Project** — Calls `admin_cancel_milestone` for all non-released milestones, deletes the project from the DB, and refunds all locked XLM to the client.

---

## Milestone Status Flow

```
created → progress → review → released   (happy path)
                   ↓
                revision → review → released   (client requests changes)
                   ↓
                disputed → [admin resolves] → released / refunded
```

---

## Contract Functions

| Function | Who Calls It | What It Does |
|---|---|---|
| `initialize()` | Deployer | Sets admin address for dispute resolution |
| `create_project_batch()` | Client | Locks total XLM for all milestones in one transaction |
| `create_milestone()` | Client | Locks XLM for a single milestone |
| `mark_complete()` | Freelancer | Signals work delivered, starts client review countdown |
| `confirm_delivery()` | Client | Approves work and immediately releases funds to freelancer |
| `claim_payment()` | Freelancer | Auto-releases funds after review deadline passes |
| `request_revision()` | Client | Resets milestone to revision state (fee tracked off-chain) |
| `raise_dispute()` | Client or Freelancer | Freezes funds, flags for admin review |
| `resolve_dispute()` | Admin only | Releases funds to winner (client or freelancer) |
| `admin_cancel_milestone()` | Admin only | Refunds client and removes milestone (used for full project cancellation) |
| `cancel_milestone()` | Client | Full refund if freelancer hasn't started yet |
| `get_milestone()` | Anyone | Returns full on-chain state for a milestone |

---

## Test Accounts (Stellar Testnet)

| Role | Wallet Address |
|---|---|
| **Client** | `GDRJD2K6XUOSLM5VMGSYHE52S7PMK5CC5VSIV...` (Alfred) |
| **Freelancer** | Any funded Stellar testnet wallet |
| **Admin** | `GDEITKZRZOSOXPNLS2XF5ULAS7RBEQWULVX5NG6H3BSWQGXUS3DT5XB2` |

> Fund testnet wallets at: https://laboratory.stellar.org/#account-creator?network=test

---

## Deployed Contract

| Item | Value |
|---|---|
| **Contract ID** | `CAI3WA4XX3U2PHFFTRUP53ULXOBUKP7HP3G2FPWZZSONNQOAMEVMNAYG` |
| **Network** | Stellar Testnet |
| **Explorer** | https://stellar.expert/explorer/testnet/contract/CAI3WA4XX3U2PHFFTRUP53ULXOBUKP7HP3G2FPWZZSONNQOAMEVMNAYG |

---

## Prerequisites

- **Rust** — install via [rustup.rs](https://rustup.rs)
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- **Stellar CLI** — v22.0.0 or later
  ```bash
  cargo install --locked stellar-cli --version 22.0.0
  ```
- **Freighter Wallet** — [freighter.app](https://freighter.app) browser extension
- **Stellar Testnet account** with funded XLM

---

## Build

```bash
cd contract
cargo build --target wasm32-unknown-unknown --release
```

Output: `target/wasm32-unknown-unknown/release/milestone_pay.wasm`

---

## Test

```bash
cd contract
cargo test
```

Expected output:
```
test tests::test_happy_path_full_flow ... ok
test tests::test_claim_before_deadline_is_rejected ... ok
test tests::test_state_after_create_milestone ... ok

test result: ok. 3 passed; 0 failed
```

---

## Deploy to Testnet

```bash
# 1. Configure Stellar testnet network
stellar network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

# 2. Generate and fund a deployer identity
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet

# 3. Deploy the contract
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/milestone_pay.wasm \
  --source deployer \
  --network testnet

# 4. Initialize the contract (sets admin wallet)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize \
  --admin <ADMIN_WALLET>
```

---

## Frontend Setup

```bash
cd frontend
npm install

# Create .env.local with:
# NEXT_PUBLIC_CONTRACT_ID=<your_contract_id>
# NEXT_PUBLIC_ADMIN_WALLET=<admin_stellar_wallet>
# NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
# NEXT_PUBLIC_USDC_TOKEN=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
# NEXT_PUBLIC_SUPABASE_URL=<your_supabase_url>
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_supabase_anon_key>

npm run dev
```

---

## Sample CLI Invocations

Replace `<CONTRACT_ID>`, `<CLIENT>`, `<FREELANCER>`, `<ADMIN>`, `<TOKEN_ID>` with real values.

### Create a project batch (client locks XLM for all milestones)

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <CLIENT> \
  --network testnet \
  -- create_project_batch \
  --client <CLIENT> \
  --freelancer <FREELANCER> \
  --token <TOKEN_ID> \
  --milestone_ids '[1, 2]' \
  --amounts '[50000000, 50000000]' \
  --deadline 1800000000
```

### Mark milestone complete (freelancer)

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <FREELANCER> \
  --network testnet \
  -- mark_complete \
  --project_id 1 \
  --freelancer <FREELANCER>
```

### Confirm delivery (client approves)

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <CLIENT> \
  --network testnet \
  -- confirm_delivery \
  --project_id 1 \
  --client <CLIENT>
```

### Claim payment (freelancer, after deadline)

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <FREELANCER> \
  --network testnet \
  -- claim_payment \
  --project_id 1 \
  --freelancer <FREELANCER>
```

### Raise a dispute

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <FREELANCER> \
  --network testnet \
  -- raise_dispute \
  --project_id 1 \
  --caller <FREELANCER>
```

### Resolve dispute (admin only)

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN> \
  --network testnet \
  -- resolve_dispute \
  --project_id 1 \
  --admin <ADMIN> \
  --winner <FREELANCER>
```

### Read milestone state

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_milestone \
  --project_id 1
```

---

## Reference

- Deploy guide: https://github.com/armlynobinguar/Stellar-Bootcamp-2026
- Soroban docs: https://developers.stellar.org/docs/smart-contracts
- Contract explorer: https://stellar.expert/explorer/testnet/contract/CAI3WA4XX3U2PHFFTRUP53ULXOBUKP7HP3G2FPWZZSONNQOAMEVMNAYG

---

## License

MIT License

Copyright (c) 2026 MilestonePay

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
