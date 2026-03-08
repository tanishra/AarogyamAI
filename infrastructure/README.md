# Infrastructure

This folder contains Terraform configuration for deploying AarogyamAI to AWS.

## Quick Start

**Option 1: Automated (Recommended)**
```bash
# From project root
./deploy-aws.sh
```

**Option 2: Manual**
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
terraform init
terraform plan
terraform apply
```

## What Gets Created

- **VPC** with public/private subnets across 2 availability zones
- **RDS PostgreSQL** database (t3.micro)
- **ElastiCache Redis** (t3.micro)
- **ECS Fargate** cluster with backend and frontend services
- **Application Load Balancer** for traffic distribution
- **S3 buckets** for reports and backups
- **DynamoDB** tables for audit logs
- **Security Groups** and IAM roles

## Configuration Files

- `main.tf` - Provider and backend configuration
- `vpc.tf` - VPC, subnets, and networking
- `rds.tf` - PostgreSQL database
- `elasticache.tf` - Redis cache
- `ecs.tf` - ECS cluster and services
- `alb.tf` - Application Load Balancer
- `s3.tf` - S3 buckets
- `dynamodb.tf` - DynamoDB tables
- `variables.tf` - Input variables
- `outputs.tf` - Output values
- `terraform.tfvars` - Your configuration values

## Important Variables

Edit `terraform.tfvars`:

```hcl
environment = "prod"              # Environment name
aws_region  = "ap-south-1"        # AWS region
db_password = "ChangeMe123!"      # Database password (CHANGE THIS!)
ecs_desired_count = 1             # Number of ECS tasks
```

## Outputs

After deployment, get important values:

```bash
terraform output alb_dns_name    # Application URL
terraform output rds_endpoint    # Database endpoint
terraform output redis_endpoint  # Redis endpoint
```

## Cost Optimization

Current configuration uses:
- `db.t3.micro` for RDS (~$15/month)
- `cache.t3.micro` for Redis (~$12/month)
- `256 CPU / 512 MB` for ECS tasks (~$15/month)
- Single task instance

**Total: ~$70-100/month**

To reduce costs further:
- Use RDS free tier (first 12 months)
- Stop services when not in use
- Use spot instances for ECS

## Cleanup

To delete all resources:

```bash
terraform destroy
```

**⚠️ This will permanently delete:**
- All data in RDS
- All data in Redis
- All files in S3
- All logs in CloudWatch

## Troubleshooting

### Terraform init fails
```bash
# Check AWS credentials
aws sts get-caller-identity

# Check backend bucket exists
aws s3 ls s3://aarogyamai-terraform-state
```

### Terraform apply fails
```bash
# Check for resource limits
aws service-quotas list-service-quotas --service-code ec2

# Destroy and retry
terraform destroy
terraform apply
```

### ECS tasks not starting
```bash
# Check CloudWatch logs
aws logs tail /ecs/aarogyamai-backend --follow

# Check task definition
aws ecs describe-task-definition --task-definition aarogyamai-backend
```

## Security Notes

- Database password is stored in `terraform.tfvars` (not committed to git)
- Use AWS Secrets Manager for production
- Enable encryption at rest for RDS and S3
- Use VPC endpoints for AWS services
- Enable CloudTrail for audit logging

## Next Steps

After deployment:
1. Run database migrations
2. Configure environment variables in ECS
3. Setup custom domain with Route 53
4. Enable HTTPS with ACM certificate
5. Configure CloudFront CDN
6. Setup monitoring and alerts
7. Configure auto-scaling policies
8. Setup CI/CD pipeline

## Support

See `../DEPLOYMENT_GUIDE.md` for detailed deployment instructions.
