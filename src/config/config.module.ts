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
      envFilePath: '.env',
      ignoreEnvFile: false,
      cache: true,
      expandVariables: true,
    }),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
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