import { Module, Global, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { NetworkService } from './network.service';
import { PlatformRateLimitMiddleware } from './platform-rate-limit.middleware';
import { PlatformResponseInterceptor } from './platform-response.interceptor';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '../config/config.module';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Global()
@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    NetworkService,
    PlatformRateLimitMiddleware,
    {
      provide: APP_INTERCEPTOR,
      useClass: PlatformResponseInterceptor,
    },
  ],
  exports: [NetworkService, PlatformRateLimitMiddleware],
})
export class NetworkModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(PlatformRateLimitMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
} 