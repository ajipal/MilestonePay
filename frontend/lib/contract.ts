import {
  Contract,
  rpc as SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Address,
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
  const signedTx  = TransactionBuilder.fromXDR(signedXdr, NETWORK);
  const submitted = await server.sendTransaction(signedTx);

  if (submitted.status === 'ERROR') throw new Error('Transaction failed to submit');

  let poll = await server.getTransaction(submitted.hash);
  let attempts = 0;
  while (poll.status === 'NOT_FOUND' && attempts < 30) {
    await new Promise(r => setTimeout(r, 1000));
    poll = await server.getTransaction(submitted.hash);
    attempts++;
  }
  if (poll.status === 'FAILED') throw new Error('Transaction execution failed');
  return submitted.hash;
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
    nativeToScVal(BigInt(amount * 1_000_000), { type: 'i128' }),
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

export async function raiseDispute(walletAddress: string, projectId: number, sign: SignFn) {
  return invoke(walletAddress, 'raise_dispute', [
    nativeToScVal(BigInt(projectId), { type: 'u64' }),
    Address.fromString(walletAddress).toScVal(),
  ], sign);
}
