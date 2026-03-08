import dotenv from 'dotenv';
import path from 'path';

// Load .env file before reading process.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    url: process.env.DATABASE_URL || 'postgresql://tanishrajput@localhost:5432/clinical_ai_dev',
    poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2'),
    poolMax: parseInt(process.env.DATABASE_POOL_MAX || '10'),
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    dynamodb: {
      auditTable: process.env.DYNAMODB_AUDIT_TABLE || 'audit_logs',
      endpoint: process.env.DYNAMODB_ENDPOINT,
    },
    s3: {
      reportsBucket: process.env.S3_REPORTS_BUCKET || '',
      endpoint: process.env.S3_ENDPOINT,
    },
    sqs: {
      reportQueueUrl: process.env.SQS_REPORT_QUEUE_URL || '',
    },
    sns: {
      notificationTopicArn: process.env.SNS_NOTIFICATION_TOPIC_ARN || '',
    },
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '8h',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '30d',
  },
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
    sessionTTL: parseInt(process.env.SESSION_TTL || '28800'),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    cloudWatchLogGroup: process.env.CLOUDWATCH_LOG_GROUP || '/admin-panel/backend',
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'openai',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.AI_MODEL || 'gpt-4-turbo-preview',
  },
};

// Export connection utilities
export * from './database';
export * from './redis';
export * from './dynamodb';
