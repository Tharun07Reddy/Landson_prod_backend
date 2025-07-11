import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Session, PlatformType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new user session
   */
  async createSession(data: {
    userId: string;
    platform: PlatformType;
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<Session> {
    try {
      // Generate a unique session token
      const token = uuidv4();
      
      // Get session expiration time based on platform
      const expiresAt = this.getSessionExpiration(data.platform);
      
      // Create the session
      const session = await this.prisma.session.create({
        data: {
          userId: data.userId,
          token,
          platform: data.platform,
          deviceId: data.deviceId,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          expiresAt,
          isValid: true,
          lastActiveAt: new Date(),
        },
      });
      
      return session;
    } catch (error) {
      this.logger.error(`Failed to create session: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate if a session is valid and not expired
   */
  async validateSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
      });
      
      if (!session) {
        return false;
      }
      
      // Check if the session is valid and not expired
      const isValid = session.isValid && new Date() < session.expiresAt;
      
      return isValid;
    } catch (error) {
      this.logger.error(`Failed to validate session: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Update the last active timestamp of a session
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          lastActiveAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to update session activity: ${error.message}`, error.stack);
    }
  }

  /**
   * Invalidate a session (logout)
   */
  async invalidateSession(sessionId: string): Promise<boolean> {
    try {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          isValid: false,
        },
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to invalidate session: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Invalidate all sessions for a user (force logout from all devices)
   */
  async invalidateAllUserSessions(userId: string): Promise<boolean> {
    try {
      await this.prisma.session.updateMany({
        where: {
          userId,
          isValid: true,
        },
        data: {
          isValid: false,
        },
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to invalidate all user sessions: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserActiveSessions(userId: string): Promise<Session[]> {
    try {
      return await this.prisma.session.findMany({
        where: {
          userId,
          isValid: true,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          lastActiveAt: 'desc',
        },
      });
    } catch (error) {
      this.logger.error(`Failed to get user active sessions: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Clean up expired sessions (can be run as a scheduled task)
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await this.prisma.session.updateMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
          isValid: true,
        },
        data: {
          isValid: false,
        },
      });
      
      return result.count;
    } catch (error) {
      this.logger.error(`Failed to cleanup expired sessions: ${error.message}`, error.stack);
      return 0;
    }
  }

  /**
   * Get session expiration time based on platform
   */
  private getSessionExpiration(platform: PlatformType): Date {
    let expirationHours: number;
    
    switch (platform) {
      case PlatformType.WEB:
        expirationHours = this.configService.get<number>('SESSION_WEB_EXPIRATION_HOURS', 24);
        break;
      case PlatformType.MOBILE_ANDROID:
      case PlatformType.MOBILE_IOS:
        expirationHours = this.configService.get<number>('SESSION_MOBILE_EXPIRATION_HOURS', 720); // 30 days
        break;
      case PlatformType.DESKTOP_WINDOWS:
      case PlatformType.DESKTOP_MAC:
      case PlatformType.DESKTOP_LINUX:
        expirationHours = this.configService.get<number>('SESSION_DESKTOP_EXPIRATION_HOURS', 168); // 7 days
        break;
      default:
        expirationHours = 24; // Default: 24 hours
    }
    
    return new Date(Date.now() + expirationHours * 60 * 60 * 1000);
  }
} 