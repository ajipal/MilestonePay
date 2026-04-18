#[cfg(test)]
mod tests {
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, Env,
    };
    use crate::{MilestonePayContract, MilestonePayContractClient};

    // ── HELPER: deploy a mock USDC token and mint to an address ───────────
    fn create_token(env: &Env, admin: &Address) -> (Address, token::StellarAssetClient<'_>) {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let token_admin_client = token::StellarAssetClient::new(env, &token_id.address());
        (token_id.address(), token_admin_client)
    }

    // ── HELPER: deploy MilestonePay contract and return client ────────────
    fn deploy_contract<'a>(env: &'a Env, admin: &Address) -> MilestonePayContractClient<'a> {
        let contract_id = env.register(MilestonePayContract, ());
        let client = MilestonePayContractClient::new(env, &contract_id);
        client.initialize(admin);
        client
    }

    // ════════════════════════════════════════════════════════════════════════
    // TEST 1 — HAPPY PATH
    // Full end-to-end flow:
    //   create_milestone → mark_complete → (time passes) → claim_payment
    // Asserts that USDC is transferred to the freelancer after deadline.
    // ════════════════════════════════════════════════════════════════════════
    #[test]
    fn test_happy_path_full_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let admin      = Address::generate(&env);
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        // Deploy token and mint $100 USDC (6 decimals → 100_000_000 units) to client
        let (token_id, token_admin) = create_token(&env, &admin);
        token_admin.mint(&client_addr, &100_000_000);

        // Deploy contract
        let contract = deploy_contract(&env, &admin);

        // Set ledger timestamp to T=1000
        env.ledger().with_mut(|l| l.timestamp = 1000);

        // Deadline is T=1010 (10 seconds from now — demo mode)
        let project_id: u64 = 1;
        let amount: i128 = 50_000_000; // $50 USDC
        let deadline: u64 = 1010;

        // Client locks $50 USDC
        contract.create_milestone(
            &project_id,
            &client_addr,
            &freelancer,
            &token_id,
            &amount,
            &deadline,
        );

        // Freelancer marks milestone complete
        contract.mark_complete(&project_id, &freelancer);

        // Advance time past deadline
        env.ledger().with_mut(|l| l.timestamp = 1020);

        // Freelancer claims payment
        contract.claim_payment(&project_id, &freelancer);

        // Assert freelancer received $50 USDC
        let token_client = token::Client::new(&env, &token_id);
        let freelancer_balance = token_client.balance(&freelancer);
        assert_eq!(freelancer_balance, 50_000_000, "freelancer should have received $50 USDC");

        // Assert milestone state is released
        let milestone = contract.get_milestone(&project_id);
        assert!(milestone.released, "milestone should be marked released");
        assert!(milestone.completed, "milestone should be marked completed");
    }

    // ════════════════════════════════════════════════════════════════════════
    // TEST 2 — EDGE CASE
    // claim_payment() must be rejected if the deadline has not yet passed.
    // This proves the contract enforces the time window correctly.
    // ════════════════════════════════════════════════════════════════════════
    #[test]
    #[should_panic(expected = "deadline not yet reached")]
    fn test_claim_before_deadline_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let admin       = Address::generate(&env);
        let client_addr = Address::generate(&env);
        let freelancer  = Address::generate(&env);

        let (token_id, token_admin) = create_token(&env, &admin);
        token_admin.mint(&client_addr, &100_000_000);

        let contract = deploy_contract(&env, &admin);

        // Ledger at T=1000, deadline at T=9999 — window is still open
        env.ledger().with_mut(|l| l.timestamp = 1000);

        let project_id: u64 = 2;
        let amount: i128 = 50_000_000;
        let deadline: u64 = 9999;

        contract.create_milestone(
            &project_id,
            &client_addr,
            &freelancer,
            &token_id,
            &amount,
            &deadline,
        );

        contract.mark_complete(&project_id, &freelancer);

        // Attempt to claim before deadline — should panic
        contract.claim_payment(&project_id, &freelancer);
    }

    // ════════════════════════════════════════════════════════════════════════
    // TEST 3 — STATE VERIFICATION
    // After create_milestone(), contract storage must reflect the correct
    // client, freelancer, amount, and initial boolean states.
    // ════════════════════════════════════════════════════════════════════════
    #[test]
    fn test_state_after_create_milestone() {
        let env = Env::default();
        env.mock_all_auths();

        let admin       = Address::generate(&env);
        let client_addr = Address::generate(&env);
        let freelancer  = Address::generate(&env);

        let (token_id, token_admin) = create_token(&env, &admin);
        token_admin.mint(&client_addr, &100_000_000);

        let contract = deploy_contract(&env, &admin);

        env.ledger().with_mut(|l| l.timestamp = 500);

        let project_id: u64 = 3;
        let amount: i128 = 75_000_000; // $75 USDC
        let deadline: u64 = 600;

        contract.create_milestone(
            &project_id,
            &client_addr,
            &freelancer,
            &token_id,
            &amount,
            &deadline,
        );

        // Fetch stored state and assert every field
        let milestone = contract.get_milestone(&project_id);

        assert_eq!(milestone.client,     client_addr, "client address mismatch");
        assert_eq!(milestone.freelancer, freelancer,  "freelancer address mismatch");
        assert_eq!(milestone.amount,     75_000_000,  "amount mismatch");
        assert_eq!(milestone.deadline,   600,         "deadline mismatch");
        assert!(!milestone.completed, "completed should be false initially");
        assert!(!milestone.released,  "released should be false initially");
        assert!(!milestone.disputed,  "disputed should be false initially");
    }
}