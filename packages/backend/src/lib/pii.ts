/**
 * PII helpers for the audit log. The hash chain is append-only and
 * replicated (exports, DynamoDB mirror), so entries carry masked
 * identifiers instead of raw PII. Full identity stays resolvable via
 * user_id against the users table.
 */

/** 'john.doe@example.com' → 'j***@example.com'; non-emails → 'x***' */
export function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at > 0) {
    return `${value[0]}***${value.slice(at)}`;
  }
  return value.length > 1 ? `${value[0]}***` : '***';
}
