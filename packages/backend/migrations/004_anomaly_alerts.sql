-- Create anomaly_alerts table for tracking detected anomalies
CREATE TABLE IF NOT EXISTS anomaly_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  user_name VARCHAR(255) NOT NULL,
  trigger_condition VARCHAR(100) NOT NULL,
  details TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX idx_anomaly_alerts_user_id ON anomaly_alerts(user_id);
CREATE INDEX idx_anomaly_alerts_acknowledged ON anomaly_alerts(acknowledged);
CREATE INDEX idx_anomaly_alerts_timestamp ON anomaly_alerts(timestamp);
CREATE INDEX idx_anomaly_alerts_trigger ON anomaly_alerts(trigger_condition);

-- Note: audit_logs table is stored in DynamoDB, not PostgreSQL
-- Hash columns are part of the DynamoDB schema

COMMENT ON TABLE anomaly_alerts IS 'Stores detected anomalies in user access patterns';
COMMENT ON COLUMN anomaly_alerts.trigger_condition IS 'Type of anomaly: high_frequency_access, off_hours_access, statistical_anomaly';
COMMENT ON COLUMN anomaly_alerts.details IS 'Detailed description of the anomaly';
