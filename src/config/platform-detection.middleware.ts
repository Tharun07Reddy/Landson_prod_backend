import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from './config.service';
import { PlatformType } from '@prisma/client';

@Injectable()
export class PlatformDetectionMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Detect platform from headers
    const platform = this.detectPlatform(req);
    
    // Set platform in config service for this request
    this.configService.setPlatform(platform);
    
    // Add platform to request for controllers to use
    (req as any).platform = platform;
    
    next();
  }

  private detectPlatform(req: Request): PlatformType | null {
    // Check for explicit platform header first
    const platformHeader = req.header('X-Platform');
    if (platformHeader) {
      switch (platformHeader.toLowerCase()) {
        case 'web':
          return PlatformType.WEB;
        case 'android':
          return PlatformType.MOBILE_ANDROID;
        case 'ios':
          return PlatformType.MOBILE_IOS;
        case 'windows':
          return PlatformType.DESKTOP_WINDOWS;
        case 'mac':
          return PlatformType.DESKTOP_MAC;
        case 'linux':
          return PlatformType.DESKTOP_LINUX;
        case 'all':
          return PlatformType.ALL;
      }
    }

    // If no explicit header, try to detect from user agent
    const userAgent = req.header('User-Agent') || '';
    
    // Mobile detection
    if (/android/i.test(userAgent)) {
      return PlatformType.MOBILE_ANDROID;
    }
    
    if (/iphone|ipad|ipod/i.test(userAgent)) {
      return PlatformType.MOBILE_IOS;
    }
    
    // Desktop detection
    if (/windows/i.test(userAgent)) {
      return PlatformType.DESKTOP_WINDOWS;
    }
    
    if (/macintosh|mac os x/i.test(userAgent)) {
      return PlatformType.DESKTOP_MAC;
    }
    
    if (/linux/i.test(userAgent) && !/android/i.test(userAgent)) {
      return PlatformType.DESKTOP_LINUX;
    }
    
    // Default to web if we can't determine
    return PlatformType.WEB;
  }
} 