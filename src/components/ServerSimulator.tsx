import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Copy, Check, RefreshCw, ChevronDown, ChevronUp,
  Server, Activity, AlertCircle, CheckCircle2, Clock, XCircle,
} from 'lucide-react';
import type { EndpointConfig, RequestLog, HttpMethod, StellarAsset, StellarNetwork } from '../types';
import { API_BASE } from '../api';

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`);
  return r.json();
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function apiDelete(path: string): Promise<void> {
  await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
}

// ─── Form defaults ────────────────────────────────────────────────────────────

const DEFAULT_SUCCESS_BODY = JSON.stringify(
  { success: true, data: { message: 'Payment verified. Here is your protected resource.', timestamp: '{{iso}}' } },
  null,
  2
);

const DEFAULT_FAILURE_BODY = JSON.stringify(
  { error: 'Payment verification failed', code: 'PAYMENT_INVALID' },
  null,
  2
);

type FormState = Omit<EndpointConfig, 'id' | 'createdAt'>;

function emptyForm(): FormState {
  return {
    method: 'GET',
    path: '/premium-data',
    description: 'My premium endpoint',
    payment: {
      amount: '1.0000000',
      asset: 'XLM',
      network: 'stellar:testnet',
      payTo: '',
      maxTimeoutSeconds: 300,
      description: 'Access to premium data',
    },
    successResponse: {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: DEFAULT_SUCCESS_BODY,
    },
    failureResponse: {
      statusCode: 402,
      headers: {},
      body: DEFAULT_FAILURE_BODY,
    },
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'badge-green',
    POST: 'badge-blue',
    PUT: 'badge-amber',
    PATCH: 'badge-amber',
    DELETE: 'badge-red',
  };
  return <span className={colors[method] ?? 'badge-gray'}>{method}</span>;
}

function LogEntry({ log }: { log: RequestLog }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        {log.paymentValid === true ? (
          <CheckCircle2 size={13} className="text-green-500 shrink-0" />
        ) : log.paymentValid === false ? (
          <XCircle size={13} className="text-red-500 shrink-0" />
        ) : (
          <Clock size={13} className="text-amber-500 shrink-0" />
        )}
        <span className="font-mono text-gray-500">{log.method}</span>
        <span className="font-mono text-gray-800">{log.endpointPath}</span>
        <span
          className={`ml-auto font-bold ${
            log.responseStatus < 300
              ? 'text-green-600'
              : log.responseStatus === 402
                ? 'text-amber-600'
                : 'text-red-600'
          }`}
        >
          {log.responseStatus}
        </span>
        <span className="text-gray-400 ml-2">
          {new Date(log.timestamp).toLocaleTimeString()}
        </span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="bg-white px-3 py-2 border-t border-gray-200 space-y-1">
          <div className="flex gap-6 flex-wrap">
            <span>
              <span className="text-gray-400">Payment: </span>
              <span className={log.hasPayment ? 'text-green-600' : 'text-gray-400'}>
                {log.hasPayment ? 'Yes' : 'No'}
              </span>
            </span>
            {log.payer && (
              <span>
                <span className="text-gray-400">Payer: </span>
                <span className="font-mono text-stellar-600 break-all">{log.payer}</span>
              </span>
            )}
            {log.txHash && (
              <span>
                <span className="text-gray-400">Tx: </span>
                <span className="font-mono text-stellar-600 break-all">{log.txHash}</span>
              </span>
            )}
            {log.error && (
              <span>
                <span className="text-gray-400">Error: </span>
                <span className="text-red-600">{log.error}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Endpoint card ────────────────────────────────────────────────────────────

function EndpointCard({
  endpoint,
  onDelete,
}: {
  endpoint: EndpointConfig;
  onDelete: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const simUrl = `https://api.x402test.org/sim/${endpoint.id}`;

  const copy = () => {
    navigator.clipboard.writeText(simUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <MethodBadge method={endpoint.method} />
            <span className="font-mono text-sm text-gray-800">{endpoint.path}</span>
            <span className="text-gray-400 text-xs">{endpoint.description}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-xs text-gray-400 truncate">{simUrl}</span>
            <button onClick={copy} className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
              {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="badge-amber">
              {endpoint.payment.amount} {endpoint.payment.asset}
            </span>
            <span className="badge-blue">{endpoint.payment.network}</span>
            {endpoint.payment.payTo && (
              <span className="badge-gray font-mono">
                {endpoint.payment.payTo.slice(0, 8)}…{endpoint.payment.payTo.slice(-6)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onDelete(endpoint.id)}
          className="shrink-0 text-gray-300 hover:text-red-500 transition-colors"
          title="Delete endpoint"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

// ─── Create endpoint form ─────────────────────────────────────────────────────

function CreateEndpointForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [section, setSection] = useState<'basic' | 'success' | 'failure'>('basic');

  const set = (path: string, value: unknown) => {
    setForm((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as FormState;
      const keys = path.split('.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let obj: any = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const submit = async () => {
    if (!form.payment.payTo) {
      setError('Receiving address (payTo) is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiPost('/api/endpoints', form);
      onCreated();
      setForm(emptyForm());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'basic', label: 'Endpoint & Payment' },
    { id: 'success', label: 'Success Response' },
    { id: 'failure', label: 'Failure Response' },
  ] as const;

  return (
    <div className="card space-y-4">
      <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <Plus size={15} className="text-stellar-500" />
        Create Simulated Endpoint
      </h2>

      {/* Section tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-all ${
              section === t.id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Basic */}
      {section === 'basic' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Method</label>
              <select
                className="select"
                value={form.method}
                onChange={(e) => set('method', e.target.value as HttpMethod)}
              >
                {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Path</label>
              <input
                className="input"
                value={form.path}
                onChange={(e) => set('path', e.target.value)}
                placeholder="/api/premium"
              />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <input
              className="input"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="What does this endpoint serve?"
            />
          </div>
          <hr className="border-gray-200" />
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Payment Requirements</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Network</label>
              <select
                className="select"
                value={form.payment.network}
                onChange={(e) => set('payment.network', e.target.value as StellarNetwork)}
              >
                <option value="stellar:testnet">Stellar Testnet</option>
                <option value="stellar:mainnet">Stellar Mainnet</option>
              </select>
            </div>
            <div>
              <label className="label">Asset</label>
              <select
                className="select"
                value={form.payment.asset}
                onChange={(e) => set('payment.asset', e.target.value as StellarAsset)}
              >
                <option value="XLM">XLM (Stellar Lumens)</option>
                <option value="USDC">USDC</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount Required</label>
              <input
                className="input"
                value={form.payment.amount}
                onChange={(e) => set('payment.amount', e.target.value)}
                placeholder="1.0000000"
              />
            </div>
            <div>
              <label className="label">Timeout (seconds)</label>
              <input
                className="input"
                type="number"
                value={form.payment.maxTimeoutSeconds}
                onChange={(e) => set('payment.maxTimeoutSeconds', parseInt(e.target.value))}
              />
            </div>
          </div>
          <div>
            <label className="label">Receiving Address (payTo)</label>
            <input
              className="input font-mono"
              value={form.payment.payTo}
              onChange={(e) => set('payment.payTo', e.target.value)}
              placeholder="G... (Stellar account address)"
            />
          </div>
          <div>
            <label className="label">Payment Description (optional)</label>
            <input
              className="input"
              value={form.payment.description ?? ''}
              onChange={(e) => set('payment.description', e.target.value)}
              placeholder="Access to premium content"
            />
          </div>
        </div>
      )}

      {/* Success Response */}
      {section === 'success' && (
        <div className="space-y-3">
          <div>
            <label className="label">Status Code</label>
            <input
              className="input w-32"
              type="number"
              value={form.successResponse.statusCode}
              onChange={(e) => set('successResponse.statusCode', parseInt(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Response Body (JSON)</label>
            <textarea
              className="input font-mono h-40 resize-none"
              value={form.successResponse.body}
              onChange={(e) => set('successResponse.body', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Extra Headers (JSON object)</label>
            <input
              className="input font-mono"
              value={JSON.stringify(form.successResponse.headers)}
              onChange={(e) => {
                try {
                  set('successResponse.headers', JSON.parse(e.target.value));
                } catch {
                  // ignore invalid JSON while typing
                }
              }}
              placeholder='{"X-Custom": "value"}'
            />
          </div>
        </div>
      )}

      {/* Failure Response */}
      {section === 'failure' && (
        <div className="space-y-3">
          <div>
            <label className="label">Status Code</label>
            <input
              className="input w-32"
              type="number"
              value={form.failureResponse.statusCode}
              onChange={(e) => set('failureResponse.statusCode', parseInt(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Response Body (JSON)</label>
            <textarea
              className="input font-mono h-32 resize-none"
              value={form.failureResponse.body}
              onChange={(e) => set('failureResponse.body', e.target.value)}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={13} />
          {error}
        </div>
      )}

      <button onClick={submit} disabled={saving} className="btn-primary w-full justify-center">
        {saving ? (
          <RefreshCw size={14} className="animate-spin" />
        ) : (
          <Plus size={14} />
        )}
        {saving ? 'Creating…' : 'Create Endpoint'}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ServerSimulator() {
  const [endpoints, setEndpoints] = useState<EndpointConfig[]>([]);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadEndpoints = useCallback(async () => {
    const data = await apiGet<EndpointConfig[]>('/api/endpoints');
    setEndpoints(data);
  }, []);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    const data = await apiGet<RequestLog[]>('/api/logs');
    setLogs(data);
    setLoadingLogs(false);
  }, []);

  useEffect(() => {
    loadEndpoints();
    loadLogs();
    const interval = setInterval(loadLogs, 3000);
    return () => clearInterval(interval);
  }, [loadEndpoints, loadLogs]);

  const deleteEndpoint = async (id: string) => {
    await apiDelete(`/api/endpoints/${id}`);
    await loadEndpoints();
  };

  const clearLogs = async () => {
    await apiDelete('/api/logs');
    setLogs([]);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Create + Endpoints */}
      <div className="space-y-5">
        <CreateEndpointForm onCreated={loadEndpoints} />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Server size={14} className="text-stellar-500" />
              Simulated Endpoints
              <span className="badge-gray">{endpoints.length}</span>
            </h2>
            <button onClick={loadEndpoints} className="text-gray-400 hover:text-gray-600 transition-colors">
              <RefreshCw size={13} />
            </button>
          </div>

          {endpoints.length === 0 ? (
            <div className="card text-center py-8 text-gray-400 text-sm">
              No endpoints yet. Create one above.
            </div>
          ) : (
            <div className="space-y-2">
              {endpoints.map((ep) => (
                <EndpointCard key={ep.id} endpoint={ep} onDelete={deleteEndpoint} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Logs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Activity size={14} className="text-stellar-500" />
            Request Log
            <span className="badge-gray">{logs.length}</span>
            {loadingLogs && <RefreshCw size={11} className="animate-spin text-gray-400" />}
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={loadLogs} className="text-gray-400 hover:text-gray-600 transition-colors" title="Refresh">
              <RefreshCw size={13} />
            </button>
            {logs.length > 0 && (
              <button onClick={clearLogs} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-green-500" /> Payment OK</span>
          <span className="flex items-center gap-1"><XCircle size={11} className="text-red-500" /> Payment Failed</span>
          <span className="flex items-center gap-1"><Clock size={11} className="text-amber-500" /> No Payment</span>
        </div>

        <div className="space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto">
          {logs.length === 0 ? (
            <div className="card text-center py-8 text-gray-400 text-sm">
              No requests yet. Send a request to a simulated endpoint.
            </div>
          ) : (
            logs.map((log) => <LogEntry key={log.id} log={log} />)
          )}
        </div>
      </div>
    </div>
  );
}
