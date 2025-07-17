import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, PlatformType, AuditLog, Session } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a user by ID
   */
  async findById(id: string): Promise<Partial<User> | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        return null;
      }

      // Remove sensitive data
      const { password, ...result } = user;
      return result;
    } catch (error) {
      this.logger.error(`Error finding user by ID: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Find a user by email
   */
  async findByEmail(email: string): Promise<Partial<User> | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return null;
      }

      // Remove sensitive data
      const { password, ...result } = user;
      return result;
    } catch (error) {
      this.logger.error(`Error finding user by email: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Find a user by phone number
   */
  async findByPhone(phone: string): Promise<Partial<User> | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { phone },
      });

      if (!user) {
        return null;
      }

      // Remove sensitive data
      const { password, ...result } = user;
      return result;
    } catch (error) {
      this.logger.error(`Error finding user by phone: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Find a user by username
   */
  async findByUsername(username: string): Promise<Partial<User> | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { username },
      });

      if (!user) {
        return null;
      }

      // Remove sensitive data
      const { password, ...result } = user;
      return result;
    } catch (error) {
      this.logger.error(`Error finding user by username: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Update a user's last login time
   */
  async updateLastLogin(userId: string, platform: PlatformType): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lastLoginAt: new Date(),
          platform,
        },
      });
    } catch (error) {
      this.logger.error(`Error updating last login: ${error.message}`, error.stack);
    }
  }

  /**
   * Update a user's password
   */
  async updatePassword(userId: string, newPassword: string): Promise<boolean> {
    try {
      // Check if user exists
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update the password
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
        },
      });

      return true;
    } catch (error) {
      this.logger.error(`Error updating password: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Update a user's profile
   */
  async updateProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      profileImageUrl?: string;
      preferredLanguage?: string;
    },
  ): Promise<Partial<User> | null> {
    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data,
      });

      // Remove sensitive data
      const { password, ...result } = updatedUser;
      return result;
    } catch (error) {
      this.logger.error(`Error updating profile: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Deactivate a user account
   */
  async deactivateAccount(userId: string): Promise<boolean> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          deletedAt: new Date(),
        },
      });

      return true;
    } catch (error) {
      this.logger.error(`Error deactivating account: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Reactivate a user account
   */
  async reactivateAccount(userId: string): Promise<boolean> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isActive: true,
          deletedAt: null,
        },
      });

      return true;
    } catch (error) {
      this.logger.error(`Error reactivating account: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Get user activity logs
   */
  async getUserActivity(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      action?: string;
      resource?: string;
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<{ logs: AuditLog[]; total: number; page: number; limit: number }> {
    try {
      const {
        page = 1,
        limit = 10,
        action,
        resource,
        startDate,
        endDate,
      } = options;

      const skip = (page - 1) * limit;

      // Build where conditions
      const where: any = { userId };
      
      if (action) {
        where.action = action;
      }
      
      if (resource) {
        where.resource = resource;
      }
      
      if (startDate || endDate) {
        where.createdAt = {};
        
        if (startDate) {
          where.createdAt.gte = startDate;
        }
        
        if (endDate) {
          where.createdAt.lte = endDate;
        }
      }

      // Get logs with pagination
      const [logs, total] = await Promise.all([
        this.prisma.auditLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.auditLog.count({ where }),
      ]);

      return {
        logs,
        total,
        page,
        limit,
      };
    } catch (error) {
      this.logger.error(`Error getting user activity: ${error.message}`, error.stack);
      return {
        logs: [],
        total: 0,
        page: options.page || 1,
        limit: options.limit || 10,
      };
    }
  }

  /**
   * Get user sessions
   */
  async getUserSessions(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      includeInvalid?: boolean;
      platform?: PlatformType;
    } = {},
  ): Promise<{ sessions: Session[]; total: number; page: number; limit: number }> {
    try {
      const {
        page = 1,
        limit = 10,
        includeInvalid = false,
        platform,
      } = options;

      const skip = (page - 1) * limit;

      // Build where conditions
      const where: any = { userId };
      
      if (!includeInvalid) {
        where.isValid = true;
        where.expiresAt = { gt: new Date() };
      }
      
      if (platform) {
        where.platform = platform;
      }

      // Get sessions with pagination
      const [sessions, total] = await Promise.all([
        this.prisma.session.findMany({
          where,
          skip,
          take: limit,
          orderBy: { lastActiveAt: 'desc' },
        }),
        this.prisma.session.count({ where }),
      ]);

      return {
        sessions,
        total,
        page,
        limit,
      };
    } catch (error) {
      this.logger.error(`Error getting user sessions: ${error.message}`, error.stack);
      return {
        sessions: [],
        total: 0,
        page: options.page || 1,
        limit: options.limit || 10,
      };
    }
  }
} 