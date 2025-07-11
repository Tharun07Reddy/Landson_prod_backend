import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { NetworkService } from './network.service';
import { PlatformType } from '@prisma/client';
import * as rateLimit from 'express-rate-limit';
import * as RedisStore from 'rate-limit-redis';

@Injectable()
export class PlatformRateLimitMiddleware implements NestMiddleware {
  private limiters: Map<string, any> = new Map();

  constructor(private readonly networkService: NetworkService) {
    this.initializeLimiters();
  }

  /**
   * Initialize rate limiters for each platform and path combination
   */
  private initializeLimiters(): void {
    // For each platform type
    for (const platformType of [...Object.values(PlatformType), null]) {
      // Get rules for this platform
      const rules = this.networkService.getRateLimitRules(platformType as PlatformType | null);
      
      // For each rule, create a limiter
      for (const rule of rules) {
        const key = `${platformType || 'default'}-${rule.path}-${rule.method || 'all'}`;
        
        // Create limiter with the rule's settings
        const limiter = rateLimit.default({
          windowMs: rule.windowSec * 1000,
          max: rule.limit,
          standardHeaders: true,
          legacyHeaders: false,
          message: {
            status: 429,
            message: `Too many requests from this ${platformType || 'client'}. Please try again later.`,
          },
          // Optional Redis store for distributed rate limiting
          // store: process.env.REDIS_URL ? new RedisStore({
          //   redisURL: process.env.REDIS_URL,
          //   prefix: `ratelimit:${platformType || 'default'}:`
          // }) : undefined
        });
        
        this.limiters.set(key, limiter);
      }
    }
  }

  /**
   * Apply rate limiting middleware
   */
  use(req: Request, res: Response, next: NextFunction) {
    // Get platform from request
    const platform = (req as any).platform as PlatformType | null;
    const path = req.path;
    const method = req.method;
    
    // Find applicable rule
    const rule = this.networkService.getRateLimitRule(path, method, platform);
    
    if (rule) {
      // Get or create limiter for this rule
      const key = `${platform || 'default'}-${rule.path}-${rule.method || 'all'}`;
      const limiter = this.limiters.get(key);
      
      if (limiter) {
        // Apply the limiter
        return limiter(req, res, next);
      }
    }
    
    // No applicable rule or limiter, proceed
    next();
  }

  /**
   * Reload rate limiters when rules change
   */
  reloadLimiters(): void {
    this.limiters.clear();
    this.initializeLimiters();
  }
} 