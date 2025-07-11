import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { Redis } from '@upstash/redis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private isConnected = false;
  private defaultTtl = 3600; // 1 hour in seconds

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    // Upstash Redis client doesn't need explicit disconnect
    this.isConnected = false;
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      const isEnabled = await this.configService.get<boolean>('enable-cache', true);
      
      if (!isEnabled) {
        console.warn('Cache service is disabled by feature flag');
        return;
      }

      const url = await this.configService.get<string>('REDIS_URL', '');
      const token = await this.configService.get<string>('REDIS_TOKEN', '');
      
      if (!url || !token) {
        console.warn('Redis URL or token not configured, cache will be disabled');
        return;
      }

      this.client = new Redis({
        url,
        token,
      });

      // Fix: Ensure defaultTtl is always a number by using nullish coalescing
      const ttl = await this.configService.get<number>('REDIS_DEFAULT_TTL', 3600);
      this.defaultTtl = ttl ?? 3600;
      
      // Test connection
      await this.client.ping();
      
      this.isConnected = true;
      console.log('Connected to Redis cache');
    } catch (error) {
      console.error('Failed to connect to Redis cache', error);
      this.isConnected = false;
    }
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get<T>(key);
      return value;
    } catch (error) {
      console.error(`Error getting key ${key} from cache`, error);
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const ttl = ttlSeconds ?? this.defaultTtl;
      await this.client.set(key, value, { ex: ttl });
      return true;
    } catch (error) {
      console.error(`Error setting key ${key} in cache`, error);
      return false;
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`Error deleting key ${key} from cache`, error);
      return false;
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.flushall();
      return true;
    } catch (error) {
      console.error('Error clearing cache', error);
      return false;
    }
  }

  /**
   * Check if cache is connected
   */
  isReady(): boolean {
    return this.isConnected;
  }
} 