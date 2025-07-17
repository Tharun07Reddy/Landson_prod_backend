import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { NetworkModule } from './network/network.module';
import { CacheModule } from './cache/cache.module';
import { EmailModule } from './email/email.module';
import { SmsModule } from './sms/sms.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { FeatureModule } from './feature/feature.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { CategoryModule } from './category/category.module';
import { SupportModule } from './support/support.module';
import { ProductModule } from './product/product.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionGuard } from './auth/guards/permission.guard';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    NetworkModule,
    CacheModule,
    EmailModule,
    SmsModule,
    AnalyticsModule,
    FeatureModule,
    AuthModule.forRoot({
      platformSpecific: true,
      sessionEnabled: true,
    }),
    UserModule,
    CategoryModule,
    ProductModule,
    SupportModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global JWT authentication guard
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global permission guard
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
})
export class AppModule {}
