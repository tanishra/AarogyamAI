import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import { logger } from '../lib/logger';

// Load .env file before reading process.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  FRONTEND_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  logger.error('invalid environment configuration', { issues: parsed.error.issues });
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Invalid environment configuration');
  }
}

// In production, secrets must not fall back to dev defaults.
if (process.env.NODE_ENV === 'production') {
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if ((process.env[key] || '').includes('change-in-production')) {
      throw new Error(`${key} still set to a development default`);
    }
  }
}

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/admin_panel',
    poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2'),
    poolMax: parseInt(process.env.DATABASE_POOL_MAX || '10'),
    ssl: process.env.DB_SSL === 'true',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
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
    bedrock: {
      region: process.env.AWS_BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1',
      modelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0',
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
    cloudWatchLogGroup: process.env.CLOUDWATCH_LOG_GROUP || '/aarogyamai/backend',
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'openai',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.AI_MODEL || 'gpt-4-turbo-preview',
    enabled: process.env.AI_ENABLED !== 'false',
  },
};

export type AppConfig = typeof config;

// Export connection utilities
export * from './database';
export * from './redis';
export * from './dynamodb';
