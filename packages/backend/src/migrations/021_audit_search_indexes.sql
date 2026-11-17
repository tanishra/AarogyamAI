-- Migration 021: composite indexes for hot audit/search paths
-- Single-column indexes exist; filtered+sorted queries benefit from composites.

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp
  ON audit_logs(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_timestamp
  ON audit_logs(action_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_timestamp
  ON audit_logs(resource, resource_id, timestamp DESC);
