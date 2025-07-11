import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  BadRequestException,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { OtpService } from './otp/otp.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PlatformType, OTPType, User } from '@prisma/client';
import { Request } from 'express';
import { RequirePermissions } from './decorators/permissions.decorator';
import { Public } from './decorators/public.decorator';

// DTOs would normally be in separate files
class LoginDto {
  usernameOrEmail: string;
  password: string;
  platform: PlatformType;
  deviceId?: string;
}

class RegisterDto {
  email?: string;
  phone?: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
  platform: PlatformType;
  deviceInfo?: Record<string, any>;
}

class VerifyOtpDto {
  code: string;
  type: OTPType;
}

class RefreshTokenDto {
  refreshToken: string;
  platform: PlatformType;
}

// Define response types to match AuthService
interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user: Partial<User>;
  sessionId?: string;
}

interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
  ) {}

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent: string,
  ): Promise<AuthResponse> {
    // The user is already validated by the LocalAuthGuard
    const { platform, deviceId } = loginDto;
    const ipAddress = req.ip;
    
    return this.authService.login(
      req.user,
      platform,
      deviceId,
      ipAddress,
      userAgent,
    );
  }

  @Post('register')
  @Public()
  async register(@Body() registerDto: RegisterDto): Promise<Partial<User>> {
    // Validate that at least email or phone is provided
    if (!registerDto.email && !registerDto.phone) {
      throw new BadRequestException('Either email or phone number is required');
    }

    return this.authService.register(registerDto, registerDto.platform);
  }

  @Post('verify-otp/:userId')
  @Public()
  async verifyOtp(
    @Param('userId') userId: string,
    @Body() verifyOtpDto: VerifyOtpDto,
  ): Promise<{ success: boolean; message: string }> {
    const { code, type } = verifyOtpDto;
    const verified = await this.authService.verifyOTP(userId, code, type);
    
    return {
      success: verified,
      message: verified ? 'Verification successful' : 'Verification failed',
    };
  }

  @Post('refresh-token')
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto): Promise<TokenResponse> {
    const { refreshToken, platform } = refreshTokenDto;
    
    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }
    
    try {
      return await this.authService.refreshToken(refreshToken, platform) as TokenResponse;
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
  ): Promise<{ success: boolean }> {
    const user = req.user as any;
    const sessionId = user.sessionId;
    const refreshToken = body.refreshToken;
    const platform = user.platform;
    
    return {
      success: await this.authService.logout(
        user.sub,
        sessionId,
        refreshToken,
        platform,
      ),
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'users', action: 'read' })
  getProfile(@Req() req: Request): any {
    return req.user;
  }

  @Post('resend-otp/:userId')
  @Public()
  async resendOtp(
    @Param('userId') userId: string,
    @Body() body: { type: OTPType },
  ): Promise<{ success: boolean; expiresAt: Date; message: string }> {
    const { type } = body;
    const otp = await this.otpService.generateOTP(userId, type);
    
    return {
      success: true,
      expiresAt: otp.expiresAt,
      message: `Verification code sent successfully`,
    };
  }
} 