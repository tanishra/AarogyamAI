import Redis from 'ioredis';
import { logger } from '../lib/logger';
import { config as appConfig } from '../config';

interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export class CacheService {
  private client: Redis | null = null;
  private isConnected: boolean = false;

  constructor(config?: CacheConfig) {
    if (config) {
      this.client = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db || 0,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 200, 2000);
        },
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.debug('Redis connected');
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        logger.error('Redis error:', err);
      });
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) return null;
    
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    if (!this.client || !this.isConnected) return false;
    
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) return false;
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) return false;
    
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  // Cache key patterns for metrics
  static keys = {
    consultations: (period: string) => `metrics:consultations:${period}`,
    activeUsers: () => 'metrics:active-users',
    aiAcceptance: (period: string, doctorId?: number) => 
      `metrics:ai-acceptance:${period}${doctorId ? `:${doctorId}` : ''}`,
    preparationTime: (period: string, doctorId?: number) =>
      `metrics:prep-time:${period}${doctorId ? `:${doctorId}` : ''}`,
    questionnaireCompletion: (period: string) => `metrics:questionnaire:${period}`,
    dashboardSummary: () => 'metrics:dashboard-summary',
  };
}

// Singleton instance
let cacheInstance: CacheService | null = null;

export function getCacheService(): CacheService {
  if (!cacheInstance) {
    const config = appConfig.redis.host !== 'localhost' || process.env.REDIS_HOST ? {
      host: appConfig.redis.host,
      port: appConfig.redis.port,
      password: appConfig.redis.password,
    } : undefined;
    
    cacheInstance = new CacheService(config);
  }
  return cacheInstance;
}
