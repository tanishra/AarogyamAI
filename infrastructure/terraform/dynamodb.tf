# DynamoDB Table for Audit Logs
resource "aws_dynamodb_table" "audit_logs" {
  name           = "admin-panel-audit-logs-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  range_key      = "timestamp"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "N"
  }

  attribute {
    name = "actionType"
    type = "S"
  }

  attribute {
    name = "resource"
    type = "S"
  }

  # GSI for filtering by action type
  global_secondary_index {
    name            = "actionType-timestamp-index"
    hash_key        = "actionType"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # GSI for filtering by resource
  global_secondary_index {
    name            = "resource-timestamp-index"
    hash_key        = "resource"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.environment == "prod" ? true : false
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name = "admin-panel-audit-logs-${var.environment}"
  }
}

# DynamoDB Table for Anomaly Alerts
resource "aws_dynamodb_table" "anomaly_alerts" {
  name           = "admin-panel-anomaly-alerts-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"
  range_key      = "timestamp"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "N"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  # GSI for querying alerts by user
  global_secondary_index {
    name            = "userId-timestamp-index"
    hash_key        = "userId"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.environment == "prod" ? true : false
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name = "admin-panel-anomaly-alerts-${var.environment}"
  }
}
