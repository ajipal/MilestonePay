import { isConnected, getPublicKey, signTransaction } from '@stellar/freighter-api';
import { Networks } from '@stellar/stellar-sdk';

export async function connectWallet(): Promise<string> {
  const connected = await isConnected();
  if (!connected) throw new Error('Freighter wallet not installed. Please install it from freighter.app');
  const address = await getPublicKey();
  if (!address) throw new Error('No account found in Freighter. Please create or import one.');
  return address;
}

export async function signTx(unsignedXdr: string): Promise<string> {
  const result = await signTransaction(unsignedXdr, {
    networkPassphrase: Networks.TESTNET,
    network: 'TESTNET',
  });
  if (!result) throw new Error('User rejected the transaction');
  return result;
}

export async function getWalletAddress(): Promise<string | null> {
  try {
    const connected = await isConnected();
    if (!connected) return null;
    return await getPublicKey();
  } catch {
    return null;
  }
}
