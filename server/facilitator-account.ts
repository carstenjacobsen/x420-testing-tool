/**
 * Facilitator Account Manager
 *
 * The x402 "exact" Stellar scheme requires the facilitator to have its own
 * funded Stellar account. The facilitator rebuilds client transactions using
 * this account as the sequence number provider, then signs and submits.
 *
 * Key resolution order:
 *  1. FACILITATOR_SECRET environment variable
 *  2. .facilitator-key file (persisted across restarts)
 *  3. Auto-generate + fund via Friendbot (testnet only)
 */

import { Keypair } from '@stellar/stellar-sdk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const KEY_FILE = join(process.cwd(), '.facilitator-key');
const FRIENDBOT_URL = 'https://friendbot.stellar.org';

let _keypair: Keypair | null = null;

export async function getFacilitatorKeypair(): Promise<Keypair> {
  if (_keypair) return _keypair;

  // 1. Environment variable
  if (process.env.FACILITATOR_SECRET) {
    _keypair = Keypair.fromSecret(process.env.FACILITATOR_SECRET.trim());
    console.log(`[facilitator] Using keypair from FACILITATOR_SECRET: ${_keypair.publicKey()}`);
    return _keypair;
  }

  // 2. Persisted key file
  if (existsSync(KEY_FILE)) {
    const secret = readFileSync(KEY_FILE, 'utf8').trim();
    _keypair = Keypair.fromSecret(secret);
    console.log(`[facilitator] Loaded keypair from .facilitator-key: ${_keypair.publicKey()}`);
    return _keypair;
  }

  // 3. Generate a fresh keypair and fund via Friendbot
  const keypair = Keypair.random();
  console.log(`[facilitator] Generated new keypair: ${keypair.publicKey()}`);
  console.log(`[facilitator] Funding via Friendbot…`);

  const res = await fetch(`${FRIENDBOT_URL}?addr=${keypair.publicKey()}`);
  if (!res.ok) {
    throw new Error(`Friendbot funding failed (${res.status}): ${await res.text()}`);
  }

  writeFileSync(KEY_FILE, keypair.secret(), 'utf8');
  console.log(`[facilitator] Funded and saved to .facilitator-key ✓`);

  _keypair = keypair;
  return _keypair;
}
