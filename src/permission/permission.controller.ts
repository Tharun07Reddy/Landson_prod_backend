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
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionService } from './permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { Permission } from '@prisma/client';

// DTOs for permission operations
class CreatePermissionDto {
  name: string;
  description?: string;
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

class UpdatePermissionDto {
  name?: string;
  description?: string;
  resource?: string;
  action?: string;
  conditions?: Record<string, any>;
}

@Controller('permissions')
export class PermissionController {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  // Get all permissions
  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'permissions', action: 'list' })
  async findAllPermissions(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('resource') resource?: string,
    @Query('action') action?: string,
    @Query('search') search?: string,
  ): Promise<{ permissions: Permission[]; total: number; page: number; limit: number }> {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter conditions
    const where: any = {};
    
    if (resource) {
      where.resource = resource;
    }
    
    if (action) {
      where.action = action;
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { resource: { contains: search, mode: 'insensitive' } },
        { action: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get permissions with pagination
    const [permissions, total] = await Promise.all([
      this.prisma.permission.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [
          { resource: 'asc' },
          { action: 'asc' },
        ],
      }),
      this.prisma.permission.count({ where }),
    ]);

    return {
      permissions,
      total,
      page: pageNum,
      limit: limitNum,
    };
  }

  // Get permission by ID
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'permissions', action: 'read' })
  async findPermissionById(@Param('id') id: string): Promise<Permission> {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });

    if (!permission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }

    return permission;
  }

  // Create a new permission
  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'permissions', action: 'create' })
  async createPermission(@Body() createPermissionDto: CreatePermissionDto): Promise<Permission> {
    try {
      return await this.permissionService.createPermission(createPermissionDto);
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`Permission with resource '${createPermissionDto.resource}' and action '${createPermissionDto.action}' already exists`);
      }
      throw error;
    }
  }

  // Update a permission
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'permissions', action: 'update' })
  async updatePermission(
    @Param('id') id: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ): Promise<Permission> {
    // Check if permission exists
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });

    if (!permission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }

    try {
      return await this.prisma.permission.update({
        where: { id },
        data: updatePermissionDto,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`Permission with resource '${updatePermissionDto.resource}' and action '${updatePermissionDto.action}' already exists`);
      }
      throw error;
    }
  }

  // Delete a permission
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'permissions', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePermission(@Param('id') id: string): Promise<void> {
    // Check if permission exists
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });

    if (!permission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }

    // Check if permission is used by any roles
    const rolePermCount = await this.prisma.rolePermission.count({
      where: { permissionId: id },
    });

    if (rolePermCount > 0) {
      throw new BadRequestException(`Cannot delete permission that is assigned to ${rolePermCount} roles`);
    }

    await this.prisma.permission.delete({
      where: { id },
    });
  }

  // Get roles that have a specific permission
  @Get(':id/roles')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'permissions', action: 'read' })
  async getRolesWithPermission(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ): Promise<any> {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Check if permission exists
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });

    if (!permission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }

    // Get roles with this permission
    const [rolePerms, total] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { permissionId: id },
        skip,
        take: limitNum,
        include: {
          role: true,
        },
      }),
      this.prisma.rolePermission.count({ where: { permissionId: id } }),
    ]);

    const roles = rolePerms.map(rp => rp.role);

    return {
      roles,
      total,
      page: pageNum,
      limit: limitNum,
    };
  }

  // Get unique resources for permissions
  @Get('metadata/resources')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'permissions', action: 'list' })
  async getUniqueResources(): Promise<string[]> {
    const resources = await this.prisma.permission.groupBy({
      by: ['resource'],
      orderBy: {
        resource: 'asc',
      },
    });

    return resources.map(r => r.resource);
  }

  // Get unique actions for permissions
  @Get('metadata/actions')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'permissions', action: 'list' })
  async getUniqueActions(): Promise<string[]> {
    const actions = await this.prisma.permission.groupBy({
      by: ['action'],
      orderBy: {
        action: 'asc',
      },
    });

    return actions.map(a => a.action);
  }
} 