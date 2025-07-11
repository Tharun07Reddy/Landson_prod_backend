import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigService } from './config.service';
import { ConfigManagerService } from './config-manager.service';
import { ConfigController } from './config.controller';
import { ConfigMonitorService } from './config-monitor.service';
import { ConfigAuditService } from './config-audit.service';
import { ConfigAuditController } from './config-audit.controller';
import { PlatformDetectionMiddleware } from './platform-detection.middleware';
import { PrismaModule } from '../prisma/prisma.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'env',
    }),
    EventEmitterModule.forRoot({
      // set this to `true` to use wildcards
      wildcard: false,
      // the delimiter used to segment namespaces
      delimiter: '.',
      // set this to `true` if you want to emit the newListener event
      newListener: false,
      // set this to `true` if you want to emit the removeListener event
      removeListener: false,
      // the maximum amount of listeners that can be assigned to an event
      maxListeners: 10,
      // show event name in memory leak message when more than maximum amount of listeners is assigned
      verboseMemoryLeak: false,
      // disable throwing uncaughtException if an error event is emitted and it has no listeners
      ignoreErrors: false,
    }),
    PrismaModule,
  ],
  controllers: [ConfigController, ConfigAuditController],
  providers: [
    ConfigService, 
    ConfigManagerService,
    ConfigMonitorService,
    ConfigAuditService
  ],
  exports: [
    ConfigService, 
    ConfigManagerService,
    ConfigMonitorService,
    ConfigAuditService
  ],
})
export class ConfigModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(PlatformDetectionMiddleware)
      .forRoutes('*'); // Apply to all routes
  }
} 