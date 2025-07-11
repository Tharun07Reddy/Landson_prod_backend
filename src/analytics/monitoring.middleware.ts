import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class MonitoringMiddleware implements NestMiddleware {
  constructor(private readonly analyticsService: AnalyticsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Start timer
    const start = Date.now();
    
    // Store original end method
    const originalEnd = res.end;
    
    // Override end method to capture response metrics
    res.end = function(chunk?: any, encoding?: BufferEncoding | (() => void), callback?: () => void): Response {
      // Calculate response time
      const responseTime = Date.now() - start;
      
      // Get the original this context
      const response = this as Response;
      
      // Track the request as an event
      this.req.analyticsService.trackEvent({
        type: 'request',
        source: 'api',
        properties: {
          path: req.path,
          method: req.method,
          statusCode: response.statusCode,
          responseTime,
        },
        metadata: {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          referer: req.get('referer'),
          path: req.path,
          method: req.method,
          statusCode: response.statusCode,
          duration: responseTime,
        },
      }).catch(err => {
        console.error('Failed to track request event', err);
      });
      
      // Record response time metric
      this.req.analyticsService.recordMetric({
        name: 'http_response_time',
        value: responseTime,
        unit: 'ms',
        tags: {
          path: req.path,
          method: req.method,
          statusCode: response.statusCode,
        },
      }).catch(err => {
        console.error('Failed to record response time metric', err);
      });
      
      // Call original end method
      return originalEnd.call(this, chunk, encoding as BufferEncoding, callback);
    };
    
    // Attach analytics service to request for use in error handlers
    (req as any).analyticsService = this.analyticsService;
    
    // Continue with request
    next();
  }
} 