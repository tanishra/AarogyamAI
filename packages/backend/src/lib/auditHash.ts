import { createHash } from 'crypto';

/**
 * Compute the SHA-256 chain hash for an audit log entry.
 * Shared by AuditLogRepository (writes) and AuditLogService (writes +
 * verify) so both produce identical digests for identical inputs.
 *
 * Canonical form: keys sorted, undefined normalized to null — otherwise a
 * write-side `{ errorDetails: undefined }` and a read-side
 * `{ errorDetails: null }` would serialize differently and every row
 * would read as tampered.
 */
export function computeAuditHash(
  entry: Record<string, unknown>,
  previousHash: string | null
): string {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(entry).sort()) {
    normalized[key] = entry[key] ?? null;
  }
  normalized['previousHash'] = previousHash ?? null;
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
