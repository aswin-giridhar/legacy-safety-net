export interface AuditEntry {
  id: string;
  time: string;
  request: string;
  target: string;
  affected: number;
  highRisk: number;
  approver: string;
  hash: string;
}

// Small non-cryptographic content hash (djb2) — a traceability gesture, not security.
export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}
