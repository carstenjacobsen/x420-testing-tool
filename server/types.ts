export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type StellarNetwork = 'stellar:testnet' | 'stellar:mainnet';
export type StellarAsset = 'XLM' | 'USDC';

export interface PaymentConfig {
  amount: string;
  asset: StellarAsset;
  network: StellarNetwork;
  payTo: string;
  maxTimeoutSeconds: number;
  description?: string;
}

export interface ResponseConfig {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface EndpointConfig {
  id: string;
  method: HttpMethod;
  path: string;
  description: string;
  payment: PaymentConfig;
  successResponse: ResponseConfig;
  failureResponse: ResponseConfig;
  createdAt: string;
}

export interface RequestLog {
  id: string;
  endpointId: string;
  endpointPath: string;
  timestamp: string;
  method: string;
  hasPayment: boolean;
  paymentValid: boolean | null;
  responseStatus: number;
  payer?: string;
  txHash?: string;
  error?: string;
}

// ─── x402 v2 types ────────────────────────────────────────────────────────────

/** One entry in the `accepts` array of a v2 PaymentRequired response. */
export interface PaymentRequirementsV2 {
  scheme: string;
  network: string;
  asset: string;        // Soroban SAC contract address
  amount: string;       // integer base-unit string (e.g. "10000" = 0.001 USDC)
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

/** The v2 402 payment-required object (base64-encoded into the `payment-required` header). */
export interface PaymentRequiredV2 {
  x402Version: 2;
  error?: string;
  resource: string;
  accepts: PaymentRequirementsV2[];
}

/** The v2 payment payload decoded from the `payment-signature` request header. */
export interface PaymentPayloadV2 {
  x402Version: 2;
  resource?: string;
  accepted: PaymentRequirementsV2;
  payload: {
    transaction: string; // base64 XDR Soroban TransactionEnvelope
  };
  extensions?: Record<string, unknown>;
}

export interface FacilitatorVerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface FacilitatorSettleResponse {
  success: boolean;
  transaction?: string;
  network: string;
  payer?: string;
  errorReason?: string;
}
