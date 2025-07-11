import { Injectable, OnModuleInit, Req } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { PlatformType } from '@prisma/client';
import { Request } from 'express';

@Injectable()
export class NetworkService implements OnModuleInit {
  private corsConfigs: Map<PlatformType | null, any> = new Map();
  private rateLimitRules: Map<PlatformType | null, any[]> = new Map();
  private connectionSettings: Map<PlatformType | null, any> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.loadNetworkConfigurations();
  }

  /**
   * Load all network configurations from the database
   */
  async loadNetworkConfigurations(): Promise<void> {
    try {
      // Load CORS configurations for all platforms
      const corsConfigs = await this.prisma.networkConfig.findMany({
        where: {
          name: 'cors',
          isEnabled: true,
          environment: process.env.NODE_ENV || undefined,
        },
      });

      // Group CORS configs by platform
      for (const platformType of Object.values(PlatformType)) {
        const platformConfig = corsConfigs.find(c => c.platform === platformType);
        if (platformConfig) {
          try {
            this.corsConfigs.set(platformType, JSON.parse(platformConfig.config));
          } catch (e) {
            console.error(`Invalid CORS configuration format for platform ${platformType}`, e);
            this.corsConfigs.set(platformType, this.getDefaultCorsConfig(platformType));
          }
        } else {
          this.corsConfigs.set(platformType, this.getDefaultCorsConfig(platformType));
        }
      }

      // Set default CORS config for null platform (fallback)
      const defaultConfig = corsConfigs.find(c => c.platform === null);
      if (defaultConfig) {
        try {
          this.corsConfigs.set(null, JSON.parse(defaultConfig.config));
        } catch (e) {
          console.error('Invalid default CORS configuration format', e);
          this.corsConfigs.set(null, this.getDefaultCorsConfig(null));
        }
      } else {
        this.corsConfigs.set(null, this.getDefaultCorsConfig(null));
      }

      // Load rate limiting rules
      const rateLimitRules = await this.prisma.rateLimitRule.findMany({
        where: {
          isEnabled: true,
          environment: process.env.NODE_ENV || null,
        },
      });

      // Group rate limit rules by platform
      for (const platformType of [...Object.values(PlatformType), null]) {
        const platformRules = rateLimitRules.filter(rule => 
          rule.platform === platformType || rule.platform === PlatformType.ALL
        );
        this.rateLimitRules.set(platformType as PlatformType | null, platformRules);
      }

      // Load connection settings
      await this.loadConnectionSettings();
    } catch (error) {
      console.error('Error loading network configurations', error);
      // Use defaults if loading fails
      this.initializeDefaults();
    }
  }

  /**
   * Load connection settings from configuration
   */
  private async loadConnectionSettings(): Promise<void> {
    try {
      // For each platform, load connection settings
      for (const platformType of [...Object.values(PlatformType), null]) {
        const context = {
          environment: process.env.NODE_ENV || undefined,
          platform: platformType as PlatformType | null
        };
        
        const keepAliveTimeout = await this.configService.get<number>(
          'CONNECTION_KEEP_ALIVE_TIMEOUT', 
          platformType === PlatformType.MOBILE_ANDROID || platformType === PlatformType.MOBILE_IOS ? 5000 : 60000,
          true,
            context 
        );
        
        const maxConnections = await this.configService.get<number>(
          'CONNECTION_MAX_CONNECTIONS', 
          platformType === PlatformType.MOBILE_ANDROID || platformType === PlatformType.MOBILE_IOS ? 5 : 10,
          true,
          context
        );
        
        const timeout = await this.configService.get<number>(
          'CONNECTION_TIMEOUT', 
          platformType === PlatformType.MOBILE_ANDROID || platformType === PlatformType.MOBILE_IOS ? 10000 : 30000,
          true,
          context
        );
        
        this.connectionSettings.set(platformType as PlatformType | null, {
          keepAliveTimeout,
          maxConnections,
          timeout
        });
      }
    } catch (error) {
      console.error('Error loading connection settings', error);
      // Set default connection settings
      for (const platformType of [...Object.values(PlatformType), null]) {
        this.connectionSettings.set(platformType as PlatformType | null, {
          keepAliveTimeout: platformType === PlatformType.MOBILE_ANDROID || platformType === PlatformType.MOBILE_IOS ? 5000 : 60000,
          maxConnections: platformType === PlatformType.MOBILE_ANDROID || platformType === PlatformType.MOBILE_IOS ? 5 : 10,
          timeout: platformType === PlatformType.MOBILE_ANDROID || platformType === PlatformType.MOBILE_IOS ? 10000 : 30000
        });
      }
    }
  }

  /**
   * Initialize default settings if loading fails
   */
  private initializeDefaults(): void {
    // Set default CORS configs
    for (const platformType of [...Object.values(PlatformType), null]) {
      this.corsConfigs.set(platformType as PlatformType | null, this.getDefaultCorsConfig(platformType as PlatformType | null));
      this.rateLimitRules.set(platformType as PlatformType | null, []);
      
      // Set default connection settings
      this.connectionSettings.set(platformType as PlatformType | null, {
        keepAliveTimeout: platformType === PlatformType.MOBILE_ANDROID || platformType === PlatformType.MOBILE_IOS ? 5000 : 60000,
        maxConnections: platformType === PlatformType.MOBILE_ANDROID || platformType === PlatformType.MOBILE_IOS ? 5 : 10,
        timeout: platformType === PlatformType.MOBILE_ANDROID || platformType === PlatformType.MOBILE_IOS ? 10000 : 30000
      });
    }
  }

  /**
   * Get CORS configuration for a specific platform
   */
  getCorsConfig(platform: PlatformType | null = null): any {
    // If we have a specific config for this platform, use it
    if (platform && this.corsConfigs.has(platform)) {
      return this.corsConfigs.get(platform);
    }
    
    // Otherwise fall back to the default config
    return this.corsConfigs.get(null) || this.getDefaultCorsConfig(null);
  }

  /**
   * Get CORS configuration for the current request
   */
  getCorsConfigForRequest(req?: Request): any {
    const platform = req ? (req as any).platform : null;
    return this.getCorsConfig(platform);
  }

  /**
   * Get rate limit rules for a specific platform
   */
  getRateLimitRules(platform: PlatformType | null = null): any[] {
    // If we have specific rules for this platform, use them
    if (platform && this.rateLimitRules.has(platform)) {
      return this.rateLimitRules.get(platform) || [];
    }
    
    // Otherwise fall back to the default rules
    return this.rateLimitRules.get(null) || [];
  }

  /**
   * Get rate limit rule for a specific path, method, and platform
   */
  getRateLimitRule(path: string, method?: string, platform: PlatformType | null = null): any | undefined {
    const rules = this.getRateLimitRules(platform);
    
    return rules.find(rule => {
      const pathMatches = path.match(new RegExp(rule.path));
      const methodMatches = !rule.method || rule.method === method;
      return pathMatches && methodMatches;
    });
  }

  /**
   * Get connection settings for a specific platform
   */
  getConnectionSettings(platform: PlatformType | null = null): any {
    // If we have specific settings for this platform, use them
    if (platform && this.connectionSettings.has(platform)) {
      return this.connectionSettings.get(platform);
    }
    
    // Otherwise fall back to the default settings
    return this.connectionSettings.get(null) || {
      keepAliveTimeout: 60000,
      maxConnections: 10,
      timeout: 30000
    };
  }

  /**
   * Default CORS configuration based on platform
   */
  private getDefaultCorsConfig(platform: PlatformType | null): any {
    // Base CORS config
    const baseConfig = {
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      preflightContinue: false,
      optionsSuccessStatus: 204,
      credentials: true,
    };
    
    // Platform-specific adjustments
    switch (platform) {
      case PlatformType.WEB:
        return {
          ...baseConfig,
          origin: process.env.WEB_ORIGIN || '*',
        };
      case PlatformType.MOBILE_ANDROID:
      case PlatformType.MOBILE_IOS:
        return {
          ...baseConfig,
          origin: '*', // Mobile apps typically don't need CORS restrictions
          exposedHeaders: ['Content-Disposition', 'X-Suggested-Filename'],
        };
      case PlatformType.DESKTOP_WINDOWS:
      case PlatformType.DESKTOP_MAC:
      case PlatformType.DESKTOP_LINUX:
        return {
          ...baseConfig,
          origin: '*', // Desktop apps typically don't need CORS restrictions
          exposedHeaders: ['Content-Disposition', 'X-Suggested-Filename'],
        };
      default:
        return {
          ...baseConfig,
          origin: '*',
        };
    }
  }
} 