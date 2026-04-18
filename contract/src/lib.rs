#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token, symbol_short,
    Address, Env,
};

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// Each milestone is stored under a unique project_id (u64).
// We use a single DataKey enum to namespace all contract storage.

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Milestone(u64),   // stores MilestoneData for a given project_id
    Admin,            // stores the admin address for dispute resolution
}

// ─── DATA STRUCTS ──────────────────────────────────────────────────────────────
// MilestoneData holds all on-chain state for a single milestone escrow.

#[contracttype]
#[derive(Clone)]
pub struct MilestoneData {
    pub client:     Address,  // wallet that locked the funds
    pub freelancer: Address,  // wallet that receives payment
    pub amount:     i128,     // USDC amount in stroops (base units)
    pub token:      Address,  // USDC token contract address
    pub deadline:   u64,      // unix timestamp after which funds auto-release
    pub completed:  bool,     // freelancer has marked milestone as done
    pub released:   bool,     // funds have been released
    pub disputed:   bool,     // dispute has been raised; auto-release is paused
}

// ─── CONTRACT ──────────────────────────────────────────────────────────────────

#[contract]
pub struct MilestonePayContract;

#[contractimpl]
impl MilestonePayContract {

    // ── INITIALIZE ──────────────────────────────────────────────────────────
    // Sets the admin address once at deployment. Admin is the only wallet
    // that can call resolve_dispute().
    pub fn initialize(env: Env, admin: Address) {
        // Prevent re-initialization
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    // ── CREATE MILESTONE ────────────────────────────────────────────────────
    // Called by the client to lock USDC into escrow and create a milestone.
    // The client must have approved this contract to spend `amount` of the
    // token before calling this function.
    //
    // Parameters:
    //   project_id  — unique identifier chosen by the caller (e.g. timestamp)
    //   freelancer  — the freelancer's wallet address
    //   token       — USDC token contract address on Stellar testnet
    //   amount      — USDC amount in base units (e.g. 50_000_000 = $50 USDC)
    //   deadline    — unix timestamp for auto-release window
    pub fn create_milestone(
        env:        Env,
        project_id: u64,
        client:     Address,
        freelancer: Address,
        token:      Address,
        amount:     i128,
        deadline:   u64,
    ) {
        // Require client signature — they are locking their own funds
        client.require_auth();

        // Prevent duplicate project_id
        if env.storage().persistent().has(&DataKey::Milestone(project_id)) {
            panic!("milestone already exists for this project_id");
        }

        // Transfer USDC from client wallet into this contract
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&client, &env.current_contract_address(), &amount);

        // Store milestone data on-chain
        let milestone = MilestoneData {
            client,
            freelancer,
            amount,
            token,
            deadline,
            completed: false,
            released:  false,
            disputed:  false,
        };
        env.storage().persistent().set(&DataKey::Milestone(project_id), &milestone);

        // Emit event so the frontend can react
        env.events().publish(
            (symbol_short!("created"), project_id),
            amount,
        );
    }

    // ── MARK COMPLETE ───────────────────────────────────────────────────────
    // Called by the freelancer to signal that milestone work is delivered.
    // This starts the client's review window. If the client does not respond
    // before the deadline, the freelancer can call claim_payment().
    //
    // Only the registered freelancer address can call this.
    pub fn mark_complete(env: Env, project_id: u64, freelancer: Address) {
        freelancer.require_auth();

        let mut milestone: MilestoneData = env
            .storage()
            .persistent()
            .get(&DataKey::Milestone(project_id))
            .expect("milestone not found");

        // Verify the caller is the registered freelancer
        if milestone.freelancer != freelancer {
            panic!("caller is not the registered freelancer");
        }
        if milestone.released {
            panic!("milestone already released");
        }
        if milestone.completed {
            panic!("milestone already marked complete");
        }

        milestone.completed = true;
        env.storage().persistent().set(&DataKey::Milestone(project_id), &milestone);

        env.events().publish(
            (symbol_short!("complete"), project_id),
            milestone.deadline,
        );
    }

    // ── CLAIM PAYMENT ───────────────────────────────────────────────────────
    // Called by the freelancer after the deadline has passed.
    // Contract checks:
    //   1. Milestone is marked complete
    //   2. Deadline has passed (client review window closed)
    //   3. No active dispute
    //   4. Funds not already released
    // If all checks pass, USDC is transferred to the freelancer wallet.
    pub fn claim_payment(env: Env, project_id: u64, freelancer: Address) {
        freelancer.require_auth();

        let mut milestone: MilestoneData = env
            .storage()
            .persistent()
            .get(&DataKey::Milestone(project_id))
            .expect("milestone not found");

        if milestone.freelancer != freelancer {
            panic!("caller is not the registered freelancer");
        }
        if !milestone.completed {
            panic!("milestone not yet marked complete");
        }
        if milestone.released {
            panic!("funds already released");
        }
        if milestone.disputed {
            panic!("dispute active — funds are frozen");
        }

        // Check that the client review window has closed
        let now = env.ledger().timestamp();
        if now < milestone.deadline {
            panic!("deadline not yet reached");
        }

        // Release USDC from contract to freelancer
        let token_client = token::Client::new(&env, &milestone.token);
        token_client.transfer(
            &env.current_contract_address(),
            &milestone.freelancer,
            &milestone.amount,
        );

        milestone.released = true;
        env.storage().persistent().set(&DataKey::Milestone(project_id), &milestone);

        env.events().publish(
            (symbol_short!("released"), project_id),
            milestone.amount,
        );
    }

    // ── CONFIRM DELIVERY ────────────────────────────────────────────────────
    // Called by the client to approve the freelancer's work.
    // Releases funds immediately without waiting for the deadline.
    // This is the happy path for honest clients who want to review and pay.
    //
    // Three possible client actions after mark_complete():
    //   1. confirm_delivery() → immediate release (client approves)
    //   2. raise_dispute()    → funds frozen (client has issues)
    //   3. do nothing         → deadline passes, freelancer calls claim_payment()
    pub fn confirm_delivery(env: Env, project_id: u64, client: Address) {
        client.require_auth();

        let mut milestone: MilestoneData = env
            .storage()
            .persistent()
            .get(&DataKey::Milestone(project_id))
            .expect("milestone not found");

        // Only the registered client can confirm delivery
        if milestone.client != client {
            panic!("caller is not the registered client");
        }
        if !milestone.completed {
            panic!("freelancer has not marked this milestone complete yet");
        }
        if milestone.released {
            panic!("funds already released");
        }
        if milestone.disputed {
            panic!("dispute active — resolve dispute first");
        }

        // Release USDC immediately to freelancer — no need to wait for deadline
        let token_client = token::Client::new(&env, &milestone.token);
        token_client.transfer(
            &env.current_contract_address(),
            &milestone.freelancer,
            &milestone.amount,
        );

        milestone.released = true;
        env.storage().persistent().set(&DataKey::Milestone(project_id), &milestone);

        // Emit event so frontend can update state instantly
        env.events().publish(
            (symbol_short!("approved"), project_id),
            milestone.amount,
        );
    }

    // ── RAISE DISPUTE ───────────────────────────────────────────────────────
    // Called by the freelancer to flag a dispute.
    // Pauses auto-release by setting disputed=true.
    // Admin must call resolve_dispute() to unfreeze funds.
    pub fn raise_dispute(env: Env, project_id: u64, caller: Address) {
        caller.require_auth();

        let mut milestone: MilestoneData = env
            .storage()
            .persistent()
            .get(&DataKey::Milestone(project_id))
            .expect("milestone not found");

        // Only client or freelancer can raise a dispute
        if caller != milestone.client && caller != milestone.freelancer {
            panic!("caller is not a party to this milestone");
        }
        if milestone.released {
            panic!("funds already released");
        }

        milestone.disputed = true;
        env.storage().persistent().set(&DataKey::Milestone(project_id), &milestone);

        env.events().publish(
            (symbol_short!("disputed"), project_id),
            true,
        );
    }

    // ── RESOLVE DISPUTE ─────────────────────────────────────────────────────
    // Admin-only function. Releases funds to the specified winner address.
    // winner must be either the client or the freelancer.
    pub fn resolve_dispute(
        env:        Env,
        project_id: u64,
        admin:      Address,
        winner:     Address,
    ) {
        admin.require_auth();

        // Verify caller is the registered admin
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("contract not initialized");
        if admin != stored_admin {
            panic!("caller is not the admin");
        }

        let mut milestone: MilestoneData = env
            .storage()
            .persistent()
            .get(&DataKey::Milestone(project_id))
            .expect("milestone not found");

        if !milestone.disputed {
            panic!("no active dispute");
        }
        if milestone.released {
            panic!("funds already released");
        }

        // Winner must be one of the two parties
        if winner != milestone.client && winner != milestone.freelancer {
            panic!("winner must be client or freelancer");
        }

        let token_client = token::Client::new(&env, &milestone.token);
        token_client.transfer(
            &env.current_contract_address(),
            &winner,
            &milestone.amount,
        );

        milestone.released = true;
        milestone.disputed = false;
        env.storage().persistent().set(&DataKey::Milestone(project_id), &milestone);

        env.events().publish(
            (symbol_short!("resolved"), project_id),
            winner,
        );
    }

    // ── GET MILESTONE ────────────────────────────────────────────────────────
    // Read-only helper. Returns full milestone data for a given project_id.
    // Used by the frontend to display current state.
    pub fn get_milestone(env: Env, project_id: u64) -> MilestoneData {
        env.storage()
            .persistent()
            .get(&DataKey::Milestone(project_id))
            .expect("milestone not found")
    }
}

#[cfg(test)]
mod test;