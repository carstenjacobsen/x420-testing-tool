import express from 'express';
import cors from 'cors';
import { store } from './store.js';
import * as facilitator from './facilitator.js';
import { getFacilitatorKeypair } from './facilitator-account.js';
import type {
  EndpointConfig,
  PaymentRequiredV2,
  PaymentRequirementsV2,
  PaymentPayloadV2,
} from './types.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ─── Facilitator routes (OpenZeppelin-compatible interface) ───────────────────

app.get('/api/facilitator/supported', (_req, res) => {
  res.json(facilitator.getSupportedNetworks());
});

app.post('/api/facilitator/verify', async (req, res) => {
  try {
    const result = await facilitator.verify(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ isValid: false, invalidReason: (err as Error).message });
  }
});

app.post('/api/facilitator/settle', async (req, res) => {
  try {
    const result = await facilitator.settle(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, errorReason: (err as Error).message });
  }
});

// ─── Endpoint management ──────────────────────────────────────────────────────

app.get('/api/endpoints', (_req, res) => {
  res.json(store.listEndpoints());
});

app.post('/api/endpoints', (req, res) => {
  try {
    const config = req.body as Omit<EndpointConfig, 'id' | 'createdAt'>;
    if (!config.method || !config.path || !config.payment) {
      res.status(400).json({ error: 'method, path, and payment are required' });
      return;
    }
    const endpoint = store.createEndpoint(config);
    res.status(201).json(endpoint);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put('/api/endpoints/:id', (req, res) => {
  const updated = store.updateEndpoint(req.params.id, req.body);
  if (!updated) {
    res.status(404).json({ error: 'Endpoint not found' });
    return;
  }
  res.json(updated);
});

app.delete('/api/endpoints/:id', (req, res) => {
  const ok = store.deleteEndpoint(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Endpoint not found' });
    return;
  }
  res.status(204).send();
});

// ─── Request logs ─────────────────────────────────────────────────────────────

app.get('/api/logs', (req, res) => {
  const { endpointId } = req.query;
  res.json(store.getLogs(typeof endpointId === 'string' ? endpointId : undefined));
});

app.delete('/api/logs', (_req, res) => {
  store.clearLogs();
  res.status(204).send();
});

// ─── Client simulator proxy ───────────────────────────────────────────────────
// Forwards requests to external x402 servers to avoid browser CORS issues.

app.post('/api/proxy', async (req, res) => {
  const { url, method = 'GET', headers = {}, body } = req.body as {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };

  if (!url) {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = body;
    }

    const response = await fetch(url, fetchOptions);
    const responseBody = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    res.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
    });
  } catch (err) {
    res.status(502).json({ error: `Proxy error: ${(err as Error).message}` });
  }
});

// ─── Simulated x402 endpoints ─────────────────────────────────────────────────
// Pattern: /sim/:endpointId[/anything]

app.all(/^\/sim\/([^/]+)(\/.*)?$/, async (req, res) => {
  const endpointId = req.params[0];
  const endpoint = store.getEndpoint(endpointId);

  if (!endpoint) {
    res.status(404).json({ error: 'Simulated endpoint not found' });
    return;
  }

  const resource = `http://localhost:${PORT}/sim/${endpointId}`;

  // x402 v2: payment arrives in PAYMENT-SIGNATURE header (base64 JSON PaymentPayload)
  const paymentSigHeader = req.headers['payment-signature'] as string | undefined;

  // ── No payment header → return 402 with v2 payment-required header ──
  if (!paymentSigHeader) {
    const sacAsset = facilitator.getSacAddress(endpoint.payment.asset, endpoint.payment.network);
    const amount = facilitator.toBaseUnits(endpoint.payment.amount);

    const paymentRequirements: PaymentRequirementsV2 = {
      scheme: 'exact',
      network: endpoint.payment.network,
      asset: sacAsset,
      amount,
      payTo: endpoint.payment.payTo,
      maxTimeoutSeconds: endpoint.payment.maxTimeoutSeconds,
      extra: { areFeesSponsored: true },
    };

    const paymentRequired: PaymentRequiredV2 = {
      x402Version: 2,
      error: 'Payment required',
      resource,
      accepts: [paymentRequirements],
    };

    const encodedHeader = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');

    store.addLog({
      endpointId: endpoint.id,
      endpointPath: endpoint.path,
      method: req.method,
      hasPayment: false,
      paymentValid: null,
      responseStatus: 402,
    });

    res
      .status(402)
      .set('payment-required', encodedHeader)
      .json({ error: 'Payment required', x402Version: 2 });
    return;
  }

  // ── Has payment header → decode and settle via facilitator ──
  let payload: PaymentPayloadV2;
  try {
    payload = JSON.parse(Buffer.from(paymentSigHeader, 'base64').toString('utf-8'));
  } catch {
    store.addLog({
      endpointId: endpoint.id,
      endpointPath: endpoint.path,
      method: req.method,
      hasPayment: true,
      paymentValid: false,
      responseStatus: 400,
      error: 'Malformed PAYMENT-SIGNATURE header',
    });
    res.status(400).json({ error: 'Malformed PAYMENT-SIGNATURE header (expected base64-encoded JSON)' });
    return;
  }

  const paymentRequirements: PaymentRequirementsV2 = {
    scheme: 'exact',
    network: endpoint.payment.network,
    asset: facilitator.getSacAddress(endpoint.payment.asset, endpoint.payment.network),
    amount: facilitator.toBaseUnits(endpoint.payment.amount),
    payTo: endpoint.payment.payTo,
    maxTimeoutSeconds: endpoint.payment.maxTimeoutSeconds,
    extra: { areFeesSponsored: true },
  };

  // Settle (verify + submit) the payment
  const settleResult = await facilitator.settle({ paymentRequirements, payload });

  if (!settleResult.success) {
    console.error(`[sim] Payment settlement failed: ${settleResult.errorReason} (payer: ${settleResult.payer ?? 'unknown'})`);
    const paymentResponseHeader = Buffer.from(JSON.stringify(settleResult)).toString('base64');

    store.addLog({
      endpointId: endpoint.id,
      endpointPath: endpoint.path,
      method: req.method,
      hasPayment: true,
      paymentValid: false,
      responseStatus: endpoint.failureResponse.statusCode,
      payer: settleResult.payer,
      error: settleResult.errorReason,
    });

    let failBody: unknown;
    try {
      failBody = JSON.parse(endpoint.failureResponse.body);
    } catch {
      failBody = endpoint.failureResponse.body;
    }

    // Merge the settlement error reason into the failure body so it's visible without
    // needing to decode the payment-response header.
    if (typeof failBody === 'object' && failBody !== null) {
      (failBody as Record<string, unknown>)['settlementError'] = settleResult.errorReason;
    }

    res
      .status(endpoint.failureResponse.statusCode)
      .set('payment-response', paymentResponseHeader)
      .json(failBody);
    return;
  }

  // ── Payment valid → return success response ──
  const paymentResponseHeader = Buffer.from(JSON.stringify(settleResult)).toString('base64');

  store.addLog({
    endpointId: endpoint.id,
    endpointPath: endpoint.path,
    method: req.method,
    hasPayment: true,
    paymentValid: true,
    responseStatus: endpoint.successResponse.statusCode,
    payer: settleResult.payer,
    txHash: settleResult.transaction,
  });

  let successBody: unknown;
  try {
    successBody = JSON.parse(endpoint.successResponse.body);
  } catch {
    successBody = endpoint.successResponse.body;
  }

  res
    .status(endpoint.successResponse.statusCode)
    .set('payment-response', paymentResponseHeader)
    .set(endpoint.successResponse.headers)
    .json(successBody);
});

app.listen(PORT, async () => {
  console.log(`\n⚡ x402 Testing Tool — server on http://localhost:${PORT}`);
  console.log(`   Facilitator: x402 v2 built-in (Soroban / SAC)`);
  console.log(`   Networks:    Stellar Testnet / Mainnet\n`);
  // Pre-initialise the facilitator keypair so Friendbot funding runs before the first request.
  try {
    const kp = await getFacilitatorKeypair();
    console.log(`   Facilitator account: ${kp.publicKey()}\n`);
  } catch (err) {
    console.warn(`   ⚠ Facilitator keypair init failed: ${(err as Error).message}`);
    console.warn(`   Set FACILITATOR_SECRET env var to use an existing funded account.\n`);
  }
});
