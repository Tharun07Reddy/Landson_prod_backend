import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface ConfigOverride {
  key: string;
  value: any;
  source: string;
  expiresAt?: Date;
}

@Injectable()
export class ConfigManagerService implements OnModuleInit {
  private configCache: Map<string, any> = new Map();
  private overrides: Map<string, ConfigOverride> = new Map();
  private loaded = false;
  
  constructor(
    private readonly nestConfigService: NestConfigService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    await this.loadConfigurations();
    
    // Set up cleanup interval for expired overrides
    setInterval(() => this.cleanupExpiredOverrides(), 60000); // Run every minute
  }

  /**
   * Load all configurations in the correct sequence:
   * 1. Default values
   * 2. Environment variables
   * 3. Database configurations
   * 4. Runtime overrides
   */
  async loadConfigurations(): Promise<void> {
    try {
      // Clear cache before reloading
      this.configCache.clear();
      
      // Step 1 & 2: Default values and environment variables are handled by NestConfigService
      
      // Step 3: Load database configurations
      await this.loadDatabaseConfigurations();
      
      // Step 4: Apply runtime overrides (already in memory)
      this.applyRuntimeOverrides();
      
      this.loaded = true;
      this.eventEmitter.emit('config.loaded');
      
      console.log('Configuration loading sequence completed');
    } catch (error) {
      console.error('Failed to load configurations', error);
      throw error;
    }
  }

  /**
   * Load configurations from database
   */
  private async loadDatabaseConfigurations(): Promise<void> {
    try {
      const configKeys = await this.prisma.configKey.findMany({
        include: {
          values: {
            where: {
              isActive: true,
              environment: process.env.NODE_ENV || null,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      });

      for (const configKey of configKeys) {
        if (configKey.values.length) {
          const value = configKey.values[0].value;
          let parsedValue: any;
          
          try {
            parsedValue = JSON.parse(value);
          } catch (e) {
            parsedValue = value;
          }
          
          this.configCache.set(configKey.key, parsedValue);
        } else if (configKey.defaultValue) {
          try {
            const parsedValue = JSON.parse(configKey.defaultValue);
            this.configCache.set(configKey.key, parsedValue);
          } catch (e) {
            this.configCache.set(configKey.key, configKey.defaultValue);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load database configurations', error);
      throw error;
    }
  }

  /**
   * Apply runtime overrides to the configuration
   */
  private applyRuntimeOverrides(): void {
    for (const [key, override] of this.overrides.entries()) {
      this.configCache.set(key, override.value);
    }
  }

  /**
   * Get a configuration value with the following priority:
   * 1. Runtime overrides
   * 2. Database configurations
   * 3. Environment variables
   * 4. Default value
   */
  get<T>(key: string, defaultValue?: T): T | undefined {
    // If not loaded yet, return from environment or default
    if (!this.loaded) {
      const envValue = this.nestConfigService.get<T>(key);
      return envValue !== undefined ? envValue : defaultValue;
    }
    
    // Check runtime overrides and cache first
    if (this.configCache.has(key)) {
      return this.configCache.get(key);
    }
    
    // Check environment variables
    const envValue = this.nestConfigService.get<T>(key);
    if (envValue !== undefined) {
      return envValue;
    }
    
    // Return default value
    return defaultValue;
  }

  /**
   * Set a runtime override
   * @param key Configuration key
   * @param value Configuration value
   * @param source Source of the override (e.g., 'api', 'admin')
   * @param ttlSeconds Time to live in seconds (optional)
   */
  setOverride<T>(key: string, value: T, source: string, ttlSeconds?: number): void {
    const override: ConfigOverride = {
      key,
      value,
      source,
      expiresAt: ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : undefined,
    };
    
    this.overrides.set(key, override);
    this.configCache.set(key, value);
    
    this.eventEmitter.emit('config.override', { key, value, source });
  }

  /**
   * Remove a runtime override
   */
  removeOverride(key: string): boolean {
    if (this.overrides.has(key)) {
      const originalValue = this.getOriginalValue(key);
      this.overrides.delete(key);
      
      // Restore original value in cache
      if (originalValue !== undefined) {
        this.configCache.set(key, originalValue);
      } else {
        this.configCache.delete(key);
      }
      
      this.eventEmitter.emit('config.override.removed', { key });
      return true;
    }
    return false;
  }

  /**
   * Get all active overrides
   */
  getOverrides(): Record<string, ConfigOverride> {
    const result: Record<string, ConfigOverride> = {};
    for (const [key, override] of this.overrides.entries()) {
      result[key] = { ...override };
    }
    return result;
  }

  /**
   * Get original value (without override)
   */
  private async getOriginalValue(key: string): Promise<any> {
    // Try database value
    const configKey = await this.prisma.configKey.findFirst({
      where: { key },
      include: {
        values: {
          where: {
            isActive: true,
            environment: process.env.NODE_ENV || null,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });
    
    if (configKey?.values.length) {
      try {
        return JSON.parse(configKey.values[0].value);
      } catch (e) {
        return configKey.values[0].value;
      }
    }
    
    // Try environment variable
    return this.nestConfigService.get(key);
  }

  /**
   * Clean up expired overrides
   */
  private cleanupExpiredOverrides(): void {
    const now = new Date();
    const expiredKeys: string[] = [];
    
    for (const [key, override] of this.overrides.entries()) {
      if (override.expiresAt && override.expiresAt < now) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.removeOverride(key);
      console.log(`Removed expired override for key: ${key}`);
    }
  }

  /**
   * Reload all configurations
   */
  async reloadConfigurations(): Promise<void> {
    await this.loadConfigurations();
  }
} 