import { config } from './index';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB Client Configuration
 *
 * For MVP: Supports both local DynamoDB (for development) and AWS DynamoDB (for production)
 */

interface DynamoDBConfig {
  region: string;
  endpoint?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

/**
 * Create DynamoDB client based on environment
 */
export function createDynamoDBClient(): DynamoDBDocumentClient {
  const clientConfig: DynamoDBConfig = {
    region: config.aws.region,
  };

  // For local development, use local DynamoDB endpoint
  if (config.nodeEnv === 'development' || config.aws.dynamodb.endpoint) {
    clientConfig.endpoint = config.aws.dynamodb.endpoint || 'http://localhost:8000';

    // Local DynamoDB requires dummy credentials
    clientConfig.credentials = {
      accessKeyId: 'local',
      secretAccessKey: 'local',
    };
  }

  const client = new DynamoDBClient(clientConfig);

  // Create document client with marshalling options
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      // Convert empty strings to null
      convertEmptyValues: false,
      // Remove undefined values
      removeUndefinedValues: true,
      // Convert class instances to maps
      convertClassInstanceToMap: false,
    },
    unmarshallOptions: {
      // Return numbers as JavaScript numbers (not BigInt)
      wrapNumbers: false,
    },
  });
}

/**
 * Singleton instance of DynamoDB client
 */
let dynamoDBClient: DynamoDBDocumentClient | null = null;

/**
 * Get or create DynamoDB client instance
 */
export function getDynamoDBClient(): DynamoDBDocumentClient {
  if (!dynamoDBClient) {
    dynamoDBClient = createDynamoDBClient();
  }
  return dynamoDBClient;
}

/**
 * Close DynamoDB client connection
 */
export function closeDynamoDBClient(): void {
  if (dynamoDBClient) {
    dynamoDBClient.destroy();
    dynamoDBClient = null;
  }
}
