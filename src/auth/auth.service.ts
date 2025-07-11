import { Injectable, Inject, UnauthorizedException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';
import { OtpService } from './otp/otp.service';
import { SessionService } from './session/session.service';
import { RefreshTokenService } from './token/refresh-token.service';
import { RoleService } from '../role/role.service';
import { PermissionService } from '../permission/permission.service';
import { PlatformType, User, OTPType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user: Partial<User>;
  sessionId?: string;
}

interface TokenPayload {
  sub: string;
  username: string;
  email?: string;
  roles: string[];
  platform: PlatformType;
  sessionId?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly otpService: OtpService,
    private readonly sessionService: SessionService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly roleService: RoleService,
    private readonly permissionService: PermissionService,
    @Inject('PLATFORM_AUTH_STRATEGIES') private readonly platformStrategies: Record<string, any>,
  ) {}

  /**
   * Validate user credentials
   */
  async validateUser(usernameOrEmail: string, password: string): Promise<any> {
    // Check if the input is an email or username
    const isEmail = usernameOrEmail.includes('@');
    
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: isEmail ? usernameOrEmail : undefined },
          { username: !isEmail ? usernameOrEmail : undefined },
        ],
        isActive: true,
      },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Remove sensitive data
    const { password: _, ...result } = user;
    return result;
  }

  /**
   * Login with username/email and password
   */
  async login(user: any, platform: PlatformType, deviceId?: string, ipAddress?: string, userAgent?: string): Promise<LoginResponse> {
    // Get platform-specific settings
    const platformKey = this.getPlatformKey(platform);
    const platformConfig = this.platformStrategies[platformKey];
    
    if (!platformConfig) {
      throw new BadRequestException(`Unsupported platform: ${platform}`);
    }

    // Get user roles
    const roles = user.userRoles.map(ur => ur.role.name);
    
    let sessionId: string | undefined;
    
    // Create session if platform uses sessions
    if (platformConfig.useSession) {
      const session = await this.sessionService.createSession({
        userId: user.id,
        platform,
        deviceId,
        ipAddress,
        userAgent,
      });
      sessionId = session.id;
    }

    // Generate JWT token
    const payload: TokenPayload = {
      sub: user.id,
      username: user.username || '',
      email: user.email,
      roles,
      platform,
      sessionId,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: platformConfig.tokenExpiration,
    });

    // Create refresh token
    const refreshToken = await this.refreshTokenService.createRefreshToken({
      userId: user.id,
      platform,
      deviceId,
    });

    // Update user's last login time
    await this.userService.updateLastLogin(user.id, platform);

    // Log the login event
    this.logAuthEvent(user.id, 'login', platform, { deviceId, ipAddress });

    // Return login response with user data
    const { password, ...userData } = user;
    
    // Calculate token expiration in seconds
    const tokenExpirationString = platformConfig.tokenExpiration;
    let expiresInSeconds = 900; // Default 15 minutes
    
    if (typeof tokenExpirationString === 'string') {
      if (tokenExpirationString.endsWith('m')) {
        expiresInSeconds = parseInt(tokenExpirationString) * 60;
      } else if (tokenExpirationString.endsWith('h')) {
        expiresInSeconds = parseInt(tokenExpirationString) * 3600;
      } else if (tokenExpirationString.endsWith('d')) {
        expiresInSeconds = parseInt(tokenExpirationString) * 86400;
      }
    }

    return {
      accessToken,
      refreshToken: refreshToken.token,
      expiresIn: expiresInSeconds,
      user: userData,
      sessionId,
    };
  }

  /**
   * Register a new user
   */
  async register(userData: any, platform: PlatformType): Promise<any> {
    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: userData.email },
          { phone: userData.phone },
          { username: userData.username },
        ],
      },
    });

    if (existingUser) {
      throw new BadRequestException('User with this email, phone, or username already exists');
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // Create the user
    const user = await this.prisma.user.create({
      data: {
        email: userData.email,
        phone: userData.phone,
        username: userData.username,
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        platform,
        deviceInfo: userData.deviceInfo || {},
      },
    });

    // Assign default role (user)
    const userRole = await this.prisma.role.findUnique({
      where: { name: 'user' },
    });

    if (userRole) {
      await this.prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: userRole.id,
        },
      });
    }

    // Generate verification OTPs
    if (userData.email) {
      await this.otpService.generateOTP(user.id, OTPType.EMAIL_VERIFICATION);
    }

    if (userData.phone) {
      await this.otpService.generateOTP(user.id, OTPType.PHONE_VERIFICATION);
    }

    // Log the registration event
    this.logAuthEvent(user.id, 'register', platform, {});

    // Remove sensitive data
    const { password, ...result } = user;
    return result;
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshToken(token: string, platform: PlatformType): Promise<Partial<LoginResponse>> {
    // Validate the refresh token
    const refreshTokenData = await this.refreshTokenService.validateRefreshToken(token);
    
    if (!refreshTokenData || refreshTokenData.isRevoked) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Get the user
    const user = await this.prisma.user.findUnique({
      where: { id: refreshTokenData.userId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Get platform-specific settings
    const platformKey = this.getPlatformKey(platform);
    const platformConfig = this.platformStrategies[platformKey];
    
    // Get user roles
    const roles = user.userRoles.map(ur => ur.role.name);
    
    // Generate new JWT token
    const payload: TokenPayload = {
      sub: user.id,
      username: user.username || '',
      email: user.email || undefined,
      roles,
      platform,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: platformConfig.tokenExpiration,
    });

    // Calculate token expiration in seconds
    const tokenExpirationString = platformConfig.tokenExpiration;
    let expiresInSeconds = 900; // Default 15 minutes
    
    if (typeof tokenExpirationString === 'string') {
      if (tokenExpirationString.endsWith('m')) {
        expiresInSeconds = parseInt(tokenExpirationString) * 60;
      } else if (tokenExpirationString.endsWith('h')) {
        expiresInSeconds = parseInt(tokenExpirationString) * 3600;
      } else if (tokenExpirationString.endsWith('d')) {
        expiresInSeconds = parseInt(tokenExpirationString) * 86400;
      }
    }

    // Log the token refresh event
    this.logAuthEvent(user.id, 'token_refresh', platform, {});

    return {
      accessToken,
      expiresIn: expiresInSeconds,
    };
  }

  /**
   * Logout a user
   */
  async logout(userId: string, sessionId?: string, refreshToken?: string, platform?: PlatformType): Promise<boolean> {
    try {
      // If we have a session ID, invalidate the session
      if (sessionId) {
        await this.sessionService.invalidateSession(sessionId);
      }

      // If we have a refresh token, revoke it
      if (refreshToken) {
        await this.refreshTokenService.revokeRefreshToken(refreshToken);
      }

      // Log the logout event
      if (platform) {
        this.logAuthEvent(userId, 'logout', platform, { sessionId });
      }

      return true;
    } catch (error) {
      this.logger.error(`Error during logout: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Verify a user's OTP code
   */
  async verifyOTP(userId: string, code: string, type: OTPType): Promise<boolean> {
    return this.otpService.verifyOTP(userId, code, type);
  }

  /**
   * Check if a user has a specific permission
   */
  async hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    return this.permissionService.userHasPermission(userId, resource, action);
  }

  /**
   * Log an authentication event
   */
  private async logAuthEvent(userId: string, action: string, platform: PlatformType, metadata: any): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          resource: 'auth',
          platform,
          metadata,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log auth event: ${error.message}`, error.stack);
    }
  }

  /**
   * Get the platform key for the strategies configuration
   */
  private getPlatformKey(platform: PlatformType): string {
    switch (platform) {
      case PlatformType.WEB:
        return 'web';
      case PlatformType.MOBILE_ANDROID:
        return 'mobile_android';
      case PlatformType.MOBILE_IOS:
        return 'mobile_ios';
      case PlatformType.DESKTOP_WINDOWS:
      case PlatformType.DESKTOP_MAC:
      case PlatformType.DESKTOP_LINUX:
        return 'desktop';
      default:
        return 'web';
    }
  }
} 