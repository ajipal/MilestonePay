import {
  Contract,
  rpc as SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Address,
  xdr,
} from '@stellar/stellar-sdk';
import type { OnChainMilestone } from './types';

const RPC_URL    = process.env.NEXT_PUBLIC_RPC_URL    ?? 'https://soroban-testnet.stellar.org';
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? '';
const NETWORK    = Networks.TESTNET;

const server = new SorobanRpc.Server(RPC_URL, { allowHttp: false });

type SignFn = (xdr: string) => Promise<string>;

async function invoke(walletAddress: string, method: string, args: ReturnType<typeof nativeToScVal>[], sign: SignFn) {
  if (!CONTRACT_ID) throw new Error('Contract not configured. Set NEXT_PUBLIC_CONTRACT_ID in .env.local');

  const account  = await server.getAccount(walletAddress);
  const contract = new Contract(CONTRACT_ID);

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) throw new Error(sim.error);

  const prepared  = SorobanRpc.assembleTransaction(tx, sim).build();
  const signedXdr = await sign(prepared.toXDR());

  // Use raw JSON-RPC to avoid stellar-sdk XDR parsing bugs ("Bad union switch")
  const sendRes  = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: { transaction: signedXdr } }),
  });
  const sendJson = await sendRes.json();
  if (sendJson.error) throw new Error(sendJson.error.message ?? 'RPC error sending transaction');
  const { hash, status: sendStatus } = sendJson.result ?? {};
  if (sendStatus === 'ERROR') throw new Error('Transaction rejected by network');

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const pollRes  = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: { hash } }),
    });
    const pollJson = await pollRes.json();
    const status   = pollJson.result?.status;
    if (status === 'SUCCESS') return hash as string;
    if (status === 'FAILED')  throw new Error('Transaction execution failed on-chain');
  }
  throw new Error('Transaction timed out — check stellar.expert for status');
}

export async function getMilestone(projectId: number): Promise<OnChainMilestone | null> {
  if (!CONTRACT_ID) return null;
  try {
    const SOURCE  = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
    const account = await server.getAccount(SOURCE);
    const contract = new Contract(CONTRACT_ID);
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
      .addOperation(contract.call('get_milestone', nativeToScVal(BigInt(projectId), { type: 'u64' })))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(sim) || !sim.result) return null;
    return scValToNative(sim.result.retval) as OnChainMilestone;
  } catch {
    return null;
  }
}

export async function createProjectBatch(
  walletAddress: string,
  freelancer: string,
  token: string,
  milestoneIds: number[],
  amounts: number[],
  deadlineUnix: number,
  sign: SignFn,
): Promise<string> {
  const msIdsVal  = xdr.ScVal.scvVec(milestoneIds.map(id => nativeToScVal(BigInt(id),  { type: 'u64' })));
  const amountsVal = xdr.ScVal.scvVec(amounts.map(a   => nativeToScVal(BigInt(Math.round(a * 10_000_000)), { type: 'i128' })));
  return invoke(walletAddress, 'create_project_batch', [
    Address.fromString(walletAddress).toScVal(),
    Address.fromString(freelancer).toScVal(),
    Address.fromString(token).toScVal(),
    msIdsVal,
    amountsVal,
    nativeToScVal(BigInt(deadlineUnix), { type: 'u64' }),
  ], sign);
}

export async function createMilestone(
  walletAddress: string,
  projectId: number,
  freelancer: string,
  token: string,
  amount: number,
  deadlineUnix: number,
  sign: SignFn,
): Promise<string> {
  return invoke(walletAddress, 'create_milestone', [
    nativeToScVal(BigInt(projectId), { type: 'u64' }),
    Address.fromString(walletAddress).toScVal(),
    Address.fromString(freelancer).toScVal(),
    Address.fromString(token).toScVal(),
    nativeToScVal(BigInt(amount * 10_000_000), { type: 'i128' }),
    nativeToScVal(BigInt(deadlineUnix), { type: 'u64' }),
  ], sign);
}

export async function markComplete(walletAddress: string, projectId: number, sign: SignFn) {
  return invoke(walletAddress, 'mark_complete', [
    nativeToScVal(BigInt(projectId), { type: 'u64' }),
    Address.fromString(walletAddress).toScVal(),
  ], sign);
}

export async function confirmDelivery(walletAddress: string, projectId: number, sign: SignFn) {
  return invoke(walletAddress, 'confirm_delivery', [
    nativeToScVal(BigInt(projectId), { type: 'u64' }),
    Address.fromString(walletAddress).toScVal(),
  ], sign);
}

export async function claimPayment(walletAddress: string, projectId: number, sign: SignFn) {
  return invoke(walletAddress, 'claim_payment', [
    nativeToScVal(BigInt(projectId), { type: 'u64' }),
    Address.fromString(walletAddress).toScVal(),
  ], sign);
}

export async function adminCancelMilestone(adminWallet: string, projectId: number, sign: SignFn) {
  return invoke(adminWallet, 'admin_cancel_milestone', [
    nativeToScVal(BigInt(projectId), { type: 'u64' }),
    Address.fromString(adminWallet).toScVal(),
  ], sign);
}

export async function requestRevision(clientWallet: string, projectId: number, revAmountXlm: number, sign: SignFn) {
  const stroops = BigInt(Math.round(revAmountXlm * 10_000_000));
  return invoke(clientWallet, 'request_revision', [
    nativeToScVal(BigInt(projectId), { type: 'u64' }),
    Address.fromString(clientWallet).toScVal(),
    nativeToScVal(stroops, { type: 'i128' }),
  ], sign);
}

export async function cancelMilestone(walletAddress: string, projectId: number, sign: SignFn) {
  return invoke(walletAddress, 'cancel_milestone', [
    nativeToScVal(BigInt(projectId), { type: 'u64' }),
    Address.fromString(walletAddress).toScVal(),
  ], sign);
}

export async function resolveDispute(
  adminWallet: string,
  milestoneId: number,
  winnerWallet: string,
  sign: SignFn,
) {
  return invoke(adminWallet, 'resolve_dispute', [
    nativeToScVal(BigInt(milestoneId), { type: 'u64' }),
    Address.fromString(adminWallet).toScVal(),
    Address.fromString(winnerWallet).toScVal(),
  ], sign);
}

export async function raiseDispute(walletAddress: string, projectId: number, sign: SignFn) {
  return invoke(walletAddress, 'raise_dispute', [
    nativeToScVal(BigInt(projectId), { type: 'u64' }),
    Address.fromString(walletAddress).toScVal(),
  ], sign);
}
