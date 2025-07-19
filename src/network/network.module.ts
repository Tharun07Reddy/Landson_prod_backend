import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { NetworkService } from './network.service';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SecurityHeadersMiddleware } from './security-headers.middleware';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [NetworkService],
  exports: [NetworkService],
})
export class NetworkModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SecurityHeadersMiddleware)
      .forRoutes('*'); // Apply to all routes
  }
} 