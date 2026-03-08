output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive   = true
}

output "dynamodb_audit_table" {
  description = "DynamoDB audit logs table name"
  value       = aws_dynamodb_table.audit_logs.name
}

output "s3_reports_bucket" {
  description = "S3 reports bucket name"
  value       = aws_s3_bucket.reports.id
}

output "s3_frontend_bucket" {
  description = "S3 frontend bucket name"
  value       = aws_s3_bucket.frontend.id
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS name"
  value       = aws_lb.main.dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecr_repository_url" {
  description = "ECR repository URL for backend"
  value       = aws_ecr_repository.backend.repository_url
}

output "sqs_report_queue_url" {
  description = "SQS report generation queue URL"
  value       = aws_sqs_queue.report_generation.url
}

output "sns_notification_topic_arn" {
  description = "SNS notification topic ARN"
  value       = aws_sns_topic.notifications.arn
}
