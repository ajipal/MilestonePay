import { isConnected, getPublicKey, signTransaction } from '@stellar/freighter-api';
import { Networks } from '@stellar/stellar-sdk';

export async function connectWallet(): Promise<string> {
  const connected = await isConnected();
  if (!connected) throw new Error('Freighter not found. Install it at freighter.app');
  const address = await getPublicKey();
  if (!address) throw new Error('No account found in Freighter. Create or import one first.');
  return address;
}

export async function signTx(unsignedXdr: string): Promise<string> {
  const result = await signTransaction(unsignedXdr, {
    networkPassphrase: Networks.TESTNET,
    network: 'TESTNET',
  });
  if (!result) throw new Error('Transaction rejected in Freighter');
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

export async function validateWallet(address: string): Promise<boolean> {
  try {
    const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
    return res.ok;
  } catch {
    return false;
  }
}
