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
  Req,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { UserService } from './user.service';
import { RoleService } from '../role/role.service';
import { PrismaService } from '../prisma/prisma.service';
import { User, PlatformType } from '@prisma/client';
import { Request } from 'express';
import * as bcrypt from 'bcrypt';
import { PermissionService } from '../permission/permission.service';
import { CacheService } from '../cache/cache.service';

// Define request user interface to match JWT payload
interface RequestWithUser extends Request {
  user: {
    sub: string;
    username: string;
    email?: string;
    roles: string[];
    platform?: PlatformType;
    sessionId?: string;
  };
}

// DTOs would normally be in separate files
class CreateUserDto {
  email?: string;
  phone?: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  roles?: string[];
}

class UpdateUserDto {
  email?: string;
  phone?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  profileImageUrl?: string;
  preferredLanguage?: string;
}

class UpdatePasswordDto {
  currentPassword: string;
  newPassword: string;
}

class AssignRoleDto {
  roleId: string;
}

// Add these DTOs after existing DTOs
class UserActivityQueryDto {
  page?: string;
  limit?: string;
  action?: string;
  resource?: string;
  startDate?: string;
  endDate?: string;
}

class UserSessionsQueryDto {
  page?: string;
  limit?: string;
  includeInvalid?: string;
  platform?: PlatformType;
}

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly roleService: RoleService,
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly cacheService: CacheService,
  ) {}

  // Get current user profile
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: RequestWithUser): Promise<any> {
    const userId = req.user.sub;
    const user = await this.userService.findById(userId);
    
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    // Get user roles
    const roles = await this.roleService.getUserRoles(userId);
    
    return {
      ...user,
      roles: roles.map(role => ({
        id: role.id,
        name: role.name,
        description: role.description,
      })),
    };
  }

  // Update current user profile
  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Req() req: RequestWithUser,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<Partial<User>> {
    const userId = req.user.sub;
    
    // Remove fields that shouldn't be updated directly by the user
    const { isActive, isEmailVerified, isPhoneVerified, email, phone, username, ...safeUpdateData } = updateUserDto;
    
    const updatedUser = await this.userService.updateProfile(userId, safeUpdateData);
    
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }
    
    return updatedUser;
  }

  // Change current user password
  @Put('profile/password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Req() req: RequestWithUser,
    @Body() updatePasswordDto: UpdatePasswordDto,
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user.sub;
    
    // Get user with password
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    
    if (!user || !user.password) {
      throw new NotFoundException('User not found');
    }
    
    // Verify current password
    const isPasswordValid = await bcrypt.compare(updatePasswordDto.currentPassword, user.password);
    
    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }
    
    // Update password
    const success = await this.userService.updatePassword(userId, updatePasswordDto.newPassword);
    
    return {
      success,
      message: success ? 'Password updated successfully' : 'Failed to update password',
    };
  }

  // Get current user permissions
  @Get('permissions')
  @UseGuards(JwtAuthGuard)
  async getUserPermissions(@Req() req: RequestWithUser): Promise<any> {
    const userId = req.user.sub;
    const cacheKey = `user:${userId}:permissions`;
    
    // Try to get permissions from cache first
    const cachedPermissions = await this.cacheService.get(cacheKey);
    
    if (cachedPermissions) {
      return {
        permissions: cachedPermissions,
        source: 'cache'
      };
    }
    
    // If not in cache, fetch from database
    const permissions = await this.permissionService.getUserPermissions(userId);
    
    // Store in cache for future requests (1 hour TTL)
    await this.cacheService.set(cacheKey, permissions, 3600);
    
    return {
      permissions,
      source: 'database'
    };
  }
  
  // Update permissions in cache
  @Post('permissions/refresh')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'permissions', action: 'update' })
  async refreshPermissions(@Req() req: RequestWithUser): Promise<any> {
    const userId = req.user.sub;
    
    // Update permissions in cache
    const success = await this.permissionService.updateUserPermissionsCache(userId);
    
    return {
      success,
      message: success ? 'Permissions cache refreshed successfully' : 'Failed to refresh permissions cache'
    };
  }

  // Get user activity logs
  @Get('activity/:userId')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'users', action: 'view' })
  async getUserActivity(
    @Param('userId') userId: string,
    @Query() query: UserActivityQueryDto,
  ): Promise<any> {
    // Parse query parameters
    const options = {
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 10,
      action: query.action,
      resource: query.resource,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    };
    
    const result = await this.userService.getUserActivity(userId, options);
    
    return {
      ...result,
      logs: result.logs.map(log => ({
        ...log,
        // Format dates for better readability
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  // Get user sessions
  @Get('sessions/:userId')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'users', action: 'view' })
  async getUserSessions(
    @Param('userId') userId: string,
    @Query() query: UserSessionsQueryDto,
  ): Promise<any> {
    // Parse query parameters
    const options = {
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 10,
      includeInvalid: query.includeInvalid === 'true',
      platform: query.platform,
    };
    
    const result = await this.userService.getUserSessions(userId, options);
    
    return {
      ...result,
      sessions: result.sessions.map(session => ({
        ...session,
        // Format dates for better readability
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        lastActiveAt: session.lastActiveAt.toISOString(),
      })),
    };
  }

  // Get detailed user permissions
  @Get('permissions/detailed/:userId')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'users', action: 'view' })
  async getDetailedUserPermissions(
    @Param('userId') userId: string
  ): Promise<any> {
    const cacheKey = `user:${userId}:detailed_permissions`;
    
    // Try to get detailed permissions from cache first
    const cachedPermissions = await this.cacheService.get(cacheKey);
    
    if (cachedPermissions) {
      return {
        permissions: cachedPermissions,
        source: 'cache'
      };
    }
    
    // If not in cache, fetch from database
    const roles = await this.roleService.getUserRoles(userId);
    
    // Get permissions for each role
    const permissionsByRole = await Promise.all(
      roles.map(async (role) => {
        // Get role permissions from database directly
        const rolePermissions = await this.prisma.rolePermission.findMany({
          where: { roleId: role.id },
          include: { permission: true },
        });
        
        return {
          roleId: role.id,
          roleName: role.name,
          permissions: rolePermissions.map(rp => ({
            id: rp.permission.id,
            name: rp.permission.name,
            resource: rp.permission.resource,
            action: rp.permission.action,
            description: rp.permission.description,
          })),
        };
      })
    );
    
    // Store in cache for future requests (1 hour TTL)
    await this.cacheService.set(cacheKey, permissionsByRole, 3600);
    
    return {
      permissions: permissionsByRole,
      source: 'database'
    };
  }

  // Get all users (admin only)
  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'users', action: 'list' })
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
    @Query('sortBy') sortBy = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
    @Query('isActive') isActive?: string,
  ): Promise<{ users: Partial<User>[]; total: number; page: number; limit: number }> {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;
    
    // Build filter conditions
    const where: any = {};
    
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }
    
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }
    
    // Get users with pagination
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          email: true,
          phone: true,
          username: true,
          firstName: true,
          lastName: true,
          isActive: true,
          isEmailVerified: true,
          isPhoneVerified: true,
          lastLoginAt: true,
          profileImageUrl: true,
          preferredLanguage: true,
          platform: true,
          createdAt: true,
          updatedAt: true,
          userRoles: {
            select: {
              role: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    
    // Transform the users to include roles
    const transformedUsers = users.map(user => {
      const { userRoles, ...userData } = user;
      return {
        ...userData,
        roles: userRoles.map(ur => ({
          id: ur.role.id,
          name: ur.role.name,
          description: ur.role.description,
        })),
      };
    });
    return {
      users: transformedUsers,
      total,
      page: pageNum,
      limit: limitNum,
    };
  }

  // Get user by ID
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'users', action: 'read' })
  async findOne(@Param('id') id: string, @Req() req: RequestWithUser): Promise<any> {
    // Check if user is requesting their own profile or has admin access
    const isOwnProfile = req.user.sub === id;
    const isAdmin = req.user.roles?.includes('admin');
    
    if (!isOwnProfile && !isAdmin) {
      throw new ForbiddenException('You do not have permission to view this user');
    }
    
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        username: true,
        firstName: true,
        lastName: true,
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        lastLoginAt: true,
        profileImageUrl: true,
        preferredLanguage: true,
        platform: true,
        createdAt: true,
        updatedAt: true,
        userRoles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        },
      },
    });
    
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    // Transform user to include roles
    const { userRoles, ...userData } = user;
    return {
      ...userData,
      roles: userRoles.map(ur => ({
        id: ur.role.id,
        name: ur.role.name,
        description: ur.role.description,
      })),
    };
  }

  // Create a new user (admin only)
  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'users', action: 'create' })
  async create(@Body() createUserDto: CreateUserDto): Promise<Partial<User>> {
    // Validate required fields
    if (!createUserDto.email && !createUserDto.phone) {
      throw new BadRequestException('Either email or phone number is required');
    }
    
    // Check if user already exists
    if (createUserDto.email) {
      const existingEmail = await this.userService.findByEmail(createUserDto.email);
      if (existingEmail) {
        throw new BadRequestException('Email already in use');
      }
    }
    
    if (createUserDto.phone) {
      const existingPhone = await this.userService.findByPhone(createUserDto.phone);
      if (existingPhone) {
        throw new BadRequestException('Phone number already in use');
      }
    }
    
    if (createUserDto.username) {
      const existingUsername = await this.userService.findByUsername(createUserDto.username);
      if (existingUsername) {
        throw new BadRequestException('Username already in use');
      }
    }
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    
    // Create the user
    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        phone: createUserDto.phone,
        username: createUserDto.username,
        password: hashedPassword,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        isActive: createUserDto.isActive ?? true,
        isEmailVerified: createUserDto.isEmailVerified ?? false,
        isPhoneVerified: createUserDto.isPhoneVerified ?? false,
        platform: PlatformType.WEB,
      },
    });
    
    // Assign roles if provided
    if (createUserDto.roles && createUserDto.roles.length > 0) {
      for (const roleName of createUserDto.roles) {
        const role = await this.prisma.role.findUnique({
          where: { name: roleName },
        });
        
        if (role) {
          await this.roleService.assignRoleToUser(user.id, role.id);
        }
      }
    } else {
      // Assign default user role if no roles specified
      const defaultRole = await this.prisma.role.findUnique({
        where: { name: 'user' },
      });
      
      if (defaultRole) {
        await this.roleService.assignRoleToUser(user.id, defaultRole.id);
      }
    }
    
    // Return user without password
    const { password, ...result } = user;
    return result;
  }

  // Update a user (admin only)
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'users', action: 'update' })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<Partial<User>> {
    // Check if user exists
    const existingUser = await this.userService.findById(id);
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }
    
    // Update user
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    });
    
    // Return user without password
    const { password, ...result } = updatedUser;
    return result;
  }

  // Delete a user (admin only)
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'users', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    // Check if user exists
    const existingUser = await this.userService.findById(id);
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }
    
    // Soft delete - mark as inactive
    await this.userService.deactivateAccount(id);
  }

  // Assign a role to a user
  @Post(':id/roles')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'roles', action: 'assign' })
  async assignRole(
    @Param('id') id: string,
    @Body() assignRoleDto: AssignRoleDto,
  ): Promise<{ success: boolean; message: string }> {
    // Check if user exists
    const existingUser = await this.userService.findById(id);
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }
    
    await this.roleService.assignRoleToUser(id, assignRoleDto.roleId);
    
    return {
      success: true,
      message: 'Role assigned successfully',
    };
  }

  // Remove a role from a user
  @Delete(':id/roles/:roleId')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'roles', action: 'assign' })
  @HttpCode(HttpStatus.OK)
  async removeRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Check if user exists
    const existingUser = await this.userService.findById(id);
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }
    
    await this.roleService.removeRoleFromUser(id, roleId);
    
    return {
      success: true,
      message: 'Role removed successfully',
    };
  }
} 