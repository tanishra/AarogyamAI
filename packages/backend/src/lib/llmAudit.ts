import { getDatabasePool } from '../config/database';
import { logger } from './logger';

/**
 * llm_calls audit writer — fire-and-forget telemetry for LLM safety review.
 * Never throws: a logging failure must not break the clinical pipeline.
 * Nothing here ever writes raw prompt or response text — only sha256
 * hashes, category names, and timing.
 */
export interface LlmCallAudit {
  caller: string;
  provider?: string;
  inputHash?: string;
  outputHash?: string;
  piiCategories?: string[];
  filterCategories?: string[];
  outcome: 'success' | 'blocked' | 'failed';
  latencyMs?: number;
  errorKind?: string;
}

export function logLlmCall(entry: LlmCallAudit): void {
  try {
    const pool = getDatabasePool();
    pool
      .query(
        `INSERT INTO llm_calls
           (caller, provider, input_hash, output_hash, pii_categories,
            filter_categories, outcome, latency_ms, error_kind)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          entry.caller,
          entry.provider ?? null,
          entry.inputHash ?? null,
          entry.outputHash ?? null,
          JSON.stringify(entry.piiCategories ?? []),
          JSON.stringify(entry.filterCategories ?? []),
          entry.outcome,
          entry.latencyMs ?? null,
          entry.errorKind ?? null,
        ],
      )
      .catch((err) => {
        logger.warn('[llmAudit] failed to write llm_calls row', {
          error: err instanceof Error ? err.message : err,
        });
      });
  } catch (err) {
    // Pool not initialized (unit tests, early boot) — drop silently.
    logger.debug('[llmAudit] skipped (no pool)', {
      error: err instanceof Error ? err.message : err,
    });
  }
}
