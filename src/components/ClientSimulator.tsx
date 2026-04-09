/**
 * Client Simulator
 *
 * Uses @x402/fetch (wrapFetchWithPayment) and @x402/stellar (ExactStellarScheme)
 * from github.com/x402-foundation/x402 to handle the full x402 payment flow:
 *  1. Send request → detect 402
 *  2. Build payment payload via ExactStellarScheme (Soroban RPC + Freighter signing)
 *  3. Retry with X-PAYMENT header
 *  4. Display result + X-PAYMENT-RESPONSE
 *
 * All network calls are routed through /api/proxy to avoid CORS issues.
 */

import { useState, useCallback } from 'react';
import {
  Wallet, Send, Zap, ChevronRight, CheckCircle2, XCircle,
  RefreshCw, ExternalLink, Copy, Check, Globe,
} from 'lucide-react';
import freighterApi from '@stellar/freighter-api';
import { Networks } from '@stellar/stellar-sdk';
import { ExactStellarScheme } from '@x402/stellar/exact/client';
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { encodePaymentSignatureHeader } from '@x402/core/http';
import type {
  WalletState,
  ClientRequestState,
  RequestStep,
  PaymentRequirements,
  FacilitatorSettleResponse,
} from '../types';

// freighter-api v4: functions live on the default export
const {
  isConnected,
  requestAccess,
  getAddress,
  signTransaction,
  signAuthEntry,
} = freighterApi as unknown as {
  isConnected: () => Promise<{ isConnected: boolean }>;
  requestAccess: () => Promise<{ address: string; error?: string }>;
  getAddress: () => Promise<{ address: string; error?: string }>;
  signTransaction: (
    xdr: string,
    opts: { networkPassphrase: string }
  ) => Promise<{ signedTxXdr: string; error?: string }>;
  signAuthEntry: (
    entryXdr: string,
    opts: { networkPassphrase: string }
  ) => Promise<{ signedAuthEntry: string; error?: string }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────


function getNetworkPassphrase(network: string): string {
  return network === 'stellar:mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

function isSorobanAsset(asset: string): boolean {
  return asset.startsWith('C') && asset.length === 56 && !asset.includes(':');
}

function friendlyAssetName(asset: string): string {
  if (asset === 'XLM' || asset === 'native') return 'XLM';
  if (asset === 'USDC') return 'USDC';
  if (isSorobanAsset(asset)) return `SAC(${asset.slice(0, 6)}…${asset.slice(-4)})`;
  const [code] = asset.split(':');
  return code;
}

// Parse 402 response for UI display (v1 body JSON or v2 payment-required header).
function parsePaymentRequirements(
  body: string,
  headers: Record<string, string>
): PaymentRequirements | null {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed.accepts) && parsed.accepts.length > 0) {
      return parsed as PaymentRequirements;
    }
  } catch { /* fall through */ }

  const prHeader = headers['payment-required'];
  if (prHeader) {
    try {
      const decoded = JSON.parse(atob(prHeader));
      if (Array.isArray(decoded.accepts) && decoded.accepts.length > 0) {
        return {
          x402Version: decoded.x402Version ?? 2,
          error: decoded.error ?? 'Payment Required',
          accepts: decoded.accepts.map((opt: Record<string, unknown>) => ({
            scheme: opt.scheme ?? 'exact',
            network: opt.network,
            maxAmountRequired: (opt.maxAmountRequired ?? opt.amount) as string,
            asset: opt.asset,
            payTo: opt.payTo,
            resource: opt.resource ?? '',
            description: opt.description,
            maxTimeoutSeconds: (opt.maxTimeoutSeconds as number) ?? 300,
          })),
        } as PaymentRequirements;
      }
    } catch { /* fall through */ }
  }

  return null;
}

// Routes every request through the server-side proxy to avoid CORS issues.
async function proxyRequest(
  url: string,
  method: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; statusText: string; headers: Record<string, string>; body: string }> {
  const r = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, method, headers }),
  });
  return r.json();
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS: { id: RequestStep; label: string }[] = [
  { id: 'sending_initial', label: 'Initial Request' },
  { id: 'building_payment', label: 'Build Payment' },
  { id: 'signing', label: 'Sign with Freighter' },
  { id: 'sending_payment', label: 'Send with Payment' },
  { id: 'complete', label: 'Response' },
];

function StepTracker({ current }: { current: RequestStep }) {
  const activeIdx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STEPS.map((step, i) => {
        const done = i < activeIdx || current === 'complete';
        const active = step.id === current;
        return (
          <div key={step.id} className="flex items-center gap-1 shrink-0">
            <div
              className={`step-indicator text-xs ${
                done
                  ? 'bg-green-500 text-white'
                  : active
                    ? 'bg-stellar-600 text-white'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {done ? <CheckCircle2 size={13} /> : i + 1}
            </div>
            <span className={`text-xs ${active ? 'text-gray-800' : 'text-gray-400'}`}>
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <ChevronRight size={12} className="text-gray-300 mx-0.5" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── JSON display ──────────────────────────────────────────────────────────────

function JsonBlock({ data, label }: { data: unknown; label?: string }) {
  const [copied, setCopied] = useState(false);
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <span className="label">{label}</span>
          <button onClick={copy} className="text-gray-400 hover:text-gray-600">
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
          </button>
        </div>
      )}
      <pre className="code-block">{text}</pre>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientSimulator() {
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('GET');
  const [wallet, setWallet] = useState<WalletState>({ connected: false, publicKey: null, network: null });
  const [state, setState] = useState<ClientRequestState>({ step: 'idle' });
  const [connectingWallet, setConnectingWallet] = useState(false);

  // ── Wallet connection ─────────────────────────────────────────────────────

  const connectWallet = useCallback(async () => {
    setConnectingWallet(true);
    try {
      const connResult = await isConnected();
      if (!connResult.isConnected) {
        alert('Freighter is not installed or not unlocked.\nInstall it from https://freighter.app');
        return;
      }
      const accessResult = await requestAccess();
      if (accessResult.error) {
        alert(`Wallet access denied: ${accessResult.error}`);
        return;
      }
      const addrResult = await getAddress();
      if (addrResult.error || !addrResult.address) {
        alert(`Could not get address: ${addrResult.error ?? 'unknown error'}`);
        return;
      }
      setWallet({ connected: true, publicKey: addrResult.address, network: 'stellar:testnet' });
    } catch (err) {
      alert(`Failed to connect wallet: ${(err as Error).message}`);
    } finally {
      setConnectingWallet(false);
    }
  }, []);

  const disconnectWallet = () => setWallet({ connected: false, publicKey: null, network: null });

  // ── Send request (handles the full x402 flow via wrapFetchWithPayment) ──────

  const sendRequest = useCallback(async () => {
    if (!url) return;
    setState({ step: 'sending_initial' });

    try {
      // Network passphrase — updated from the PaymentRequired network in the hook below.
      let passphrase: string = Networks.TESTNET;

      // Proxy-aware fetch: routes all requests through /api/proxy to avoid CORS.
      // Creates a native Response so wrapFetchWithPayment can read headers/body normally.
      const proxyFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const reqUrl =
          typeof input === 'string' ? input
          : input instanceof URL ? input.href
          : (input as Request).url;
        const reqMethod = init?.method ?? (input instanceof Request ? input.method : 'GET');
        const reqHeaders: Record<string, string> = {};
        // Read headers from a Request object first (covers the payment-retry call where
        // wrapFetchWithPayment sets X-PAYMENT/PAYMENT-SIGNATURE on clonedRequest.headers).
        if (input instanceof Request) {
          input.headers.forEach((v, k) => { reqHeaders[k] = v; });
        }
        // Overlay with explicit init headers (take precedence).
        if (init?.headers) {
          new Headers(init.headers as HeadersInit).forEach((v, k) => { reqHeaders[k] = v; });
        }

        const data = await proxyRequest(reqUrl, reqMethod, reqHeaders);

        // Capture the 402 for the UI before wrapFetchWithPayment processes it.
        // Only treat it as "payment required" if there is NO `payment-response` header
        // (which indicates this is a settlement failure response, not a new 402 challenge).
        const isSettlementFailure = !!data.headers['payment-response'];
        if (data.status === 402 && !isSettlementFailure) {
          setState(s => ({
            ...s,
            step: 'building_payment',
            initialResponse: { status: data.status, headers: data.headers, body: data.body },
            paymentRequirements: parsePaymentRequirements(data.body, data.headers) ?? s.paymentRequirements,
          }));
        }

        return new Response(data.body || null, {
          status: data.status,
          statusText: data.statusText,
          headers: new Headers(data.headers),
        });
      };

      // Freighter-backed signer for ExactStellarScheme (v2 / Soroban).
      // AssembledTransaction.signAuthEntries() only passes { address } (not networkPassphrase),
      // so we close over `passphrase` which is set from the onBeforePaymentCreation hook.
      const walletConnected = wallet.connected && !!wallet.publicKey;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stellarSigner: any = {
        // Use actual keys when connected, stubs otherwise (hook aborts before signing).
        address: wallet.publicKey ?? '',
        signAuthEntry: walletConnected
          ? (entryXdr: string) => signAuthEntry(entryXdr, { networkPassphrase: passphrase })
          : async () => { throw new Error('Wallet not connected'); },
        signTransaction: walletConnected
          ? (txXdr: string) => signTransaction(txXdr, { networkPassphrase: passphrase })
          : async () => { throw new Error('Wallet not connected'); },
      };

      // x402Client from @x402/fetch — registers schemes for Stellar networks.
      // Schemes are always registered (so the version/network lookup never fails).
      // The onBeforePaymentCreation hook aborts early if the wallet isn't connected.
      const x402CoreClient = new x402Client()
        .onBeforePaymentCreation(async ctx => {
          if (!walletConnected) {
            return { abort: true, reason: 'Wallet not connected. Please connect Freighter to make payments.' };
          }
          // Resolve the correct network passphrase before signAuthEntries is called.
          const network = (ctx.selectedRequirements as Record<string, unknown>).network as string;
          passphrase = getNetworkPassphrase(network ?? 'stellar:testnet');
          setState(s => ({ ...s, step: 'signing' }));
        })
        .onAfterPaymentCreation(async ctx => {
          const header = encodePaymentSignatureHeader(ctx.paymentPayload);
          setState(s => ({ ...s, step: 'sending_payment', signedPayment: header }));
        });

      // ExactStellarScheme (v2) builds Soroban SAC transfer transactions for both
      // simulated endpoints (now v2) and external x402 endpoints.
      const scheme = new ExactStellarScheme(stellarSigner);

      x402CoreClient
        .register('stellar:testnet', scheme)
        .register('stellar:mainnet', scheme);

      // wrapFetchWithPayment from @x402/fetch handles the full protocol:
      //   initial request → detect 402 → build + sign payment → retry with X-PAYMENT header
      const fetchWithPayment = wrapFetchWithPayment(proxyFetch, x402CoreClient);
      const response = await fetchWithPayment(url, { method });

      const responseBody = await response.text();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => { responseHeaders[k] = v; });

      let paymentResponse: FacilitatorSettleResponse | undefined;
      // v2 uses `payment-response`; v1 used `x-payment-response` — check both.
      const settleHeader = responseHeaders['payment-response'] ?? responseHeaders['x-payment-response'];
      if (settleHeader) {
        try { paymentResponse = JSON.parse(atob(settleHeader)); } catch { /* ignore */ }
      }

      setState(s => ({
        ...s,
        step: 'complete',
        finalResponse: { status: response.status, headers: responseHeaders, body: responseBody, paymentResponse },
      }));
    } catch (err) {
      setState(s => ({ ...s, step: 'error', error: (err as Error).message }));
    }
  }, [url, method, wallet]);

  const reset = () => setState({ step: 'idle' });

  const isRunning =
    state.step === 'sending_initial' ||
    state.step === 'building_payment' ||
    state.step === 'signing' ||
    state.step === 'sending_payment';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Config */}
      <div className="space-y-5">
        {/* Wallet */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <Wallet size={14} className="text-stellar-500" />
            Freighter Wallet
          </h2>

          {!wallet.connected ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Connect your Freighter wallet to sign Stellar payment transactions for x402.
              </p>
              <button
                onClick={connectWallet}
                disabled={connectingWallet}
                className="btn-primary w-full justify-center"
              >
                {connectingWallet ? <RefreshCw size={14} className="animate-spin" /> : <Wallet size={14} />}
                {connectingWallet ? 'Connecting…' : 'Connect Freighter'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                Don't have Freighter?{' '}
                <a href="https://freighter.app" target="_blank" rel="noreferrer" className="text-stellar-500 hover:underline">
                  freighter.app
                </a>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-green-600 font-medium">Connected</span>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400 mb-0.5">Public Key</p>
                <p className="font-mono text-xs text-stellar-600 break-all">{wallet.publicKey}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge-blue">Stellar Testnet</span>
                <a
                  href={`https://stellar.expert/explorer/testnet/account/${wallet.publicKey}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gray-400 hover:text-stellar-500 flex items-center gap-1"
                >
                  Explorer <ExternalLink size={11} />
                </a>
                <button onClick={disconnectWallet} className="ml-auto text-xs text-gray-400 hover:text-red-500">
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Request config */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Globe size={14} className="text-stellar-500" />
            Request Configuration
          </h2>

          <div className="flex gap-2">
            <select
              className="select w-28 shrink-0"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input
              className="input flex-1"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/premium  or  http://localhost:3001/sim/..."
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={sendRequest}
              disabled={!url || isRunning}
              className="btn-primary flex-1 justify-center"
            >
              {isRunning ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              {isRunning ? 'Processing…' : 'Send Request'}
            </button>
            {state.step !== 'idle' && (
              <button onClick={reset} className="btn-secondary" title="Reset">
                <RefreshCw size={14} />
              </button>
            )}
          </div>

          {/* Step tracker */}
          {state.step !== 'idle' && (
            <div className="border-t border-gray-200 pt-3">
              <StepTracker current={state.step} />
            </div>
          )}
        </div>

        {/* 402 payment info — shown while the payment flow is in progress */}
        {state.paymentRequirements && isRunning && (
          <div className="card border-amber-200 bg-amber-50 space-y-3">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-amber-500" />
              <span className="text-sm font-semibold text-amber-700">Payment Required (402)</span>
            </div>
            {state.paymentRequirements.accepts.map((opt, i) => (
              <div key={i} className="bg-white border border-amber-100 rounded-lg p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Amount</span>
                  <span className="font-bold text-amber-700">
                    {opt.maxAmountRequired} {friendlyAssetName(opt.asset)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Network</span>
                  <span className="badge-blue">{opt.network}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Pay To</span>
                  <span className="font-mono text-stellar-600">
                    {opt.payTo.slice(0, 8)}…{opt.payTo.slice(-6)}
                  </span>
                </div>
                {opt.description && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">For</span>
                    <span className="text-gray-600">{opt.description}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Response panels */}
      <div className="space-y-4">
        {state.step === 'idle' && (
          <div className="card text-center py-16 text-gray-400 space-y-2">
            <Globe size={28} className="mx-auto text-gray-300" />
            <p className="text-sm">Enter a URL and send a request to start the x402 flow.</p>
            <p className="text-xs">
              Use the Server Simulator to create a test endpoint, then paste its URL here.
            </p>
          </div>
        )}

        {/* Initial 402 response */}
        {state.initialResponse && state.step !== 'complete' && (
          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <span className={`font-bold text-sm ${state.initialResponse.status === 402 ? 'text-amber-600' : 'text-green-600'}`}>
                {state.initialResponse.status}
              </span>
              <span className="text-xs text-gray-400">Initial Response</span>
            </div>
            <JsonBlock data={state.initialResponse.body} label="Body" />
          </div>
        )}

        {/* Signed payment header preview */}
        {state.signedPayment && (
          <div className="card space-y-2">
            <p className="label">X-PAYMENT Header (base64)</p>
            <div className="code-block text-stellar-600 text-xs break-all max-h-20">
              {state.signedPayment}
            </div>
            <p className="label mt-1">Decoded Payload</p>
            <JsonBlock data={JSON.parse(atob(state.signedPayment))} />
          </div>
        )}

        {/* Final response */}
        {state.step === 'complete' && state.finalResponse && (
          <div className="space-y-3">
            {/* Payment settlement failure banner — shown before the response body */}
            {state.finalResponse.paymentResponse &&
              !state.finalResponse.paymentResponse.success &&
              state.finalResponse.paymentResponse.errorReason && (
              <div className="card border-red-200 bg-red-50 space-y-2">
                <div className="flex items-center gap-2">
                  <XCircle size={14} className="text-red-500 shrink-0" />
                  <span className="text-sm font-semibold text-red-700">Payment Settlement Failed</span>
                </div>
                <p className="text-xs font-mono text-red-600 break-all">
                  {state.finalResponse.paymentResponse.errorReason}
                </p>
                {state.finalResponse.paymentResponse.errorReason === 'invalid_exact_stellar_payload_simulation_failed' && (
                  <p className="text-xs text-gray-500">
                    The Soroban simulation of your transaction failed. Most likely your wallet doesn&apos;t have
                    sufficient balance of the required asset on testnet.{' '}
                    <a
                      href={`https://friendbot.stellar.org/?addr=${state.finalResponse.paymentResponse.payer ?? ''}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-stellar-500 hover:underline"
                    >
                      Fund with Friendbot (XLM)
                    </a>
                  </p>
                )}
                {state.finalResponse.paymentResponse.errorReason === 'invalid_exact_stellar_payload_missing_payer_signature' && (
                  <p className="text-xs text-gray-500">
                    The auth entry in your transaction is not signed. Make sure Freighter is unlocked and
                    connected to the correct network, then try again.
                  </p>
                )}
              </div>
            )}

            <div className="card space-y-3">
              <div className="flex items-center gap-2">
                {state.finalResponse.status < 300 ? (
                  <CheckCircle2 size={16} className="text-green-500" />
                ) : (
                  <XCircle size={16} className="text-red-500" />
                )}
                <span className={`font-bold text-sm ${state.finalResponse.status < 300 ? 'text-green-600' : 'text-red-600'}`}>
                  {state.finalResponse.status}
                </span>
                <span className="text-xs text-gray-400">Final Response</span>
              </div>
              <JsonBlock data={state.finalResponse.body} label="Body" />
            </div>

            {state.finalResponse.paymentResponse && (
              <div className="card space-y-3">
                <div className="flex items-center gap-2">
                  <Zap size={13} className="text-stellar-500" />
                  <span className="text-xs font-semibold text-gray-700">PAYMENT-RESPONSE</span>
                  {state.finalResponse.paymentResponse.success ? (
                    <span className="badge-green ml-auto">Settled</span>
                  ) : (
                    <span className="badge-red ml-auto">Failed</span>
                  )}
                </div>

                {state.finalResponse.paymentResponse.transaction && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400 mb-1">Transaction Hash</p>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-stellar-600 break-all">
                        {state.finalResponse.paymentResponse.transaction}
                      </span>
                      <a
                        href={`https://stellar.expert/explorer/${
                          state.finalResponse.paymentResponse.network === 'stellar:mainnet' ? 'public' : 'testnet'
                        }/tx/${state.finalResponse.paymentResponse.transaction}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-gray-400 hover:text-stellar-500"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                )}

                {state.finalResponse.paymentResponse.payer && (
                  <div>
                    <p className="text-xs text-gray-400">Payer</p>
                    <p className="font-mono text-xs text-stellar-600 break-all">
                      {state.finalResponse.paymentResponse.payer}
                    </p>
                  </div>
                )}

                <JsonBlock data={state.finalResponse.paymentResponse} label="Full Payload" />
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {state.step === 'error' && state.error && (
          <div className="card border-red-200 bg-red-50 space-y-2">
            <div className="flex items-center gap-2">
              <XCircle size={14} className="text-red-500" />
              <span className="text-sm font-semibold text-red-700">Error</span>
            </div>
            <p className="text-xs text-red-600 font-mono">{state.error}</p>
            <button onClick={reset} className="btn-secondary text-xs">
              <RefreshCw size={12} /> Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
