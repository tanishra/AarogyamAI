-- llm_calls: safety-review audit trail for every LLM invocation.
-- Stores hashes and category names ONLY — never raw prompt/response text.
-- The input/output hashes let reviewers prove two calls saw the same text
-- without persisting the text itself.

CREATE TABLE IF NOT EXISTS llm_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caller VARCHAR(64) NOT NULL DEFAULT 'chat',
    provider VARCHAR(32),
    input_hash CHAR(64),
    output_hash CHAR(64),
    pii_categories JSONB NOT NULL DEFAULT '[]',
    filter_categories JSONB NOT NULL DEFAULT '[]',
    outcome VARCHAR(16) NOT NULL,          -- success | blocked | failed
    latency_ms INTEGER,
    error_kind VARCHAR(64),               -- exception name on failure
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_calls_created_at ON llm_calls(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_calls_outcome ON llm_calls(outcome);
CREATE INDEX IF NOT EXISTS idx_llm_calls_caller ON llm_calls(caller);
