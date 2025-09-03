export interface CreatePIReq { eventId: string; amount: number; currency: string }
export interface CreatePIRes { id: string; clientSecret: string }
export interface CapturePIReq { id: string }
export interface ReportQuery { eventId?: string; from?: string; to?: string }
export interface ReportRes { total: number; count: number; avg: number; fees: number; net: number }

export interface LoginReq { deviceLabel: string }
export interface LoginRes { token: string; deviceId: string; events: Array<{ id: string; name: string; currency: string }> }
export interface TerminalConnectionToken { secret: string }