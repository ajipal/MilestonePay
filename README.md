# MilestonePay# MilestonePay

> Anti-ghosting milestone escrow for freelancers — get paid automatically, even if the client disappears.

---

## Problem

A freelance designer in Quezon City completes project milestones for clients found on Facebook or Discord, but doesn't get paid when the client becomes unresponsive — losing several days of work with no protection or legal recourse.

## Solution

Clients lock USDC per milestone into a Soroban smart contract. If they fail to confirm or dispute within a set time window, the funds automatically release to the freelancer — guaranteeing staged payment without relying on trust.

---

## Stellar Features Used

| Feature | Purpose |
|---|---|
| **USDC Transfers** | Stable payment currency. Clients lock USDC; freelancers receive USDC. No volatility risk. |
| **Soroban Smart Contracts** | Core escrow logic: fund locking, deadline tracking, auto-release, dispute handling — all enforced on-chain. |

---

## Vision & Purpose

Millions of freelancers across SEA source clients informally — Facebook groups, Discord, Telegram — with no payment protection. MilestonePay removes trust as a dependency. The smart contract is the escrow. The deadline is the enforcer. The freelancer always gets paid.

---

## Contract Functions

| Function | Who Calls It | What It Does |
|---|---|---|
| `initialize()` | Deployer | Sets admin address for dispute resolution |
| `create_milestone()` | Client | Locks USDC, sets freelancer address and deadline |
| `mark_complete()` | Freelancer | Signals work delivered, starts countdown |
| `claim_payment()` | Freelancer | Releases USDC after deadline passes |
| `raise_dispute()` | Client or Freelancer | Pauses auto-release, freezes funds |
| `resolve_dispute()` | Admin only | Releases funds to the winning party |
| `get_milestone()` | Anyone | Returns full on-chain state for a project |

---

## Suggested MVP Timeline

| Day | Task |
|---|---|
| Day 1–2 | Build Soroban contract: all 5 functions + tests |
| Day 3–4 | Build frontend: wallet connect, project creation, freelancer dashboard |
| Day 5 | Connect frontend to deployed contract on Stellar testnet |
| Day 6 | UI polish: countdown timer, status indicators, dispute modal |
| Day 7 | Practice pitch, record demo video, finalize submission |

---

## Prerequisites

- **Rust** — install via [rustup.rs](https://rustup.rs)
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- **Soroban CLI** — v22.0.0 or later
  ```bash
  cargo install --locked soroban-cli --version 22.0.0
  ```
- **Stellar Testnet account** with funded XLM for fees

---

## Build

```bash
soroban contract build
```

Output: `target/wasm32-unknown-unknown/release/milestone_pay.wasm`

---

## Test

```bash
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
soroban network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

# 2. Generate and fund a deployer identity
soroban keys generate deployer --network testnet
soroban keys fund deployer --network testnet

# 3. Deploy the contract
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/milestone_pay.wasm \
  --source deployer \
  --network testnet
```

Save the returned contract ID — you'll need it for all CLI invocations below.

---

## Sample CLI Invocations

Replace `<CONTRACT_ID>`, `<CLIENT>`, `<FREELANCER>`, `<ADMIN>`, `<TOKEN_ID>` with real values.

### Initialize contract

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize \
  --admin <ADMIN>
```

### Create a milestone (client locks $50 USDC)

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <CLIENT> \
  --network testnet \
  -- create_milestone \
  --project_id 1 \
  --client <CLIENT> \
  --freelancer <FREELANCER> \
  --token <TOKEN_ID> \
  --amount 50000000 \
  --deadline 1800000000
```

### Mark milestone complete (freelancer)

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <FREELANCER> \
  --network testnet \
  -- mark_complete \
  --project_id 1 \
  --freelancer <FREELANCER>
```

### Claim payment (freelancer, after deadline)

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <FREELANCER> \
  --network testnet \
  -- claim_payment \
  --project_id 1 \
  --freelancer <FREELANCER>
```

### Raise a dispute

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <FREELANCER> \
  --network testnet \
  -- raise_dispute \
  --project_id 1 \
  --caller <FREELANCER>
```

### Resolve dispute (admin only)

```bash
soroban contract invoke \
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
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_milestone \
  --project_id 1
```

---

## Reference

- Deploy guide: https://github.com/armlynobinguar/Stellar-Bootcamp-2026
- Full-stack example: https://github.com/armlynobinguar/community-treasury
- Soroban docs: https://developers.stellar.org/docs/smart-contracts

---

## License

MIT License

Copyright (c) 2026 MilestonePay

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.