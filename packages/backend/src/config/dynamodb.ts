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
  const config: DynamoDBConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
  };

  // For local development, use local DynamoDB endpoint
  if (process.env.NODE_ENV === 'development' || process.env.DYNAMODB_ENDPOINT) {
    config.endpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
    
    // Local DynamoDB requires dummy credentials
    config.credentials = {
      accessKeyId: 'local',
      secretAccessKey: 'local',
    };
  }

  const client = new DynamoDBClient(config);

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
