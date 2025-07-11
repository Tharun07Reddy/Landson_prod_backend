import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AnalyticsService } from './analytics.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly analyticsService: AnalyticsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    // Determine status code
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    
    // Get error message
    const message =
      exception instanceof HttpException
        ? exception.message
        : exception instanceof Error
        ? exception.message
        : 'Internal server error';
    
    // Get stack trace
    const stack =
      exception instanceof Error ? exception.stack : 'No stack trace available';
    
    // Log the error
    this.analyticsService.logError({
      level: status >= 500 ? 'error' : 'warn',
      message,
      stack,
      context: {
        path: request.url,
        method: request.method,
        statusCode: status,
        ip: request.ip,
        userAgent: request.get('user-agent'),
        userId: (request as any).user?.id,
      },
    }).catch(err => {
      console.error('Failed to log error to analytics', err);
    });
    
    // Return error response
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: status >= 500 ? 'Internal Server Error' : message,
    });
  }
} 