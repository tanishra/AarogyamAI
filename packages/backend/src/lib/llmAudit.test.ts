import { describe, it, expect } from 'vitest';
import { getDatabasePool } from '../config/database';
import { logLlmCall } from './llmAudit';

/**
 * llm_calls audit trail — writes rows against the real test DB.
 * Asserts hashes/categories/outcome land; no raw text ever stored.
 */
describe('logLlmCall', () => {
  it('writes an audit row with hashes and categories', async () => {
    const pool = getDatabasePool();
    const inputHash = 'a'.repeat(64);
    const outputHash = 'b'.repeat(64);

    logLlmCall({
      caller: 'patientChat',
      provider: 'openai',
      inputHash,
      outputHash,
      piiCategories: ['phone', 'name_context'],
      filterCategories: [],
      outcome: 'success',
      latencyMs: 412,
    });

    // fire-and-forget — give the insert a beat to land
    await new Promise((r) => setTimeout(r, 300));

    const res = await pool.query(
      `SELECT caller, provider, input_hash, output_hash, pii_categories,
              outcome, latency_ms
         FROM llm_calls WHERE input_hash = $1`,
      [inputHash],
    );
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0];
    expect(row.caller).toBe('patientChat');
    expect(row.provider).toBe('openai');
    expect(row.outcome).toBe('success');
    expect(row.latency_ms).toBe(412);
    expect(row.pii_categories).toEqual(['phone', 'name_context']);

    await pool.query(`DELETE FROM llm_calls WHERE input_hash = $1`, [inputHash]);
  });

  it('records blocked outcomes with filter categories', async () => {
    const pool = getDatabasePool();
    const inputHash = 'c'.repeat(64);

    logLlmCall({
      caller: 'generateClinicalConsiderations',
      provider: 'bedrock',
      inputHash,
      filterCategories: ['dosage_instruction', 'medication_directive'],
      outcome: 'blocked',
      latencyMs: 900,
    });
    await new Promise((r) => setTimeout(r, 300));

    const res = await pool.query(
      `SELECT outcome, filter_categories FROM llm_calls WHERE input_hash = $1`,
      [inputHash],
    );
    expect(res.rows[0].outcome).toBe('blocked');
    expect(res.rows[0].filter_categories).toEqual(['dosage_instruction', 'medication_directive']);

    await pool.query(`DELETE FROM llm_calls WHERE input_hash = $1`, [inputHash]);
  });

  it('never throws when fields are absent', () => {
    expect(() => logLlmCall({ caller: 'chat', outcome: 'failed' })).not.toThrow();
  });
});
