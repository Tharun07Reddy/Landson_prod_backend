import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { RoleService } from './role.service';
import { PermissionService } from '../permission/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

// DTOs for role operations
class CreateRoleDto {
  name: string;
  description?: string;
  permissions?: string[]; // Array of permission IDs
}

class UpdateRoleDto {
  name?: string;
  description?: string;
}

class AssignPermissionDto {
  permissionIds: string[]; // Array of permission IDs to assign
}

@Controller('roles')
export class RoleController {
  constructor(
    private readonly roleService: RoleService,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  // ==================== ROLE ENDPOINTS ====================

  // Get all roles
  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'roles', action: 'list' })
  async findAllRoles(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search?: string,
  ): Promise<{ roles: Role[]; total: number; page: number; limit: number }> {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter conditions
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get roles with pagination
    const [roles, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { name: 'asc' },
        include: {
          rolePerms: {
            include: {
              permission: true,
            },
          },
        },
      }),
      this.prisma.role.count({ where }),
    ]);

    // Transform roles to include permissions
    const transformedRoles = roles.map(role => {
      const { rolePerms, ...roleData } = role;
      return {
        ...roleData,
        permissions: rolePerms.map(rp => ({
          id: rp.permission.id,
          name: rp.permission.name,
          resource: rp.permission.resource,
          action: rp.permission.action,
          description: rp.permission.description,
        })),
      };
    });

    return {
      roles: transformedRoles,
      total,
      page: pageNum,
      limit: limitNum,
    };
  }

  // Get role by ID
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'roles', action: 'read' })
  async findRoleById(@Param('id') id: string): Promise<any> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        rolePerms: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    // Transform role to include permissions
    const { rolePerms, ...roleData } = role;
    return {
      ...roleData,
      permissions: rolePerms.map(rp => ({
        id: rp.permission.id,
        name: rp.permission.name,
        resource: rp.permission.resource,
        action: rp.permission.action,
        description: rp.permission.description,
      })),
    };
  }

  // Create a new role
  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'roles', action: 'create' })
  async createRole(@Body() createRoleDto: CreateRoleDto): Promise<Role> {
    try {
      // Create the role
      const role = await this.roleService.create({
        name: createRoleDto.name,
        description: createRoleDto.description,
      });

      // Assign permissions if provided
      if (createRoleDto.permissions && createRoleDto.permissions.length > 0) {
        for (const permissionId of createRoleDto.permissions) {
          await this.permissionService.assignPermissionToRole(role.id, permissionId);
        }
      }

      return role;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`Role with name '${createRoleDto.name}' already exists`);
      }
      throw error;
    }
  }

  // Update a role
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'roles', action: 'update' })
  async updateRole(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
  ): Promise<Role> {
    try {
      return await this.roleService.update(id, updateRoleDto);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(`Role with name '${updateRoleDto.name}' already exists`);
      }
      throw error;
    }
  }

  // Delete a role
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'roles', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRole(@Param('id') id: string): Promise<void> {
    try {
      await this.roleService.delete(id);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to delete role');
    }
  }

  // Assign permissions to a role
  @Post(':id/permissions')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'roles', action: 'update' })
  async assignPermissionsToRole(
    @Param('id') id: string,
    @Body() assignPermissionDto: AssignPermissionDto,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Check if role exists
      const role = await this.roleService.findById(id);
      if (!role) {
        throw new NotFoundException(`Role with ID ${id} not found`);
      }

      // Check if role is a system role
      if (role.isSystem) {
        throw new BadRequestException('System roles cannot be modified');
      }

      // Assign each permission
      for (const permissionId of assignPermissionDto.permissionIds) {
        await this.permissionService.assignPermissionToRole(id, permissionId);
      }

      return {
        success: true,
        message: 'Permissions assigned successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to assign permissions');
    }
  }

  // Remove a permission from a role
  @Delete(':id/permissions/:permissionId')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'roles', action: 'update' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async removePermissionFromRole(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
  ): Promise<void> {
    try {
      // Check if role exists
      const role = await this.roleService.findById(id);
      if (!role) {
        throw new NotFoundException(`Role with ID ${id} not found`);
      }

      // Check if role is a system role
      if (role.isSystem) {
        throw new BadRequestException('System roles cannot be modified');
      }

      await this.permissionService.removePermissionFromRole(id, permissionId);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to remove permission from role');
    }
  }

  // Get users with a specific role
  @Get(':id/users')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'roles', action: 'read' })
  async getUsersWithRole(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ): Promise<any> {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Check if role exists
    const role = await this.roleService.findById(id);
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    // Get users with this role
    const [userRoles, total] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { roleId: id },
        skip,
        take: limitNum,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              username: true,
              firstName: true,
              lastName: true,
              isActive: true,
              profileImageUrl: true,
              lastLoginAt: true,
            },
          },
        },
      }),
      this.prisma.userRole.count({ where: { roleId: id } }),
    ]);

    const users = userRoles.map(ur => ur.user);

    return {
      users,
      total,
      page: pageNum,
      limit: limitNum,
    };
  }
} 