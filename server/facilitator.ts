/**
 * x402 v2 Facilitator — Stellar (Soroban / SAC)
 *
 * Delegates verify/settle to the official ExactStellarScheme facilitator from
 * @x402/stellar, which uses its bundled stellar-sdk v14. This avoids XDR
 * incompatibilities between v13 (project) and v14 (x402/stellar).
 */

import { Networks, Asset } from '@stellar/stellar-sdk';
// Keypair from our project SDK (v13) is fine for key management — only XDR parsing needs v14.
import { Keypair } from '@stellar/stellar-sdk';
import { ExactStellarScheme } from '@x402/stellar/exact/facilitator';
import { getFacilitatorKeypair as getRawKeypair } from './facilitator-account.js';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sdkV14: any = _require('../node_modules/@x402/stellar/node_modules/@stellar/stellar-sdk/lib/index.js');
import type {
  PaymentRequirementsV2,
  PaymentPayloadV2,
  FacilitatorVerifyResponse,
  FacilitatorSettleResponse,
} from './types.js';

// ─── Network constants ─────────────────────────────────────────────────────────

const USDC_TESTNET_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC_MAINNET_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getNetworkPassphrase(network: string): string {
  return network === 'stellar:mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

/**
 * Returns the Soroban SAC contract address for a human-readable asset name.
 * If the value is already a 56-char C… contract address it is returned as-is.
 */
export function getSacAddress(assetStr: string, network: string): string {
  const passphrase = getNetworkPassphrase(network);

  if (assetStr.startsWith('C') && assetStr.length === 56) return assetStr;

  if (assetStr === 'XLM' || assetStr === 'native') {
    return Asset.native().contractId(passphrase);
  }
  if (assetStr === 'USDC') {
    const issuer = network === 'stellar:mainnet' ? USDC_MAINNET_ISSUER : USDC_TESTNET_ISSUER;
    return new Asset('USDC', issuer).contractId(passphrase);
  }
  const [code, issuer] = assetStr.split(':');
  if (code && issuer) return new Asset(code, issuer).contractId(passphrase);

  throw new Error(`Unknown asset: ${assetStr}`);
}

/**
 * Converts a human-readable decimal amount (e.g. "0.001") to the integer
 * base-unit string required by x402 v2 (e.g. "10000" for 7-decimal assets).
 */
export function toBaseUnits(amount: string, decimals = 7): string {
  return Math.round(parseFloat(amount) * Math.pow(10, decimals)).toString();
}

// ─── Build the official facilitator scheme (lazily, singleton) ────────────────

let _scheme: ExactStellarScheme | null = null;

async function getScheme(): Promise<ExactStellarScheme> {
  if (_scheme) return _scheme;

  const rawKp = await getRawKeypair();
  const kp = Keypair.fromSecret(rawKp.secret());

  const signer = {
    address: kp.publicKey(),
    signTransaction: async (xdrStr: string, opts?: { networkPassphrase?: string }) => {
      const passphrase = opts?.networkPassphrase ?? Networks.TESTNET;
      console.log(`[facilitator] signTransaction called — passphrase: "${passphrase}", xdrStr length: ${xdrStr.length}`);
      try {
        // Use v14 SDK (module-level sdkV14) for XDR parsing and signing to avoid
        // "Bad union switch" errors caused by Protocol-22 XDR unknown to v13.
        // We also create a v14 Keypair from the same secret to avoid cross-version
        // compatibility issues when calling Transaction.sign().
        const kpV14 = sdkV14.Keypair.fromSecret(kp.secret());
        console.log(`[facilitator] signing with address: ${kpV14.publicKey()}`);
        const tx = new sdkV14.Transaction(xdrStr, passphrase);
        console.log(`[facilitator] parsed transaction, source: ${tx.source}, fee: ${tx.fee}`);
        tx.sign(kpV14);
        const signedXdr = tx.toXDR();
        console.log(`[facilitator] signed OK, signedXdr length: ${signedXdr.length}`);
        return { signedTxXdr: signedXdr };
      } catch (err) {
        console.error('[facilitator] signTransaction ERROR:', (err as Error).stack ?? (err as Error).message);
        return { signedTxXdr: '', error: (err as Error).message };
      }
    },
    signAuthEntry: async (entryXdr: string) => {
      // Facilitator doesn't need to sign auth entries — only the client does.
      return { signedAuthEntry: entryXdr };
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _scheme = new ExactStellarScheme([signer as any]);

  // ── Override verify() to use Soroban RPC for maxLedger computation ────────
  //
  // The library's internal verify() estimates ledger close time by sampling
  // the last 20 Horizon ledger records, which can return very different values
  // (e.g. 3 s) from what the browser client computed (also via Horizon, but
  // getting a different sample). With a 300 s timeout even a 3 s vs 5 s
  // difference produces a 40-ledger gap that exceeds the library's hardcoded
  // tolerance of 2 and yields "invalid_exact_stellar_signature_expiration_too_far".
  //
  // Fix: intercept verify() before the library runs it, use the Soroban RPC
  // getLedgers endpoint to get the same current-ledger baseline the client used,
  // compute maxLedger at the most permissive reasonable rate (3 s/ledger), and
  // temporarily inject that value into validateAuthEntries for this one call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalVerify = (_scheme as any).verify.bind(_scheme);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalValidateAuthEntries = (_scheme as any).validateAuthEntries.bind(_scheme);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (_scheme as any).verify = async function (payload: any, requirements: any) {
    const network: string = requirements.network ?? 'stellar:testnet';
    const maxTimeoutSeconds: number = requirements.maxTimeoutSeconds ?? 60;
    const rpcUrl = network === 'stellar:mainnet'
      ? null   // mainnet requires a custom RPC URL configured by the operator
      : 'https://soroban-testnet.stellar.org';

    let rpcMaxLedger = 0;
    if (rpcUrl) {
      try {
        const rpcServer = new sdkV14.rpc.Server(rpcUrl, { allowHttp: false });

        // Get current ledger from RPC
        const latestLedger = await rpcServer.getLatestLedger();
        const currentSeq: number = latestLedger.sequence;

        // Estimate ledger close time via RPC getLedgers (protocol-22 endpoint)
        let secsPerLedger = 5; // default
        try {
          const startSeq = Math.max(1, currentSeq - 19);
          const ledgersResult = await rpcServer.getLedgers({ startLedger: startSeq, limit: 20 });
          if (ledgersResult?.ledgers?.length >= 2) {
            const ledgers = ledgersResult.ledgers;
            const timeDiff: number =
              ledgers[ledgers.length - 1].ledgerCloseTime - ledgers[0].ledgerCloseTime;
            secsPerLedger = Math.max(1, timeDiff / (ledgers.length - 1));
          }
        } catch {
          // getLedgers not available on this node — fall back to 5 s
        }

        // Use 3 s/ledger (the fastest reasonable testnet rate) so we accept
        // auth entries signed by a client that also used an aggressive estimate.
        const effectiveRate = Math.min(secsPerLedger, 3);
        rpcMaxLedger = currentSeq + Math.ceil(maxTimeoutSeconds / effectiveRate) + 10;
        console.log(
          `[facilitator] RPC ledger: seq=${currentSeq}, rate≈${secsPerLedger.toFixed(2)}s,` +
          ` maxLedger=${rpcMaxLedger} (rate capped at 3 s)`
        );
      } catch (err) {
        console.warn('[facilitator] RPC maxLedger pre-fetch failed:', (err as Error).message);
      }
    }

    if (rpcMaxLedger > 0) {
      // Temporarily override validateAuthEntries so it uses our RPC-derived
      // maxLedger instead of the Horizon-derived value the library computed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.validateAuthEntries = function (...args: any[]) {
        // args[3] is maxLedger — replace it with the RPC value if ours is larger
        if (rpcMaxLedger > args[3]) {
          args[3] = rpcMaxLedger;
        }
        return originalValidateAuthEntries(...args);
      };
      try {
        return await originalVerify(payload, requirements);
      } finally {
        // Always restore the original method
        this.validateAuthEntries = originalValidateAuthEntries;
      }
    }

    return originalVerify(payload, requirements);
  };

  return _scheme;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface VerifyRequest {
  paymentRequirements: PaymentRequirementsV2;
  payload: PaymentPayloadV2;
}

export interface SettleRequest extends VerifyRequest {}

export async function verify(req: VerifyRequest): Promise<FacilitatorVerifyResponse> {
  const scheme = await getScheme();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await scheme.verify(req.payload as any, req.paymentRequirements as any);
  return {
    isValid: result.isValid,
    invalidReason: result.isValid ? undefined : (result as { invalidReason?: string }).invalidReason,
    payer: (result as { payer?: string }).payer,
  };
}

export async function settle(req: SettleRequest): Promise<FacilitatorSettleResponse> {
  const scheme = await getScheme();
  console.log(`[facilitator] settling for ${req.paymentRequirements.network}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await scheme.settle(req.payload as any, req.paymentRequirements as any);
  console.log(`[facilitator] settle result:`, result);
  return {
    success: result.success,
    transaction: result.transaction || undefined,
    network: req.paymentRequirements.network,
    payer: result.payer,
    errorReason: result.success ? undefined : result.errorReason,
  };
}

export function getSupportedNetworks() {
  return {
    schemes: ['exact'],
    networks: [
      {
        id: 'stellar:testnet',
        name: 'Stellar Testnet',
        assets: [
          { id: 'XLM', name: 'Stellar Lumens', decimals: 7 },
          { id: 'USDC', name: 'USD Coin (testnet)', decimals: 7 },
        ],
      },
      {
        id: 'stellar:mainnet',
        name: 'Stellar Mainnet',
        assets: [
          { id: 'XLM', name: 'Stellar Lumens', decimals: 7 },
          { id: 'USDC', name: 'USD Coin', decimals: 7 },
        ],
      },
    ],
    facilitator: 'x402 v2 built-in facilitator (Soroban / SAC)',
    version: 2,
  };
}
