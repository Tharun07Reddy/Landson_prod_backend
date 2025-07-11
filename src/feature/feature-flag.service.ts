import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { PlatformType } from '@prisma/client';

interface FeatureFlagFilter {
  name?: string;
  isEnabled?: boolean;
  environment?: string;
  platform?: PlatformType;
  page?: number;
  pageSize?: number;
}

interface CreateFeatureFlagDto {
  name: string;
  description?: string;
  isEnabled: boolean;
  environment?: string;
  platform?: PlatformType;
}

interface UpdateFeatureFlagDto {
  description?: string;
  isEnabled?: boolean;
  environment?: string;
  platform?: PlatformType;
}

@Injectable()
export class FeatureFlagService implements OnModuleInit {
  private cache: Map<string, boolean> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly cacheTTL = 60 * 1000; // 1 minute

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.loadFeatureFlags();
  }

  /**
   * Load all feature flags into cache
   */
  async loadFeatureFlags(): Promise<void> {
    try {
      const featureFlags = await this.prisma.featureFlag.findMany({
        where: {
          environment: process.env.NODE_ENV || null,
        },
      });

      const now = Date.now();
      const expiry = now + this.cacheTTL;

      for (const flag of featureFlags) {
        const key = this.getCacheKey(flag.name, flag.platform);
        this.cache.set(key, flag.isEnabled);
        this.cacheExpiry.set(key, expiry);
      }
    } catch (error) {
      console.error('Error loading feature flags', error);
    }
  }

  /**
   * Get cache key for a feature flag
   */
  private getCacheKey(name: string, platform?: PlatformType | null): string {
    return `${name}-${platform || 'all'}`;
  }

  /**
   * Check if a feature is enabled for a specific platform
   */
  async isEnabled(
    name: string, 
    platform: PlatformType | null = null, 
    defaultValue = false
  ): Promise<boolean> {
    // Check cache first
    const cacheKey = this.getCacheKey(name, platform);
    const now = Date.now();
    
    if (this.cache.has(cacheKey) && this.cacheExpiry.get(cacheKey)! > now) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // Try to find a platform-specific flag first
      let featureFlag = await this.prisma.featureFlag.findFirst({
        where: {
          name,
          platform,
          environment: process.env.NODE_ENV || null,
        },
      });

      // If not found and platform is specified, try with ALL platform
      if (!featureFlag && platform) {
        featureFlag = await this.prisma.featureFlag.findFirst({
          where: {
            name,
            platform: PlatformType.ALL,
            environment: process.env.NODE_ENV || null,
          },
        });
      }

      // If still not found, try with null platform (applies to all)
      if (!featureFlag) {
        featureFlag = await this.prisma.featureFlag.findFirst({
          where: {
            name,
            platform: null,
            environment: process.env.NODE_ENV || null,
          },
        });
      }

      // If still not found, try with any environment
      if (!featureFlag) {
        featureFlag = await this.prisma.featureFlag.findFirst({
          where: {
            name,
            platform: platform || null,
            environment: null,
          },
        });
      }

      const isEnabled = featureFlag ? featureFlag.isEnabled : defaultValue;

      // Update cache
      this.cache.set(cacheKey, isEnabled);
      this.cacheExpiry.set(cacheKey, now + this.cacheTTL);

      return isEnabled;
    } catch (error) {
      console.error(`Error checking feature flag: ${name}`, error);
      return defaultValue;
    }
  }

  /**
   * Get all feature flags with filtering and pagination
   */
  async findAll(filter: FeatureFlagFilter = {}): Promise<any> {
    const { 
      name, 
      isEnabled, 
      environment, 
      platform, 
      page = 1, 
      pageSize = 20 
    } = filter;

    // Build where clause
    const where: any = {};
    
    if (name) {
      where.name = { contains: name };
    }
    
    if (isEnabled !== undefined) {
      where.isEnabled = isEnabled;
    }
    
    if (environment !== undefined) {
      where.environment = environment;
    }
    
    if (platform !== undefined) {
      where.platform = platform;
    }

    // Get total count
    const total = await this.prisma.featureFlag.count({ where });
    
    // Get paginated results
    const items = await this.prisma.featureFlag.findMany({
      where,
      orderBy: {
        name: 'asc',
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
   * Find a feature flag by ID
   */
  async findById(id: string): Promise<any> {
    return this.prisma.featureFlag.findUnique({
      where: { id },
    });
  }

  /**
   * Find a feature flag by name, platform, and environment
   */
  async findByName(
    name: string,
    platform: PlatformType | null = null,
    environment: string | null = null
  ): Promise<any> {
    return this.prisma.featureFlag.findFirst({
      where: {
        name,
        platform,
        environment: environment || process.env.NODE_ENV || null,
      },
    });
  }

  /**
   * Create a new feature flag
   */
  async create(dto: CreateFeatureFlagDto): Promise<any> {
    const featureFlag = await this.prisma.featureFlag.create({
      data: {
        name: dto.name,
        description: dto.description,
        isEnabled: dto.isEnabled,
        environment: dto.environment || process.env.NODE_ENV || null,
        platform: dto.platform || null,
      },
    });

    // Update cache
    const cacheKey = this.getCacheKey(featureFlag.name, featureFlag.platform);
    this.cache.set(cacheKey, featureFlag.isEnabled);
    this.cacheExpiry.set(cacheKey, Date.now() + this.cacheTTL);

    return featureFlag;
  }

  /**
   * Update a feature flag
   */
  async update(id: string, dto: UpdateFeatureFlagDto): Promise<any> {
    const featureFlag = await this.prisma.featureFlag.update({
      where: { id },
      data: {
        description: dto.description,
        isEnabled: dto.isEnabled,
        environment: dto.environment,
        platform: dto.platform,
      },
    });

    // Update cache
    const cacheKey = this.getCacheKey(featureFlag.name, featureFlag.platform);
    this.cache.set(cacheKey, featureFlag.isEnabled);
    this.cacheExpiry.set(cacheKey, Date.now() + this.cacheTTL);

    return featureFlag;
  }

  /**
   * Toggle a feature flag
   */
  async toggle(id: string): Promise<any> {
    // Get current state
    const current = await this.prisma.featureFlag.findUnique({
      where: { id },
    });

    if (!current) {
      throw new Error('Feature flag not found');
    }

    // Toggle state
    const featureFlag = await this.prisma.featureFlag.update({
      where: { id },
      data: {
        isEnabled: !current.isEnabled,
      },
    });

    // Update cache
    const cacheKey = this.getCacheKey(featureFlag.name, featureFlag.platform);
    this.cache.set(cacheKey, featureFlag.isEnabled);
    this.cacheExpiry.set(cacheKey, Date.now() + this.cacheTTL);

    return featureFlag;
  }

  /**
   * Delete a feature flag
   */
  async delete(id: string): Promise<boolean> {
    try {
      const featureFlag = await this.prisma.featureFlag.delete({
        where: { id },
      });

      // Remove from cache
      const cacheKey = this.getCacheKey(featureFlag.name, featureFlag.platform);
      this.cache.delete(cacheKey);
      this.cacheExpiry.delete(cacheKey);

      return true;
    } catch (error) {
      console.error(`Error deleting feature flag: ${id}`, error);
      return false;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }
} 