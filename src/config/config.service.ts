import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigManagerService } from './config-manager.service';
import { ConfigMonitorService } from './config-monitor.service';
import { ConfigAuditService } from './config-audit.service';
import { PlatformType, ValueType } from '@prisma/client';

interface ConfigKeyFilter {
  search?: string;
  categoryId?: string;
  isSecret?: boolean;
  page?: number;
  pageSize?: number;
  includeValues?: boolean;
}

interface CreateConfigKeyDto {
  key: string;
  description?: string;
  categoryId: string;
  isSecret?: boolean;
  defaultValue?: string;
  valueType?: ValueType;
}

interface UpdateConfigKeyDto {
  key?: string;
  description?: string;
  categoryId?: string;
  isSecret?: boolean;
  defaultValue?: string;
  valueType?: ValueType;
}

interface ConfigValueDto {
  value: string;
  environment?: string;
  platform?: PlatformType;
  isActive?: boolean;
}

interface ConfigContext {
  environment?: string | null;
  platform?: PlatformType | null;
  userId?: string;
}

@Injectable()
export class ConfigService {
  private cache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly cacheTTL = 60 * 1000; // 1 minute
  private currentPlatform: PlatformType | null = null;

  constructor(
    private readonly nestConfigService: NestConfigService,
    private readonly prisma: PrismaService,
    private readonly configManager: ConfigManagerService,
    @Inject(forwardRef(() => ConfigMonitorService))
    private readonly configMonitor: ConfigMonitorService,
    @Inject(forwardRef(() => ConfigAuditService))
    private readonly configAudit: ConfigAuditService,
  ) {}

  /**
   * Set the current platform for the request context
   * This can be called by middleware to set the platform based on request headers
   */
  setPlatform(platform: PlatformType | null): void {
    this.currentPlatform = platform;
  }

  /**
   * Get the current platform
   */
  getPlatform(): PlatformType | null {
    return this.currentPlatform;
  }

  /**
   * Get configuration value with priority:
   * 1. Runtime overrides (from ConfigManagerService)
   * 2. Database (if loadFromDb is true) - with platform & environment specificity
   * 3. Environment variables
   * 4. Default value
   */
  async get<T>(
    key: string, 
    defaultValue?: T, 
    loadFromDb = true, 
    context?: ConfigContext
  ): Promise<T | undefined> {
    // Use provided context or default to current environment and platform
    const environment = context?.environment || process.env.NODE_ENV || null;
    const platform = context?.platform || this.currentPlatform || null;
    
    // Check if there's a runtime override first
    const overrideValue = this.configManager.get<T>(key);
    if (overrideValue !== undefined) {
      return overrideValue;
    }
    
    // Check cache first
    const cacheKey = `${key}-${environment}-${platform}-${loadFromDb}`;
    const now = Date.now();
    if (this.cache.has(cacheKey) && this.cacheExpiry.get(cacheKey)! > now) {
      return this.cache.get(cacheKey);
    }

    let value: any;

    // Try to get from database if enabled
    if (loadFromDb) {
      try {
        // First try exact platform and environment match
        let configValue = await this.findConfigValue(key, environment, platform);
        
        // If not found, try with platform=null (applies to all platforms) but same environment
        if (!configValue && platform) {
          configValue = await this.findConfigValue(key, environment, null);
        }
        
        // If still not found, try with environment=null (applies to all environments) but specific platform
        if (!configValue && environment) {
          configValue = await this.findConfigValue(key, null, platform);
        }
        
        // If still not found, try with both null (applies to all environments and platforms)
        if (!configValue) {
          configValue = await this.findConfigValue(key, null, null);
        }

        if (configValue) {
          try {
            value = JSON.parse(configValue.value);
          } catch (e) {
            value = configValue.value;
          }
        }
      } catch (error) {
        console.error(`Error loading config from DB: ${key}`, error);
      }
    }

    // If not found in DB, try environment variables
    if (value === undefined) {
      value = this.nestConfigService.get<T>(key);
    }

    // Use default value if still not found
    if (value === undefined) {
      value = defaultValue;
    }

    // Update cache
    this.cache.set(cacheKey, value);
    this.cacheExpiry.set(cacheKey, now + this.cacheTTL);

    return value;
  }

  /**
   * Helper method to find a config value with specific environment and platform
   */
  private async findConfigValue(key: string, environment: string | null, platform: PlatformType | null) {
    const configKey = await this.prisma.configKey.findFirst({
      where: { key },
      include: {
        values: {
          where: {
            isActive: true,
            environment,
            platform,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    return configKey?.values[0];
  }

  /**
   * Get all configuration values for a category
   */
  async getByCategory(
    category: string, 
    context?: ConfigContext
  ): Promise<Record<string, any>> {
    const environment = context?.environment || process.env.NODE_ENV || null;
    const platform = context?.platform || this.currentPlatform || null;
    
    try {
      const configKeys = await this.prisma.configKey.findMany({
        where: {
          category: {
            name: category,
          },
        },
        include: {
          values: {
            where: {
              isActive: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

      const result: Record<string, any> = {};

      for (const configKey of configKeys) {
        // Check for runtime override first
        const overrideValue = this.configManager.get(configKey.key);
        if (overrideValue !== undefined) {
          result[configKey.key] = overrideValue;
          continue;
        }
        
        // Find the most specific value for this environment and platform
        let configValue = this.findMostSpecificValue(configKey.values, environment, platform);
        
        if (configValue) {
          try {
            result[configKey.key] = JSON.parse(configValue.value);
          } catch (e) {
            result[configKey.key] = configValue.value;
          }
        } else if (configKey.defaultValue) {
          try {
            result[configKey.key] = JSON.parse(configKey.defaultValue);
          } catch (e) {
            result[configKey.key] = configKey.defaultValue;
          }
        }
      }

      return result;
    } catch (error) {
      console.error(`Error loading configs for category: ${category}`, error);
      return {};
    }
  }

  /**
   * Find the most specific value from a list of config values based on environment and platform
   */
  private findMostSpecificValue(values: any[], environment: string | null, platform: PlatformType | null) {
    // Priority order:
    // 1. Exact environment and platform match
    // 2. Exact environment, any platform
    // 3. Any environment, exact platform
    // 4. Any environment, any platform
    
    // Try exact match first
    let value = values.find(v => 
      v.environment === environment && v.platform === platform
    );
    
    // Try environment match with any platform
    if (!value) {
      value = values.find(v => 
        v.environment === environment && v.platform === null
      );
    }
    
    // Try platform match with any environment
    if (!value) {
      value = values.find(v => 
        v.environment === null && v.platform === platform
      );
    }
    
    // Try any environment and platform
    if (!value) {
      value = values.find(v => 
        v.environment === null && v.platform === null
      );
    }
    
    return value;
  }

  /**
   * Update configuration value in the database
   */
  async set(
    key: string, 
    value: any, 
    context?: ConfigContext,
    isTemporary = false,
    ttlSeconds?: number,
  ): Promise<void> {
    const environment = context?.environment || process.env.NODE_ENV || null;
    const platform = context?.platform || this.currentPlatform || null;
    const userId = context?.userId || 'system';
    
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    // If temporary, just set as runtime override
    if (isTemporary) {
      this.configManager.setOverride(key, value, userId, ttlSeconds);
      return;
    }
    
    try {
      // Find or create config key
      let configKey = await this.prisma.configKey.findUnique({
        where: { key },
        include: { 
          values: {
            where: {
              environment: environment || null,
              platform: platform || null,
            },
          },
        },
      });

      if (!configKey) {
        // Find a default category or create one
        const category = await this.prisma.configCategory.findFirst({
          where: { name: 'default' },
        }) || await this.prisma.configCategory.create({
          data: { 
            name: 'default',
            description: 'Default category for uncategorized configs' 
          },
        });

        configKey = await this.prisma.configKey.create({
          data: {
            key,
            description: `Auto-created config key for ${key}`,
            categoryId: category.id,
            valueType: 'STRING',
          },
          include: { values: true },
        });
      }

      // Get current value for audit
      const currentValue = configKey.values.find(v => 
        v.environment === environment && v.platform === platform && v.isActive
      );

      // Create new value
      const newConfigValue = await this.prisma.configValue.create({
        data: {
          configKeyId: configKey.id,
          value: stringValue,
          environment: environment || null,
          platform: platform || null,
          isActive: true,
          createdBy: userId,
        },
      });

      // Create audit log with enhanced metadata
      await this.configAudit.createAuditLog(
        newConfigValue.id,
        currentValue?.value || null,
        stringValue,
        userId,
        environment || null,
        platform || null,
        {
          userAgent: process.env.USER_AGENT || 'system',
          ipAddress: process.env.IP_ADDRESS || '127.0.0.1',
          timestamp: new Date().toISOString(),
          source: 'api',
        }
      );

      // Notify monitors about the change
      this.configMonitor.notifyConfigChange(
        key,
        currentValue?.value,
        stringValue,
        userId,
        environment,
        platform
      );

      // Deactivate previous values
      if (currentValue) {
        await this.prisma.configValue.updateMany({
          where: {
            id: { not: currentValue.id },
            configKeyId: configKey.id,
            environment: environment || null,
            platform: platform || null,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });
      }

      // Clear cache
      this.clearCache(key);
      
      // Also update runtime override if it exists
      if (this.configManager.getOverrides()[key]) {
        this.configManager.setOverride(key, value, userId);
      }
    } catch (error) {
      console.error(`Error setting config: ${key}`, error);
      throw error;
    }
  }

  /**
   * Set a temporary runtime override
   */
  setTemporary(key: string, value: any, ttlSeconds?: number): void {
    this.configManager.setOverride(key, value, 'runtime', ttlSeconds);
    this.clearCache(key);
  }

  /**
   * Remove a temporary runtime override
   */
  removeTemporary(key: string): boolean {
    const result = this.configManager.removeOverride(key);
    this.clearCache(key);
    return result;
  }

  /**
   * Get all active runtime overrides
   */
  getOverrides(): Record<string, any> {
    return this.configManager.getOverrides();
  }

  /**
   * Clear cache for a specific key or all keys
   */
  clearCache(key?: string): void {
    if (key) {
      for (const cacheKey of this.cache.keys()) {
        if (cacheKey.startsWith(`${key}-`)) {
          this.cache.delete(cacheKey);
          this.cacheExpiry.delete(cacheKey);
        }
      }
    } else {
      this.cache.clear();
      this.cacheExpiry.clear();
    }
  }

  /**
   * Get all configuration categories
   */
  async getCategories() {
    try {
      return await this.prisma.configCategory.findMany();
    } catch (error) {
      console.error('Error loading config categories', error);
      return [];
    }
  }

  /**
   * Reload all configurations
   */
  async reloadConfigurations(): Promise<void> {
    await this.configManager.reloadConfigurations();
    this.clearCache();
  }

  /**
   * Find all configuration keys with pagination and filtering
   */
  async findAllConfigKeys(filter: ConfigKeyFilter = {}) {
    const { search, categoryId, isSecret, page = 1, pageSize = 20, includeValues = false } = filter;
    
    // Build where clause
    const where: any = {};
    
    if (search) {
      where.OR = [
        { key: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (categoryId) {
      where.categoryId = categoryId;
    }
    
    if (isSecret !== undefined) {
      where.isSecret = isSecret;
    }

    // Get total count
    const total = await this.prisma.configKey.count({ where });
    
    // Get paginated results
    const items = await this.prisma.configKey.findMany({
      where,
      include: {
        category: true,
        values: includeValues ? {
          where: {
            isActive: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        } : false,
      },
      orderBy: {
        key: 'asc',
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Find a configuration key by ID
   */
  async findConfigKeyById(id: string, includeValues = false) {
    return this.prisma.configKey.findUnique({
      where: { id },
      include: {
        category: true,
        values: includeValues ? {
          where: {
            isActive: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        } : false,
      },
    });
  }

  /**
   * Find a configuration key by key name
   */
  async findConfigKeyByKey(key: string, includeValues = false) {
    return this.prisma.configKey.findUnique({
      where: { key },
      include: {
        category: true,
        values: includeValues ? {
          where: {
            isActive: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        } : false,
      },
    });
  }

  /**
   * Find configuration keys by category
   */
  async findConfigKeysByCategory(categoryId: string, includeValues = false) {
    return this.prisma.configKey.findMany({
      where: { categoryId },
      include: {
        category: true,
        values: includeValues ? {
          where: {
            isActive: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        } : false,
      },
      orderBy: {
        key: 'asc',
      },
    });
  }

  /**
   * Create a new configuration key
   */
  async createConfigKey(dto: CreateConfigKeyDto) {
    return this.prisma.configKey.create({
      data: {
        key: dto.key,
        description: dto.description,
        categoryId: dto.categoryId,
        isSecret: dto.isSecret ?? false,
        defaultValue: dto.defaultValue,
        valueType: dto.valueType ?? ValueType.STRING,
      },
      include: {
        category: true,
      },
    });
  }

  /**
   * Update a configuration key
   */
  async updateConfigKey(id: string, dto: UpdateConfigKeyDto) {
    try {
      return await this.prisma.configKey.update({
        where: { id },
        data: {
          ...(dto.key && { key: dto.key }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.categoryId && { categoryId: dto.categoryId }),
          ...(dto.isSecret !== undefined && { isSecret: dto.isSecret }),
          ...(dto.defaultValue !== undefined && { defaultValue: dto.defaultValue }),
          ...(dto.valueType && { valueType: dto.valueType }),
        },
        include: {
          category: true,
        },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a configuration key
   */
  async deleteConfigKey(id: string): Promise<boolean> {
    try {
      await this.prisma.configKey.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      if (error.code === 'P2025') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Create a new configuration value with platform support
   */
  async createConfigValue(configKeyId: string, dto: ConfigValueDto, userId = 'system') {
    // Check if config key exists
    const configKey = await this.prisma.configKey.findUnique({
      where: { id: configKeyId },
    });
    
    if (!configKey) {
      throw new Error('CONFIG_KEY_NOT_FOUND');
    }
    
    const stringValue = typeof dto.value === 'string' ? dto.value : JSON.stringify(dto.value);
    const environment = dto.environment || null;
    const platform = dto.platform || null;
    
    // Get current value for audit
    const currentValue = await this.prisma.configValue.findFirst({
      where: {
        configKeyId,
        environment,
        platform,
        isActive: true,
      },
    });

    // Create new value
    const newConfigValue = await this.prisma.configValue.create({
      data: {
        configKeyId,
        value: stringValue,
        environment,
        platform,
        isActive: dto.isActive ?? true,
        createdBy: userId,
      },
    });

    // Create audit log
    await this.configAudit.createAuditLog(
      newConfigValue.id,
      currentValue?.value || null,
      stringValue,
      userId,
      environment,
      platform,
      {
        operation: 'create',
        timestamp: new Date().toISOString(),
      }
    );

    // Notify monitors about the change
    this.configMonitor.notifyConfigChange(
      configKey.key,
      currentValue?.value,
      stringValue,
      userId,
      environment,
      platform
    );

    // Deactivate previous values if this one is active
    if (dto.isActive !== false) {
      await this.prisma.configValue.updateMany({
        where: {
          id: { not: newConfigValue.id },
          configKeyId,
          environment,
          platform,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });
    }

    // Clear cache
    this.clearCache(configKey.key);

    return newConfigValue;
  }

  /**
   * Update a configuration value
   */
  async updateConfigValue(id: string, dto: ConfigValueDto, userId = 'system') {
    try {
      // Get current value for audit
      const currentValue = await this.prisma.configValue.findUnique({
        where: { id },
        include: {
          configKey: true,
        },
      });
      
      if (!currentValue) {
        return null;
      }
      
      const stringValue = typeof dto.value === 'string' ? dto.value : JSON.stringify(dto.value);
      const environment = dto.environment || currentValue.environment;
      const platform = dto.platform || currentValue.platform;
      
      // Update value
      const updatedValue = await this.prisma.configValue.update({
        where: { id },
        data: {
          ...(dto.value !== undefined && { value: stringValue }),
          ...(dto.environment !== undefined && { environment }),
          ...(dto.platform !== undefined && { platform }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });

      // Create audit log
      await this.configAudit.createAuditLog(
        updatedValue.id,
        currentValue.value,
        stringValue,
        userId,
        environment,
        platform,
        {
          operation: 'update',
          timestamp: new Date().toISOString(),
        }
      );

      // Notify monitors about the change
      this.configMonitor.notifyConfigChange(
        currentValue.configKey.key,
        currentValue.value,
        stringValue,
        userId,
        environment,
        platform
      );

      // Deactivate previous values if this one is active
      if (dto.isActive === true) {
        await this.prisma.configValue.updateMany({
          where: {
            id: { not: updatedValue.id },
            configKeyId: currentValue.configKeyId,
            environment,
            platform,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });
      }

      // Clear cache
      this.clearCache(currentValue.configKey.key);

      return updatedValue;
    } catch (error) {
      if (error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a configuration value
   */
  async deleteConfigValue(id: string, userId = 'system'): Promise<boolean> {
    try {
      // Get current value for audit
      const currentValue = await this.prisma.configValue.findUnique({
        where: { id },
        include: {
          configKey: true,
        },
      });
      
      if (!currentValue) {
        return false;
      }
      
      // Delete value
      await this.prisma.configValue.delete({
        where: { id },
      });

      // Create audit log
      await this.configAudit.createAuditLog(
        id,
        currentValue.value,
        null,
        userId,
        currentValue.environment,
        currentValue.platform,
        {
          operation: 'delete',
          timestamp: new Date().toISOString(),
        }
      );

      // Notify monitors about the change
      this.configMonitor.notifyConfigChange(
        currentValue.configKey.key,
        currentValue.value,
        null,
        userId,
        currentValue.environment,
        currentValue.platform
      );

      // Clear cache
      this.clearCache(currentValue.configKey.key);

      return true;
    } catch (error) {
      if (error.code === 'P2025') {
        return false;
      }
      throw error;
    }
  }
} 