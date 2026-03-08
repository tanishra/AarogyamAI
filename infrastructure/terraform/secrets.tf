# Secrets Manager - Database Credentials
resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "admin-panel/db-credentials-${var.environment}"
  description = "Database credentials for Admin Panel"

  tags = {
    Name = "admin-panel-db-credentials-${var.environment}"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_username
    password = var.db_password
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    database = var.db_name
    url      = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}"
  })
}

# Secrets Manager - Redis Credentials
resource "aws_secretsmanager_secret" "redis_credentials" {
  name        = "admin-panel/redis-credentials-${var.environment}"
  description = "Redis credentials for Admin Panel"

  tags = {
    Name = "admin-panel-redis-credentials-${var.environment}"
  }
}

resource "aws_secretsmanager_secret_version" "redis_credentials" {
  secret_id = aws_secretsmanager_secret.redis_credentials.id
  secret_string = jsonencode({
    host     = aws_elasticache_replication_group.main.primary_endpoint_address
    port     = 6379
    password = aws_elasticache_replication_group.main.auth_token
    url      = "rediss://:${aws_elasticache_replication_group.main.auth_token}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
  })
}

# Secrets Manager - JWT Secrets
resource "aws_secretsmanager_secret" "jwt_secrets" {
  name        = "admin-panel/jwt-secrets-${var.environment}"
  description = "JWT secrets for Admin Panel"

  tags = {
    Name = "admin-panel-jwt-secrets-${var.environment}"
  }
}

resource "aws_secretsmanager_secret_version" "jwt_secrets" {
  secret_id = aws_secretsmanager_secret.jwt_secrets.id
  secret_string = jsonencode({
    access  = random_password.jwt_access_secret.result
    refresh = random_password.jwt_refresh_secret.result
  })
}

# Random Passwords for JWT
resource "random_password" "jwt_access_secret" {
  length  = 64
  special = true
}

resource "random_password" "jwt_refresh_secret" {
  length  = 64
  special = true
}
