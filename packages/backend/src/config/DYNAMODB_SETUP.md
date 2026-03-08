# DynamoDB Setup Guide

This document explains how to set up DynamoDB for the Admin Panel audit logging system.

## Table of Contents

- [Overview](#overview)
- [Local Development Setup](#local-development-setup)
- [Production Setup](#production-setup)
- [Table Schema](#table-schema)
- [Testing](#testing)

## Overview

The Admin Panel uses DynamoDB to store audit logs with the following features:

- **High write throughput**: Handles frequent audit log writes
- **Efficient querying**: Global Secondary Indexes (GSIs) for filtering by action type and resource
- **Tamper detection**: Hash chaining for integrity verification
- **Automatic retention**: TTL for automatic log deletion after retention period
- **Point-in-time recovery**: Enabled in production for data protection
- **Encryption**: Server-side encryption at rest

## Local Development Setup

### Option 1: DynamoDB Local (Recommended for MVP)

1. **Install DynamoDB Local using Docker:**

```bash
docker run -d -p 8000:8000 amazon/dynamodb-local
```

2. **Set environment variable:**

```bash
export DYNAMODB_ENDPOINT=http://localhost:8000
export NODE_ENV=development
```

3. **Create the audit logs table:**

```bash
aws dynamodb create-table \
  --table-name admin-panel-audit-logs-dev \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
    AttributeName=timestamp,AttributeType=N \
    AttributeName=actionType,AttributeType=S \
    AttributeName=resource,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
    AttributeName=timestamp,KeyType=RANGE \
  --global-secondary-indexes \
    "[
      {
        \"IndexName\": \"actionType-timestamp-index\",
        \"KeySchema\": [
          {\"AttributeName\":\"actionType\",\"KeyType\":\"HASH\"},
          {\"AttributeName\":\"timestamp\",\"KeyType\":\"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\":\"ALL\"},
        \"ProvisionedThroughput\": {\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}
      },
      {
        \"IndexName\": \"resource-timestamp-index\",
        \"KeySchema\": [
          {\"AttributeName\":\"resource\",\"KeyType\":\"HASH\"},
          {\"AttributeName\":\"timestamp\",\"KeyType\":\"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\":\"ALL\"},
        \"ProvisionedThroughput\": {\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}
      }
    ]" \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --endpoint-url http://localhost:8000
```

4. **Verify table creation:**

```bash
aws dynamodb list-tables --endpoint-url http://localhost:8000
```

### Option 2: Mock DynamoDB (For Unit Tests)

For unit tests, you can use an in-memory mock:

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);

// Mock responses
ddbMock.on(PutCommand).resolves({});
ddbMock.on(QueryCommand).resolves({ Items: [] });
```

## Production Setup

### Using Terraform

The Terraform configuration is already set up in `infrastructure/terraform/dynamodb.tf`:

```bash
cd infrastructure/terraform
terraform init
terraform plan
terraform apply
```

This will create:
- `admin-panel-audit-logs-{environment}` table
- `admin-panel-anomaly-alerts-{environment}` table
- Both with GSIs, TTL, point-in-time recovery, and encryption

### Environment Variables

Set the following in production:

```bash
AWS_REGION=us-east-1
# No DYNAMODB_ENDPOINT needed - uses AWS DynamoDB
```

## Table Schema

### audit_logs Table

**Primary Key:**
- Partition Key: `userId` (String) - User who performed the action
- Sort Key: `timestamp` (Number) - Unix timestamp in milliseconds

**Attributes:**
- `id` (String) - Unique identifier (UUID)
- `userName` (String) - Name of the user
- `userRole` (String) - Role: Patient, Nurse, Doctor, Administrator, DPO
- `actionType` (String) - Type of action (e.g., "user.created")
- `resource` (String) - Resource type (e.g., "user", "consent_record")
- `resourceId` (String, optional) - Specific resource ID
- `outcome` (String) - "success" or "failure"
- `errorDetails` (String, optional) - Error message if outcome is failure
- `ipAddress` (String) - IP address of the request
- `userAgent` (String) - User agent string
- `requestId` (String) - Unique request ID for tracing
- `hash` (String) - SHA-256 hash for tamper detection
- `previousHash` (String, optional) - Hash of previous entry for chain verification
- `ttl` (Number, optional) - TTL timestamp for automatic deletion

**Global Secondary Indexes:**

1. **actionType-timestamp-index**
   - Partition Key: `actionType`
   - Sort Key: `timestamp`
   - Use case: Filter logs by action type (e.g., all login attempts)

2. **resource-timestamp-index**
   - Partition Key: `resource`
   - Sort Key: `timestamp`
   - Use case: Filter logs by resource (e.g., all patient data accesses)

**Features:**
- TTL enabled on `ttl` attribute for automatic deletion
- Point-in-time recovery enabled in production
- Server-side encryption enabled
- Pay-per-request billing mode

## Testing

### Test Data Creation

```typescript
import { getDynamoDBClient } from './config/dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { AuditLogItem, AUDIT_LOG_TABLE_CONFIG } from './types/audit-log';

const client = getDynamoDBClient();

const testLog: AuditLogItem = {
  userId: '123e4567-e89b-12d3-a456-426614174000',
  timestamp: Date.now(),
  id: '123e4567-e89b-12d3-a456-426614174001',
  userName: 'John Doe',
  userRole: 'Administrator',
  actionType: 'user.created',
  resource: 'user',
  resourceId: '123e4567-e89b-12d3-a456-426614174002',
  outcome: 'success',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  requestId: '123e4567-e89b-12d3-a456-426614174003',
  hash: 'a'.repeat(64),
};

await client.send(new PutCommand({
  TableName: AUDIT_LOG_TABLE_CONFIG.tableName('dev'),
  Item: testLog,
}));
```

### Query Examples

**Query by user:**
```typescript
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

const result = await client.send(new QueryCommand({
  TableName: AUDIT_LOG_TABLE_CONFIG.tableName('dev'),
  KeyConditionExpression: 'userId = :userId',
  ExpressionAttributeValues: {
    ':userId': '123e4567-e89b-12d3-a456-426614174000',
  },
}));
```

**Query by action type (using GSI):**
```typescript
const result = await client.send(new QueryCommand({
  TableName: AUDIT_LOG_TABLE_CONFIG.tableName('dev'),
  IndexName: 'actionType-timestamp-index',
  KeyConditionExpression: 'actionType = :actionType',
  ExpressionAttributeValues: {
    ':actionType': 'user.created',
  },
}));
```

## Troubleshooting

### Connection Issues

If you can't connect to local DynamoDB:
1. Check Docker container is running: `docker ps`
2. Verify port 8000 is not in use: `lsof -i :8000`
3. Check environment variable: `echo $DYNAMODB_ENDPOINT`

### Table Not Found

If you get "ResourceNotFoundException":
1. List tables: `aws dynamodb list-tables --endpoint-url http://localhost:8000`
2. Recreate table using the command above
3. Verify table name matches environment

### Permission Issues (Production)

If you get access denied errors:
1. Check IAM role has DynamoDB permissions
2. Verify table name matches environment
3. Check AWS region is correct

## References

- [DynamoDB Developer Guide](https://docs.aws.amazon.com/dynamodb/latest/developerguide/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html)
