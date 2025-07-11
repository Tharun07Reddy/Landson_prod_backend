import { 
  Injectable, 
  NestInterceptor, 
  ExecutionContext, 
  CallHandler 
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../config/config.service';
import { PlatformType } from '@prisma/client';

interface PlatformResponseOptions {
  compression?: boolean;
  includeMetadata?: boolean;
  payloadSizeLimit?: number;
}

@Injectable()
export class PlatformResponseInterceptor implements NestInterceptor {
  private platformOptions: Map<PlatformType | null, PlatformResponseOptions> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.loadPlatformOptions();
  }

  /**
   * Load platform-specific response options
   */
  private async loadPlatformOptions(): Promise<void> {
    try {
      // For each platform, load response formatting options
      for (const platformType of [...Object.values(PlatformType), null]) {
        const context = {
          environment: process.env.NODE_ENV || null,
          platform: platformType as PlatformType | null
        };
        
        const compression = await this.configService.get<boolean>(
          'RESPONSE_COMPRESSION_ENABLED', 
          true,
          true,
          context
        );
        
        const includeMetadata = await this.configService.get<boolean>(
          'RESPONSE_INCLUDE_METADATA', 
          platformType === PlatformType.WEB,
          true,
          context
        );
        
        const payloadSizeLimit = await this.configService.get<number>(
          'RESPONSE_PAYLOAD_SIZE_LIMIT', 
          platformType === PlatformType.MOBILE_ANDROID || platformType === PlatformType.MOBILE_IOS ? 100 * 1024 : 1024 * 1024,
          true,
          context
        );
        
        this.platformOptions.set(platformType as PlatformType | null, {
          compression,
          includeMetadata,
          payloadSizeLimit
        });
      }
    } catch (error) {
      console.error('Error loading platform response options', error);
      
      // Set default options
      for (const platformType of [...Object.values(PlatformType), null]) {
        const isMobile = platformType === PlatformType.MOBILE_ANDROID || platformType === PlatformType.MOBILE_IOS;
        
        this.platformOptions.set(platformType as PlatformType | null, {
          compression: true,
          includeMetadata: platformType === PlatformType.WEB,
          payloadSizeLimit: isMobile ? 100 * 1024 : 1024 * 1024 // 100KB for mobile, 1MB for others
        });
      }
    }
  }

  /**
   * Get options for a specific platform
   */
  private getOptionsForPlatform(platform: PlatformType | null): PlatformResponseOptions {
    return this.platformOptions.get(platform) || {
      compression: true,
      includeMetadata: false,
      payloadSizeLimit: 1024 * 1024
    };
  }

  /**
   * Intercept method to transform responses based on platform
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    
    // Get platform from request
    const platform = (req as any).platform as PlatformType | null;
    
    // Get options for this platform
    const options = this.getOptionsForPlatform(platform);
    
    // Set compression header if needed
    if (options.compression) {
      res.setHeader('Accept-Encoding', 'gzip, deflate');
    }
    
    return next.handle().pipe(
      map(data => {
        // If data is null or not an object, return as is
        if (!data || typeof data !== 'object') {
          return data;
        }
        
        // Check payload size
        const payloadSize = JSON.stringify(data).length;
        
        // For mobile platforms, trim large responses
        if (options.payloadSizeLimit && payloadSize > options.payloadSizeLimit) {
          // If it's an array, limit the number of items
          if (Array.isArray(data)) {
            const itemSize = payloadSize / data.length;
            const maxItems = Math.floor(options.payloadSizeLimit / itemSize);
            data = data.slice(0, maxItems);
          } else if (data.items && Array.isArray(data.items)) {
            // If it's a paginated response, limit the items
            const itemSize = JSON.stringify(data.items).length / data.items.length;
            const maxItems = Math.floor(options.payloadSizeLimit / itemSize);
            data.items = data.items.slice(0, maxItems);
            data.trimmed = true;
          }
        }
        
        // Add metadata if configured
        if (options.includeMetadata) {
          return {
            data,
            meta: {
              timestamp: new Date().toISOString(),
              platform: platform || 'unknown',
              environment: process.env.NODE_ENV || 'development',
              version: process.env.API_VERSION || '1.0.0'
            }
          };
        }
        
        return data;
      }),
    );
  }
} 