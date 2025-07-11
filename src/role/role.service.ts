import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all roles
   */
  async findAll(): Promise<Role[]> {
    try {
      return await this.prisma.role.findMany();
    } catch (error) {
      this.logger.error(`Error finding all roles: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get a role by ID
   */
  async findById(id: string): Promise<Role | null> {
    try {
      return await this.prisma.role.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error finding role by ID: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get a role by name
   */
  async findByName(name: string): Promise<Role | null> {
    try {
      return await this.prisma.role.findUnique({
        where: { name },
      });
    } catch (error) {
      this.logger.error(`Error finding role by name: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Create a new role
   */
  async create(data: { name: string; description?: string }): Promise<Role> {
    try {
      // Check if role already exists
      const existingRole = await this.prisma.role.findUnique({
        where: { name: data.name },
      });

      if (existingRole) {
        throw new BadRequestException(`Role with name '${data.name}' already exists`);
      }

      return await this.prisma.role.create({
        data: {
          name: data.name,
          description: data.description,
          isSystem: false,
        },
      });
    } catch (error) {
      this.logger.error(`Error creating role: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update a role
   */
  async update(id: string, data: { name?: string; description?: string }): Promise<Role> {
    try {
      // Check if role exists
      const existingRole = await this.prisma.role.findUnique({
        where: { id },
      });

      if (!existingRole) {
        throw new NotFoundException(`Role with ID '${id}' not found`);
      }

      // Check if role is a system role
      if (existingRole.isSystem) {
        throw new BadRequestException('System roles cannot be modified');
      }

      // Check if new name already exists
      if (data.name && data.name !== existingRole.name) {
        const roleWithSameName = await this.prisma.role.findUnique({
          where: { name: data.name },
        });

        if (roleWithSameName) {
          throw new BadRequestException(`Role with name '${data.name}' already exists`);
        }
      }

      return await this.prisma.role.update({
        where: { id },
        data,
      });
    } catch (error) {
      this.logger.error(`Error updating role: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete a role
   */
  async delete(id: string): Promise<boolean> {
    try {
      // Check if role exists
      const existingRole = await this.prisma.role.findUnique({
        where: { id },
      });

      if (!existingRole) {
        throw new NotFoundException(`Role with ID '${id}' not found`);
      }

      // Check if role is a system role
      if (existingRole.isSystem) {
        throw new BadRequestException('System roles cannot be deleted');
      }

      // Delete the role
      await this.prisma.role.delete({
        where: { id },
      });

      return true;
    } catch (error) {
      this.logger.error(`Error deleting role: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Assign a role to a user
   */
  async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    try {
      // Check if user exists
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException(`User with ID '${userId}' not found`);
      }

      // Check if role exists
      const role = await this.prisma.role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundException(`Role with ID '${roleId}' not found`);
      }

      // Check if user already has this role
      const existingUserRole = await this.prisma.userRole.findFirst({
        where: {
          userId,
          roleId,
        },
      });

      if (existingUserRole) {
        // User already has this role, no need to assign again
        return;
      }

      // Assign role to user
      await this.prisma.userRole.create({
        data: {
          userId,
          roleId,
        },
      });
    } catch (error) {
      this.logger.error(`Error assigning role to user: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Remove a role from a user
   */
  async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
    try {
      // Delete the user-role association
      await this.prisma.userRole.deleteMany({
        where: {
          userId,
          roleId,
        },
      });
    } catch (error) {
      this.logger.error(`Error removing role from user: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all roles for a user
   */
  async getUserRoles(userId: string): Promise<Role[]> {
    try {
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId },
        include: {
          role: true,
        },
      });

      return userRoles.map(ur => ur.role);
    } catch (error) {
      this.logger.error(`Error getting user roles: ${error.message}`, error.stack);
      return [];
    }
  }
} 