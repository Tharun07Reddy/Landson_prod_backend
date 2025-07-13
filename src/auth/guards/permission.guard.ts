import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../../permission/permission.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()]
    );

    // If route is public, allow access
    if (isPublic) {
      return true;
    }
    
    // Get required permissions from metadata
    const requiredPermissions = this.reflector.getAllAndOverride<
      Array<{ resource: string; action: string }>
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    // If no permissions are required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If no user is authenticated, deny access
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    try {
      // Extract the user ID from the JWT payload (could be in user.id or user.sub)
      const userId = user.id || user.sub;
      
      if (!userId) {
        this.logger.error('User ID not found in token payload');
        throw new ForbiddenException('Invalid user authentication');
      }

      // Check if the user has all required permissions
      const hasPermission = await this.permissionService.userHasAllPermissions(
        userId,
        requiredPermissions,
      );

      if (!hasPermission) {
        this.logger.warn(
          `User ${userId} attempted to access a resource without the required permissions: ${JSON.stringify(
            requiredPermissions,
          )}`,
        );
        throw new ForbiddenException('Insufficient permissions');
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      
      this.logger.error(`Error checking permissions: ${error.message}`, error.stack);
      throw new ForbiddenException('Error checking permissions');
    }
  }
} 