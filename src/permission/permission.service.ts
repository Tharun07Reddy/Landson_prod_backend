import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Permission } from '@prisma/client';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);
  private permissionCache: Map<string, boolean> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Check if a user has a specific permission
   */
  async userHasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    const cacheKey = `${userId}:${resource}:${action}`;
    
    // Check cache first for performance
    if (this.permissionCache.has(cacheKey)) {
      return this.permissionCache.get(cacheKey)!;
    }

    try {
      // Get user with roles
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePerms: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check if user has the permission through any of their roles
      const hasPermission = user.userRoles.some(userRole => 
        userRole.role.rolePerms.some(rolePerm => {
          const permission = rolePerm.permission;
          
          // Check for exact permission match
          const exactMatch = permission.resource === resource && permission.action === action;
          
          // Check for manage permission (which grants access to all actions on the resource)
          const manageMatch = permission.resource === resource && permission.action === 'manage';
          
          return exactMatch || manageMatch;
        })
      );

      // Cache the result for 5 minutes
      this.permissionCache.set(cacheKey, hasPermission);
      setTimeout(() => {
        this.permissionCache.delete(cacheKey);
      }, 5 * 60 * 1000);

      return hasPermission;
    } catch (error) {
      this.logger.error(`Error checking permission: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePerms: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Extract unique permissions from all roles
      const permissionMap = new Map<string, Permission>();
      
      user.userRoles.forEach(userRole => {
        userRole.role.rolePerms.forEach(rolePerm => {
          const permission = rolePerm.permission;
          permissionMap.set(permission.id, permission);
        });
      });

      return Array.from(permissionMap.values());
    } catch (error) {
      this.logger.error(`Error getting user permissions: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Check if a user has any of the specified permissions
   */
  async userHasAnyPermission(userId: string, permissions: Array<{ resource: string; action: string }>): Promise<boolean> {
    for (const { resource, action } of permissions) {
      const hasPermission = await this.userHasPermission(userId, resource, action);
      if (hasPermission) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a user has all of the specified permissions
   */
  async userHasAllPermissions(userId: string, permissions: Array<{ resource: string; action: string }>): Promise<boolean> {
    for (const { resource, action } of permissions) {
      const hasPermission = await this.userHasPermission(userId, resource, action);
      if (!hasPermission) {
        return false;
      }
    }
    return true;
  }

  /**
   * Create a new permission
   */
  async createPermission(data: {
    name: string;
    description?: string;
    resource: string;
    action: string;
    conditions?: Record<string, any>;
  }): Promise<Permission> {
    try {
      return await this.prisma.permission.create({
        data: {
          name: data.name,
          description: data.description,
          resource: data.resource,
          action: data.action,
          conditions: data.conditions as any,
        },
      });
    } catch (error) {
      this.logger.error(`Error creating permission: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Assign a permission to a role
   */
  async assignPermissionToRole(roleId: string, permissionId: string): Promise<void> {
    try {
      // Check if the role exists
      const role = await this.prisma.role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      // Check if the permission exists
      const permission = await this.prisma.permission.findUnique({
        where: { id: permissionId },
      });

      if (!permission) {
        throw new NotFoundException('Permission not found');
      }

      // Check if the role already has this permission
      const existingRolePermission = await this.prisma.rolePermission.findFirst({
        where: {
          roleId,
          permissionId,
        },
      });

      if (!existingRolePermission) {
        // Create the role-permission association
        await this.prisma.rolePermission.create({
          data: {
            roleId,
            permissionId,
          },
        });
      }

      // Clear any cached permissions that might be affected
      this.clearPermissionCache();
    } catch (error) {
      this.logger.error(`Error assigning permission to role: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Remove a permission from a role
   */
  async removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
    try {
      // Delete the role-permission association
      await this.prisma.rolePermission.deleteMany({
        where: {
          roleId,
          permissionId,
        },
      });

      // Clear any cached permissions that might be affected
      this.clearPermissionCache();
    } catch (error) {
      this.logger.error(`Error removing permission from role: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update user permissions in cache
   */
  async updateUserPermissionsCache(userId: string): Promise<boolean> {
    try {
      // Get fresh permissions from database
      const permissions = await this.getUserPermissions(userId);
      
      // Update cache
      const cacheKey = `user:${userId}:permissions`;
      await this.cacheService.set(cacheKey, permissions);
      
      // Also clear the local permission check cache
      this.clearUserPermissionCache(userId);
      
      return true;
    } catch (error) {
      this.logger.error(`Error updating user permissions cache: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Clear the permission cache for a specific user
   */
  private clearUserPermissionCache(userId: string): void {
    // Clear all cache entries for this user
    Array.from(this.permissionCache.keys())
      .filter(key => key.startsWith(`${userId}:`))
      .forEach(key => this.permissionCache.delete(key));
  }

  /**
   * Clear the permission cache
   */
  private clearPermissionCache(): void {
    this.permissionCache.clear();
  }
} 