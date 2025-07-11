import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { MongoService } from './mongo.service';
import { PrismaService } from '../prisma/prisma.service';

export interface EventData {
  type: string;
  source: string;
  userId?: string;
  sessionId?: string;
  properties?: Record<string, any>;
  metadata?: {
    ip?: string;
    userAgent?: string;
    referer?: string;
    path?: string;
    method?: string;
    statusCode?: number;
    duration?: number;
  };
}

export interface MetricData {
  name: string;
  value: number;
  unit: string;
  tags?: Record<string, any>;
  serviceId?: string;
}

export interface ErrorData {
  level?: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  stack?: string;
  context?: Record<string, any>;
  serviceId?: string;
  userId?: string;
}

@Injectable()
export class AnalyticsService implements OnModuleInit {
  private isEnabled = true;
  private batchSize = 10;
  private eventQueue: EventData[] = [];
  private metricQueue: MetricData[] = [];
  private errorQueue: ErrorData[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly mongoService: MongoService,
    private readonly prismaService: PrismaService,
  ) {}

  async onModuleInit() {
    await this.initialize();
  }

  /**
   * Initialize analytics service
   */
  async initialize(): Promise<void> {
    try {
      const enabledFlag = await this.configService.get<boolean>('enable-analytics', true);
      this.isEnabled = enabledFlag ?? true;
      
      if (!this.isEnabled) {
        console.warn('Analytics service is disabled by feature flag');
        return;
      }

      // Use default values if environment variables are not set
      const batchSizeValue = await this.configService.get<number>('ANALYTICS_BATCH_SIZE', 10);
      this.batchSize = batchSizeValue ?? 10;
      
      const flushIntervalMs = await this.configService.get<number>('ANALYTICS_FLUSH_INTERVAL_MS', 5000) ?? 5000;
      
      // Set up periodic flushing of queues
      this.flushInterval = setInterval(() => this.flushQueues(), flushIntervalMs);
      
      console.log('Analytics service initialized');
    } catch (error) {
      console.error('Failed to initialize analytics service', error);
      this.isEnabled = false;
    }
  }

  /**
   * Track an event
   */
  async trackEvent(eventData: EventData): Promise<boolean> {
    if (!this.isEnabled) return false;

    try {
      // Add timestamp if not provided
      const event = {
        ...eventData,
        timestamp: new Date(),
      };

      // Queue the event
      this.eventQueue.push(event);

      // Store in PostgreSQL for recent events
      await this.prismaService.event.create({
        data: {
          type: event.type,
          source: event.source,
          timestamp: event.timestamp,
          userId: event.userId,
          sessionId: event.sessionId,
          properties: event.properties as any,
          metadata: event.metadata ? {
            create: {
              ip: event.metadata.ip,
              userAgent: event.metadata.userAgent,
              referer: event.metadata.referer,
              path: event.metadata.path,
              method: event.metadata.method,
              statusCode: event.metadata.statusCode,
              duration: event.metadata.duration,
            }
          } : undefined,
        },
      });

      // Flush if queue is full
      if (this.eventQueue.length >= this.batchSize) {
        await this.flushEventQueue();
      }

      return true;
    } catch (error) {
      console.error('Error tracking event', error);
      return false;
    }
  }

  /**
   * Record a metric
   */
  async recordMetric(metricData: MetricData): Promise<boolean> {
    if (!this.isEnabled) return false;

    try {
      // Add timestamp if not provided
      const metric = {
        ...metricData,
        timestamp: new Date(),
      };

      // Queue the metric
      this.metricQueue.push(metric);

      // Store in PostgreSQL for recent metrics
      await this.prismaService.performanceMetric.create({
        data: {
          name: metric.name,
          value: metric.value,
          unit: metric.unit,
          timestamp: metric.timestamp,
          tags: metric.tags as any,
          serviceId: metric.serviceId,
        },
      });

      // Flush if queue is full
      if (this.metricQueue.length >= this.batchSize) {
        await this.flushMetricQueue();
      }

      return true;
    } catch (error) {
      console.error('Error recording metric', error);
      return false;
    }
  }

  /**
   * Log an error
   */
  async logError(errorData: ErrorData): Promise<boolean> {
    if (!this.isEnabled) return false;

    try {
      // Add timestamp and default level if not provided
      const error = {
        ...errorData,
        level: errorData.level || 'error',
        timestamp: new Date(),
      };

      // Queue the error
      this.errorQueue.push(error);

      // Store in PostgreSQL for recent errors
      await this.prismaService.errorLog.create({
        data: {
          level: error.level,
          message: error.message,
          stack: error.stack,
          context: error.context as any,
          timestamp: error.timestamp,
          serviceId: error.serviceId,
          userId: error.userId,
        },
      });

      // Flush if queue is full
      if (this.errorQueue.length >= this.batchSize) {
        await this.flushErrorQueue();
      }

      return true;
    } catch (error) {
      console.error('Error logging error', error);
      return false;
    }
  }

  /**
   * Flush all queues
   */
  async flushQueues(): Promise<void> {
    await Promise.all([
      this.flushEventQueue(),
      this.flushMetricQueue(),
      this.flushErrorQueue(),
    ]);
  }

  /**
   * Flush event queue to MongoDB
   */
  private async flushEventQueue(): Promise<void> {
    if (!this.isEnabled || this.eventQueue.length === 0) return;

    try {
      const events = [...this.eventQueue];
      this.eventQueue = [];

      await this.mongoService.insertMany('events', events);
    } catch (error) {
      console.error('Error flushing event queue', error);
      // Put events back in queue
      this.eventQueue = [...this.eventQueue, ...this.eventQueue];
    }
  }

  /**
   * Flush metric queue to MongoDB
   */
  private async flushMetricQueue(): Promise<void> {
    if (!this.isEnabled || this.metricQueue.length === 0) return;

    try {
      const metrics = [...this.metricQueue];
      this.metricQueue = [];

      await this.mongoService.insertMany('metrics', metrics);
    } catch (error) {
      console.error('Error flushing metric queue', error);
      // Put metrics back in queue
      this.metricQueue = [...this.metricQueue, ...this.metricQueue];
    }
  }

  /**
   * Flush error queue to MongoDB
   */
  private async flushErrorQueue(): Promise<void> {
    if (!this.isEnabled || this.errorQueue.length === 0) return;

    try {
      const errors = [...this.errorQueue];
      this.errorQueue = [];

      await this.mongoService.insertMany('errors', errors);
    } catch (error) {
      console.error('Error flushing error queue', error);
      // Put errors back in queue
      this.errorQueue = [...this.errorQueue, ...this.errorQueue];
    }
  }

  /**
   * Clean up resources
   */
  onModuleDestroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    // Flush any remaining items
    this.flushQueues().catch(err => {
      console.error('Error flushing queues on destroy', err);
    });
  }
} 