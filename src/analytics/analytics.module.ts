import { Module, MiddlewareConsumer, RequestMethod, Global } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsService } from './analytics.service';
import { MongoService } from './mongo.service';
import { DashboardController } from './dashboard.controller';
import { MetricsController } from './metrics.controller';
import { EventsController } from './events.controller';
import { MonitoringMiddleware } from './monitoring.middleware';
import { ErrorLoggerService } from './error-logger.service';
import { GlobalExceptionFilter } from './global-exception.filter';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    AnalyticsService,
    MongoService,
    ErrorLoggerService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
  controllers: [DashboardController, MetricsController, EventsController],
  exports: [AnalyticsService, MongoService, ErrorLoggerService],
})
export class AnalyticsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(MonitoringMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
} 