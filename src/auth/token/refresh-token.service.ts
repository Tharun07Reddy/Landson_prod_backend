import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RefreshToken, PlatformType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new refresh token for a user
   */
  async createRefreshToken(data: {
    userId: string;
    platform: PlatformType;
    deviceId?: string;
  }): Promise<RefreshToken> {
    try {
      // Generate a unique token
      const token = uuidv4();
      
      // Get expiration time based on platform
      const expiresAt = this.getTokenExpiration(data.platform);
      
      // Create the refresh token
      const refreshToken = await this.prisma.refreshToken.create({
        data: {
          userId: data.userId,
          token,
          platform: data.platform,
          deviceId: data.deviceId,
          expiresAt,
          isRevoked: false,
        },
      });
      
      return refreshToken;
    } catch (error) {
      this.logger.error(`Failed to create refresh token: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate a refresh token
   */
  async validateRefreshToken(token: string): Promise<RefreshToken | null> {
    try {
      const refreshToken = await this.prisma.refreshToken.findUnique({
        where: { token },
      });
      
      if (!refreshToken) {
        return null;
      }
      
      // Check if the token is valid and not expired
      const isValid = !refreshToken.isRevoked && new Date() < refreshToken.expiresAt;
      
      return isValid ? refreshToken : null;
    } catch (error) {
      this.logger.error(`Failed to validate refresh token: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Revoke a refresh token
   */
  async revokeRefreshToken(token: string): Promise<boolean> {
    try {
      await this.prisma.refreshToken.updateMany({
        where: { token },
        data: {
          isRevoked: true,
        },
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to revoke refresh token: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllUserRefreshTokens(userId: string): Promise<boolean> {
    try {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          isRevoked: false,
        },
        data: {
          isRevoked: true,
        },
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to revoke all user refresh tokens: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Clean up expired refresh tokens (can be run as a scheduled task)
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          OR: [
            {
              expiresAt: {
                lt: new Date(),
              },
            },
            {
              isRevoked: true,
              updatedAt: {
                lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days old
              },
            },
          ],
        },
      });
      
      return result.count;
    } catch (error) {
      this.logger.error(`Failed to cleanup expired tokens: ${error.message}`, error.stack);
      return 0;
    }
  }

  /**
   * Get token expiration time based on platform
   */
  private getTokenExpiration(platform: PlatformType): Date {
    let expirationDays: number;
    
    switch (platform) {
      case PlatformType.WEB:
        expirationDays = this.configService.get<number>('REFRESH_TOKEN_WEB_EXPIRATION_DAYS', 7);
        break;
      case PlatformType.MOBILE_ANDROID:
      case PlatformType.MOBILE_IOS:
        expirationDays = this.configService.get<number>('REFRESH_TOKEN_MOBILE_EXPIRATION_DAYS', 90);
        break;
      case PlatformType.DESKTOP_WINDOWS:
      case PlatformType.DESKTOP_MAC:
      case PlatformType.DESKTOP_LINUX:
        expirationDays = this.configService.get<number>('REFRESH_TOKEN_DESKTOP_EXPIRATION_DAYS', 30);
        break;
      default:
        expirationDays = 7; // Default: 7 days
    }
    
    return new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);
  }
} 