import { Module, DynamicModule, Provider, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { SessionSerializer } from './session/session.serializer';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';
import { OtpService } from './otp/otp.service';
import { SessionService } from './session/session.service';
import { RefreshTokenService } from './token/refresh-token.service';
import { RoleService } from '../role/role.service';
import { PermissionService } from '../permission/permission.service';
import { SmsModule } from '../sms/sms.module';
import { EmailModule } from '../email/email.module';

@Global()
@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt',
      session: true,
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRATION', '15m'),
        },
      }),
    }),
    SmsModule,
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    SessionSerializer,
    PrismaService,
    UserService,
    OtpService,
    SessionService,
    RefreshTokenService,
    RoleService,
    PermissionService,
  ],
  exports: [
    AuthService,
    JwtModule,
    PassportModule,
    UserService,
    OtpService,
    SessionService,
    RefreshTokenService,
    RoleService,
    PermissionService,
  ],
})
export class AuthModule {
  /**
   * Register the AuthModule with platform-specific configurations
   * @param options Configuration options for the auth module
   * @returns A DynamicModule configured for the specified platform
   */
  static forRoot(options?: {
    platformSpecific?: boolean;
    sessionEnabled?: boolean;
  }): DynamicModule {
    const platformSpecific = options?.platformSpecific ?? true;
    const sessionEnabled = options?.sessionEnabled ?? true;
    
    const providers: Provider[] = [];
    
    // Add platform-specific providers if enabled
    if (platformSpecific) {
      providers.push(
        {
          provide: 'PLATFORM_AUTH_STRATEGIES',
          useFactory: (configService: ConfigService) => {
            return {
              web: {
                tokenExpiration: configService.get<string>('JWT_WEB_EXPIRATION', '15m'),
                refreshTokenExpiration: configService.get<string>('JWT_WEB_REFRESH_EXPIRATION', '7d'),
                useSession: true,
              },
              mobile_android: {
                tokenExpiration: configService.get<string>('JWT_ANDROID_EXPIRATION', '30d'),
                refreshTokenExpiration: configService.get<string>('JWT_ANDROID_REFRESH_EXPIRATION', '90d'),
                useSession: false,
              },
              mobile_ios: {
                tokenExpiration: configService.get<string>('JWT_IOS_EXPIRATION', '30d'),
                refreshTokenExpiration: configService.get<string>('JWT_IOS_REFRESH_EXPIRATION', '90d'),
                useSession: false,
              },
              desktop: {
                tokenExpiration: configService.get<string>('JWT_DESKTOP_EXPIRATION', '7d'),
                refreshTokenExpiration: configService.get<string>('JWT_DESKTOP_REFRESH_EXPIRATION', '30d'),
                useSession: true,
              },
            };
          },
          inject: [ConfigService],
        }
      );
    }
    
    return {
      module: AuthModule,
      providers: [...providers],
      exports: [...providers],
    };
  }
} 