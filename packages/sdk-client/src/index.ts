import type { CreatePIReq, CreatePIRes, CapturePIReq, ReportQuery, ReportRes, LoginReq, LoginRes, TerminalConnectionToken } from '@be/shared';

export class ApiClient {
  constructor(private baseUrl: string, private token?: string) {}

  setToken(token: string) { this.token = token; }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(new URL(path, this.baseUrl), {
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      ...init,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  login(body: LoginReq) { return this.req<LoginRes>('/auth/login', { method: 'POST', body: JSON.stringify(body) }); }
  createPI(body: CreatePIReq) { return this.req<CreatePIRes>('/payments/intents', { method: 'POST', body: JSON.stringify(body) }); }
  capturePI(body: CapturePIReq) { return this.req<{ ok: boolean }>(`/payments/capture`, { method: 'POST', body: JSON.stringify(body) }); }
  getSummary(q: ReportQuery) {
    const params = new URLSearchParams(q as any).toString();
    return this.req<ReportRes>(`/reports/summary?${params}`);
  }
  createConnectionToken() { return this.req<TerminalConnectionToken>('/terminal/connection_token', { method: 'POST' }); }
}