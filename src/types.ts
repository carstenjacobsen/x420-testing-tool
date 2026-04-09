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

// x402 protocol types
export interface PaymentOption {
  scheme: 'exact';
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  resource: string;
  description?: string;
  maxTimeoutSeconds: number;
}

export interface PaymentRequirements {
  x402Version: 1;
  accepts: PaymentOption[];
  error: string;
}

export interface StellarPaymentPayload {
  x402Version: number;
  scheme: 'exact';
  network: string;
  payload: {
    /** Full signed transaction XDR — used for classic assets and non-sponsored Soroban */
    signedXDR?: string;
    /** Signed Soroban authorization entry XDR — used when areFeesSponsored=true */
    signedAuthEntry?: string;
    from: string;
  };
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

export interface FacilitatorConfig {
  mode: 'builtin' | 'openzeppelin' | 'custom';
  url?: string;
  apiKey?: string;
}

// Freighter wallet state
export interface WalletState {
  connected: boolean;
  publicKey: string | null;
  network: string | null;
}

// Client simulator state
export type RequestStep =
  | 'idle'
  | 'sending_initial'
  | 'got_402'
  | 'building_payment'
  | 'signing'
  | 'sending_payment'
  | 'complete'
  | 'error';

export interface ClientRequestState {
  step: RequestStep;
  /** Raw PaymentRequired object decoded from the `payment-required` header (x402 v2). */
  rawPaymentRequired?: unknown;
  initialResponse?: {
    status: number;
    headers: Record<string, string>;
    body: string;
  };
  paymentRequirements?: PaymentRequirements;
  signedPayment?: string;
  finalResponse?: {
    status: number;
    headers: Record<string, string>;
    body: string;
    paymentResponse?: FacilitatorSettleResponse;
  };
  error?: string;
}
