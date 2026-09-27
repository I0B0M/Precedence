// A crypto wallet, for now: the address as pasted, kept in this browser. No balance is read yet, so none is shown;
// the row says so rather than showing a number.

/** "0x12a4…1fab" as wallets show it: the first 4 characters and the last 2. */
export const shortWallet = (address: string) => (address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-2)}` : address);

export const walletLine = (address: string) => `Wallet ${shortWallet(address)} · balance not loaded yet`;

/** Why this isn't a wallet address, or null when it looks like one (Ethereum, Bitcoin, Solana: letters and digits). */
export function walletProblem(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "Paste a wallet address.";
  return /^[A-Za-z0-9]{20,100}$/.test(s) ? null : "That doesn't look like a wallet address: letters and numbers, no spaces.";
}
