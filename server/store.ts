import { randomUUID } from 'crypto';
import type { EndpointConfig, RequestLog } from './types.js';

class Store {
  private endpoints: Map<string, EndpointConfig> = new Map();
  private logs: RequestLog[] = [];

  createEndpoint(config: Omit<EndpointConfig, 'id' | 'createdAt'>): EndpointConfig {
    const endpoint: EndpointConfig = {
      ...config,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.endpoints.set(endpoint.id, endpoint);
    return endpoint;
  }

  getEndpoint(id: string): EndpointConfig | undefined {
    return this.endpoints.get(id);
  }

  listEndpoints(): EndpointConfig[] {
    return Array.from(this.endpoints.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  updateEndpoint(id: string, updates: Partial<Omit<EndpointConfig, 'id' | 'createdAt'>>): EndpointConfig | null {
    const existing = this.endpoints.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.endpoints.set(id, updated);
    return updated;
  }

  deleteEndpoint(id: string): boolean {
    return this.endpoints.delete(id);
  }

  addLog(log: Omit<RequestLog, 'id' | 'timestamp'>): RequestLog {
    const entry: RequestLog = {
      ...log,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.logs.unshift(entry);
    if (this.logs.length > 200) {
      this.logs = this.logs.slice(0, 200);
    }
    return entry;
  }

  getLogs(endpointId?: string): RequestLog[] {
    if (endpointId) {
      return this.logs.filter((l) => l.endpointId === endpointId);
    }
    return this.logs;
  }

  clearLogs(): void {
    this.logs = [];
  }
}

export const store = new Store();
