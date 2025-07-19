import { Injectable, OnModuleInit, Req, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { PlatformType } from '@prisma/client';
import { Request } from 'express';

@Injectable()
export class NetworkService implements OnModuleInit {
  private readonly logger = new Logger(NetworkService.name);
  private corsConfigs: Map<PlatformType | null, any> = new Map();
  private rateLimitRules: Map<PlatformType | null, any[]> = new Map();
  private connectionSettings: Map<PlatformType | null, any> = new Map();
  private securityHeaders: Map<string, string> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.loadNetworkConfigurations();
    this.setupSecurityHeaders();
  }

  /**
   * Load all network configurations from the database
   */
  async loadNetworkConfigurations(): Promise<void> {
    try {
      const environment = process.env.NODE_ENV || 'development';
      this.logger.log(`Loading network configurations for environment: ${environment}`);
      
      // Load CORS configurations for all platforms
      const corsConfigs = await this.prisma.networkConfig.findMany({
        where: {
          name: 'cors',
          isEnabled: true,
          environment: {
            in: [environment, null] as string[]
          },
        },
      });
      
      // Group CORS configs by platform
      for (const platformType of Object.values(PlatformType)) {
        // Try to find environment-specific config for this platform
        let platformConfig = corsConfigs.find(c => 
          c.platform === platformType && c.environment === environment
        );
        
        // If not found, try platform-specific but environment-agnostic config
        if (!platformConfig) {
          platformConfig = corsConfigs.find(c => 
            c.platform === platformType && c.environment === null
          );
        }
        
        // If still not found, try environment-specific but platform-agnostic config
        if (!platformConfig) {
          platformConfig = corsConfigs.find(c => 
            c.platform === null && c.environment === environment
          );
        }
        
        // If still not found, use default config
        if (platformConfig) {
          try {
            this.corsConfigs.set(platformType, JSON.parse(platformConfig.config));
            this.logger.debug(`Loaded CORS config for platform: ${platformType}`);
          } catch (e) {
            this.logger.error(`Invalid CORS configuration format for platform ${platformType}`, e);
            this.corsConfigs.set(platformType, this.getDefaultCorsConfig(platformType));
          }
        } else {
          this.corsConfigs.set(platformType, this.getDefaultCorsConfig(platformType));
          this.logger.debug(`Using default CORS config for platform: ${platformType}`);
        }
      }

      // Set default CORS config for null platform (fallback)
      const defaultConfig = corsConfigs.find(c => 
        c.platform === null && (c.environment === environment || c.environment === null)
      );
      
      if (defaultConfig) {
        try {
          this.corsConfigs.set(null, JSON.parse(defaultConfig.config));
          this.logger.debug('Loaded default CORS config');
        } catch (e) {
          this.logger.error('Invalid default CORS configuration format', e);
          this.corsConfigs.set(null, this.getDefaultCorsConfig(null));
        }
      } else {
        this.corsConfigs.set(null, this.getDefaultCorsConfig(null));
        this.logger.debug('Using fallback default CORS config');
      }

      // Load rate limiting rules
      const rateLimitRules = await this.prisma.rateLimitRule.findMany({
        where: {
          isEnabled: true,
          OR: [
            { environment: environment },
            { environment: null }
          ]
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      this.logger.log(`Loaded ${rateLimitRules.length} rate limit rules`);

      // Group rate limit rules by platform
      for (const platformType of [...Object.values(PlatformType), null]) {
        // Get platform-specific rules
        const platformRules = rateLimitRules.filter(rule => 
          rule.platform === platformType || rule.platform === null
        );
        
        // Prioritize environment-specific rules
        const prioritizedRules = platformRules
          .sort((a, b) => {
            // Environment-specific rules have higher priority
            if (a.environment === environment && b.environment !== environment) return -1;
            if (a.environment !== environment && b.environment === environment) return 1;
            
            // Method-specific rules have higher priority than general rules
            if (a.method && !b.method) return -1;
            if (!a.method && b.method) return 1;
            
            // More specific paths have higher priority
            return (b.path?.length || 0) - (a.path?.length || 0);
          });
        
        this.rateLimitRules.set(platformType as PlatformType | null, prioritizedRules);
      }

      // Load connection settings
      await this.loadConnectionSettings();
      
      this.logger.log('Network configurations loaded successfully');
    } catch (error) {
      this.logger.error('Error loading network configurations', error);
      // Use defaults if loading fails
      this.initializeDefaults();
    }
  }

  /**
   * Load connection settings from configuration
   */
  private async loadConnectionSettings(): Promise<void> {
    try {
      const environment = process.env.NODE_ENV || 'development';
      
      // For each platform, load connection settings
      for (const platformType of [...Object.values(PlatformType), null]) {
        const context = {
          environment,
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
      
      this.logger.debug('Connection settings loaded successfully');
    } catch (error) {
      this.logger.error('Error loading connection settings', error);
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
   * Set up security headers
   */
  private setupSecurityHeaders(): void {
    // Common security headers
    this.securityHeaders.set('X-Content-Type-Options', 'nosniff');
    this.securityHeaders.set('X-Frame-Options', 'SAMEORIGIN');
    this.securityHeaders.set('X-XSS-Protection', '1; mode=block');
    
    // Production-specific headers
    if (process.env.NODE_ENV === 'production') {
      this.securityHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      this.securityHeaders.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'");
      this.securityHeaders.set('Referrer-Policy', 'same-origin');
    }
    
    this.logger.log(`Security headers configured for ${process.env.NODE_ENV || 'development'} environment`);
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
    
    this.logger.warn('Using default network configurations');
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
    
    // Find the most specific rule that matches the path and method
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
   * Get security headers
   */
  getSecurityHeaders(): Map<string, string> {
    return this.securityHeaders;
  }

  /**
   * Default CORS configuration based on platform
   */
  private getDefaultCorsConfig(platform: PlatformType | null): any {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // Base CORS config
    const baseConfig = {
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      preflightContinue: false,
      optionsSuccessStatus: 204,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform', 'X-Device-Id'],
    };
    
    // Development allows all origins
    if (isDevelopment) {
      return {
        ...baseConfig,
        origin: true, // Allow all origins in development
        exposedHeaders: ['Content-Disposition', 'X-Suggested-Filename'],
      };
    }
    
    // Platform-specific adjustments for production
    switch (platform) {
      case PlatformType.WEB:
        return {
          ...baseConfig,
          origin: [
            'https://app.yourdomain.com',
            'https://admin.yourdomain.com',
            'https://yourdomain.com',
          ],
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
          origin: [
            'https://desktop.yourdomain.com',
            'app://desktop.yourdomain.com',
          ],
        };
      default:
        // Default restrictive config for production
        return {
          ...baseConfig,
          origin: 'https://yourdomain.com',
        };
    }
  }
} 