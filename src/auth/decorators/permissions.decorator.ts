import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to specify required permissions for a route or controller
 * @param permissions Array of resource-action pairs representing required permissions
 * @returns Decorator function
 * 
 * @example
 * // Require a single permission
 * @RequirePermissions({ resource: 'users', action: 'read' })
 * 
 * @example
 * // Require multiple permissions (all are required)
 * @RequirePermissions(
 *   { resource: 'users', action: 'read' },
 *   { resource: 'users', action: 'update' }
 * )
 * 
 * @example
 * // The 'manage' action automatically grants all permissions for a resource
 * // A user with 'users:manage' permission will have access to all user operations
 * @RequirePermissions({ resource: 'users', action: 'update' })
 */
export const RequirePermissions = (...permissions: Array<{ resource: string; action: string }>) =>
  SetMetadata(PERMISSIONS_KEY, permissions); 