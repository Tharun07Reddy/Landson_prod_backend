import { Injectable, Scope } from '@nestjs/common';
import { AnalyticsService, ErrorData } from './analytics.service';

@Injectable({ scope: Scope.TRANSIENT })
export class ErrorLoggerService {
  private context: string = 'Application';
  
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Set the context for the logger
   */
  setContext(context: string): this {
    this.context = context;
    return this;
  }

  /**
   * Log an error
   */
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    const errorData: ErrorData = {
      level: 'error',
      message,
      stack: error?.stack,
      context: {
        ...metadata,
        context: this.context,
      },
    };
    
    // Log to console for immediate visibility
    console.error(`[${this.context}] ${message}`, error);
    
    // Track in analytics system
    this.analyticsService.logError(errorData).catch(err => {
      console.error('Failed to log error to analytics', err);
    });
  }

  /**
   * Log a warning
   */
  warn(message: string, metadata?: Record<string, any>): void {
    const errorData: ErrorData = {
      level: 'warn',
      message,
      context: {
        ...metadata,
        context: this.context,
      },
    };
    
    // Log to console for immediate visibility
    console.warn(`[${this.context}] ${message}`);
    
    // Track in analytics system
    this.analyticsService.logError(errorData).catch(err => {
      console.error('Failed to log warning to analytics', err);
    });
  }

  /**
   * Log an info message
   */
  info(message: string, metadata?: Record<string, any>): void {
    const errorData: ErrorData = {
      level: 'info',
      message,
      context: {
        ...metadata,
        context: this.context,
      },
    };
    
    // Log to console for immediate visibility
    console.info(`[${this.context}] ${message}`);
    
    // Track in analytics system
    this.analyticsService.logError(errorData).catch(err => {
      console.error('Failed to log info to analytics', err);
    });
  }

  /**
   * Log a debug message
   */
  debug(message: string, metadata?: Record<string, any>): void {
    const errorData: ErrorData = {
      level: 'debug',
      message,
      context: {
        ...metadata,
        context: this.context,
      },
    };
    
    // Log to console for immediate visibility
    console.debug(`[${this.context}] ${message}`);
    
    // Track in analytics system
    this.analyticsService.logError(errorData).catch(err => {
      console.error('Failed to log debug message to analytics', err);
    });
  }
} 