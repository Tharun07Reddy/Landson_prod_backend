import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, PlatformType } from '@prisma/client';
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
} 