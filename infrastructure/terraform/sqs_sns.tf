# SQS Queue for Report Generation
resource "aws_sqs_queue" "report_generation" {
  name                       = "admin-panel-report-generation-${var.environment}"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 1209600  # 14 days
  receive_wait_time_seconds  = 10
  visibility_timeout_seconds = 300

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.report_generation_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "admin-panel-report-generation-${var.environment}"
  }
}

# Dead Letter Queue for Report Generation
resource "aws_sqs_queue" "report_generation_dlq" {
  name                      = "admin-panel-report-generation-dlq-${var.environment}"
  message_retention_seconds = 1209600  # 14 days

  tags = {
    Name = "admin-panel-report-generation-dlq-${var.environment}"
  }
}

# SNS Topic for Notifications
resource "aws_sns_topic" "notifications" {
  name = "admin-panel-notifications-${var.environment}"

  tags = {
    Name = "admin-panel-notifications-${var.environment}"
  }
}

# SNS Topic Subscription for Email Notifications
resource "aws_sns_topic_subscription" "email_notifications" {
  topic_arn = aws_sns_topic.notifications.arn
  protocol  = "email"
  endpoint  = "admin@example.com"  # Replace with actual email
}

# Lambda Function for Report Generation
resource "aws_lambda_function" "report_generation" {
  filename         = "lambda_report_generation.zip"
  function_name    = "admin-panel-report-generation-${var.environment}"
  role             = aws_iam_role.lambda_report_generation.arn
  handler          = "index.handler"
  source_code_hash = filebase64sha256("lambda_report_generation.zip")
  runtime          = "nodejs18.x"
  timeout          = 300
  memory_size      = 1024

  environment {
    variables = {
      DYNAMODB_AUDIT_TABLE        = aws_dynamodb_table.audit_logs.name
      S3_REPORTS_BUCKET           = aws_s3_bucket.reports.id
      SNS_NOTIFICATION_TOPIC_ARN  = aws_sns_topic.notifications.arn
    }
  }

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  tags = {
    Name = "admin-panel-report-generation-${var.environment}"
  }
}

# Lambda Security Group
resource "aws_security_group" "lambda" {
  name        = "admin-panel-lambda-sg-${var.environment}"
  description = "Security group for Lambda functions"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = {
    Name = "admin-panel-lambda-sg-${var.environment}"
  }
}

# Lambda IAM Role
resource "aws_iam_role" "lambda_report_generation" {
  name = "admin-panel-lambda-report-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "admin-panel-lambda-report-${var.environment}"
  }
}

# Lambda IAM Policy
resource "aws_iam_role_policy" "lambda_report_generation" {
  name = "admin-panel-lambda-report-policy-${var.environment}"
  role = aws_iam_role.lambda_report_generation.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:GetItem"
        ]
        Resource = [
          aws_dynamodb_table.audit_logs.arn,
          "${aws_dynamodb_table.audit_logs.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.reports.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.notifications.arn
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface"
        ]
        Resource = "*"
      }
    ]
  })
}

# Lambda Event Source Mapping
resource "aws_lambda_event_source_mapping" "report_generation" {
  event_source_arn = aws_sqs_queue.report_generation.arn
  function_name    = aws_lambda_function.report_generation.arn
  batch_size       = 1
}
