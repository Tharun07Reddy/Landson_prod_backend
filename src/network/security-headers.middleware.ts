import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { NetworkService } from './network.service';

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  constructor(private readonly networkService: NetworkService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Apply security headers from network service
    const securityHeaders = this.networkService.getSecurityHeaders();
    
    securityHeaders.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    next();
  }
} 