import { Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { SmsModule } from '../../sms/sms.module';
import { EmailModule } from '../../email/email.module';
import { CacheModule } from '../../cache/cache.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    SmsModule,
    EmailModule,
    CacheModule,
  ],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {} 