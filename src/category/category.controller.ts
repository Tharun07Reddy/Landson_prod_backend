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
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CategoryService } from './category.service';
import { CategoryAttributeService } from './category-attribute.service';
import { CategoryAnalyticsService } from './category-analytics.service';
import { Category, CategoryAttribute, AttributeType } from '@prisma/client';
import { Request } from 'express';

// DTOs would normally be in separate files
class CreateCategoryDto {
  name: string;
  description?: string;
  parentId?: string;
  image?: string;
  isActive?: boolean;
  sortOrder?: number;
  metaTitle?: string;
  metaDescription?: string;
}

class UpdateCategoryDto {
  name?: string;
  description?: string;
  parentId?: string | null;
  image?: string;
  isActive?: boolean;
  sortOrder?: number;
  metaTitle?: string;
  metaDescription?: string;
}

class CreateCategoryAttributeDto {
  name: string;
  type: AttributeType;
  isRequired?: boolean;
  options?: string[];
  defaultValue?: string;
  sortOrder?: number;
}

class UpdateCategoryAttributeDto {
  name?: string;
  type?: AttributeType;
  isRequired?: boolean;
  options?: string[];
  defaultValue?: string;
  sortOrder?: number;
}

class ReorderAttributesDto {
  attributeIds: string[];
}

interface RequestWithUser extends Request {
  user: {
    sub: string;
    username: string;
    email?: string;
    roles: string[];
  };
}

@Controller('categories')
export class CategoryController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly attributeService: CategoryAttributeService,
    private readonly analyticsService: CategoryAnalyticsService,
  ) {}

  // ==================== Category Endpoints ====================

  /**
   * Get all categories (flat structure)
   */
  @Get()
  @Public()
  async findAll(@Query('includeInactive') includeInactive?: string): Promise<Category[]> {
    return this.categoryService.findAll(includeInactive === 'true');
  }

  /**
   * Get all categories as a tree structure
   */
  @Get('tree')
  @Public()
  async findAllAsTree(@Query('includeInactive') includeInactive?: string): Promise<any[]> {
    return this.categoryService.findAllAsTree(includeInactive === 'true');
  }

  /**
   * Get a category by ID
   */
  @Get(':id')
  @Public()
  async findOne(
    @Param('id') id: string,
    @Query('includeChildren') includeChildren?: string,
  ): Promise<any> {
    const category = await this.categoryService.findById(id, includeChildren === 'true');
    
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    
    return category;
  }

  /**
   * Get a category by slug
   */
  @Get('by-slug/:slug')
  @Public()
  async findBySlug(
    @Param('slug') slug: string,
    @Query('includeChildren') includeChildren?: string,
  ): Promise<any> {
    const category = await this.categoryService.findBySlug(slug, includeChildren === 'true');
    
    if (!category) {
      throw new NotFoundException(`Category with slug '${slug}' not found`);
    }
    
    return category;
  }

  /**
   * Create a new category
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'categories', action: 'create' })
  async create(@Body() createCategoryDto: CreateCategoryDto): Promise<Category> {
    return this.categoryService.create(createCategoryDto);
  }

  /**
   * Update a category
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'categories', action: 'update' })
  async update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoryService.update(id, updateCategoryDto);
  }

  /**
   * Delete a category
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'categories', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    const result = await this.categoryService.delete(id);
    
    if (!result) {
      throw new BadRequestException('Failed to delete category');
    }
  }

  /**
   * Get breadcrumb trail for a category
   */
  @Get(':id/breadcrumbs')
  @Public()
  async getBreadcrumbs(@Param('id') id: string): Promise<Category[]> {
    return this.categoryService.getBreadcrumbs(id);
  }

  // ==================== Category Attribute Endpoints ====================

  /**
   * Get all attributes for a category
   */
  @Get(':id/attributes')
  @Public()
  async getCategoryAttributes(@Param('id') categoryId: string): Promise<CategoryAttribute[]> {
    return this.attributeService.findByCategoryId(categoryId);
  }

  /**
   * Create a new category attribute
   */
  @Post(':id/attributes')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'categories', action: 'update' })
  async createAttribute(
    @Param('id') categoryId: string,
    @Body() createAttributeDto: CreateCategoryAttributeDto,
  ): Promise<CategoryAttribute> {
    return this.attributeService.create({
      categoryId,
      ...createAttributeDto,
    });
  }

  /**
   * Update a category attribute
   */
  @Put('attributes/:attributeId')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'categories', action: 'update' })
  async updateAttribute(
    @Param('attributeId') attributeId: string,
    @Body() updateAttributeDto: UpdateCategoryAttributeDto,
  ): Promise<CategoryAttribute> {
    return this.attributeService.update(attributeId, updateAttributeDto);
  }

  /**
   * Delete a category attribute
   */
  @Delete('attributes/:attributeId')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'categories', action: 'update' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAttribute(@Param('attributeId') attributeId: string): Promise<void> {
    const result = await this.attributeService.delete(attributeId);
    
    if (!result) {
      throw new BadRequestException('Failed to delete attribute');
    }
  }

  /**
   * Reorder category attributes
   */
  @Put(':id/attributes/reorder')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'categories', action: 'update' })
  async reorderAttributes(
    @Param('id') categoryId: string,
    @Body() reorderDto: ReorderAttributesDto,
  ): Promise<{ success: boolean }> {
    const result = await this.attributeService.reorder(categoryId, reorderDto.attributeIds);
    return { success: result };
  }

  // ==================== Category Analytics Endpoints ====================

  /**
   * Record a category view
   */
  @Post(':id/view')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordView(
    @Param('id') categoryId: string,
    @Req() req: RequestWithUser,
    @Body() data: { referer?: string },
  ): Promise<void> {
    // Extract user ID if authenticated
    const userId = req.user?.sub;
    
    // Extract session ID from cookies or headers
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
    
    // Extract device info from user agent
    const userAgent = req.headers['user-agent'];
    const deviceInfo = {
      userAgent,
      deviceType: this.detectDeviceType(userAgent as string),
      ip: req.ip,
    };
    
    await this.analyticsService.recordView({
      categoryId,
      userId,
      sessionId: sessionId as string,
      deviceInfo,
      referer: data.referer,
    });
  }

  /**
   * Get analytics for a category
   */
  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'analytics', action: 'read' })
  async getCategoryAnalytics(
    @Param('id') categoryId: string,
    @Query('days') days?: string,
  ): Promise<any> {
    const daysNum = days ? parseInt(days, 10) : 30;
    
    if (isNaN(daysNum) || daysNum <= 0) {
      throw new BadRequestException('Days must be a positive number');
    }
    
    const analytics = await this.analyticsService.getCategoryAnalytics(categoryId, daysNum);
    
    if (!analytics) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }
    
    return analytics;
  }

  /**
   * Get top categories by views
   */
  @Get('analytics/top')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'analytics', action: 'read' })
  async getTopCategories(
    @Query('limit') limit?: string,
    @Query('days') days?: string,
  ): Promise<any[]> {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const daysNum = days ? parseInt(days, 10) : 30;
    
    if (isNaN(limitNum) || limitNum <= 0) {
      throw new BadRequestException('Limit must be a positive number');
    }
    
    if (isNaN(daysNum) || daysNum <= 0) {
      throw new BadRequestException('Days must be a positive number');
    }
    
    return this.analyticsService.getTopCategories(limitNum, daysNum);
  }

  /**
   * Get referrer statistics for a category
   */
  @Get(':id/analytics/referrers')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'analytics', action: 'read' })
  async getReferrerStats(
    @Param('id') categoryId: string,
    @Query('days') days?: string,
  ): Promise<any[]> {
    const daysNum = days ? parseInt(days, 10) : 30;
    
    if (isNaN(daysNum) || daysNum <= 0) {
      throw new BadRequestException('Days must be a positive number');
    }
    
    return this.analyticsService.getReferrerStats(categoryId, daysNum);
  }

  /**
   * Get device type statistics for a category
   */
  @Get(':id/analytics/devices')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'analytics', action: 'read' })
  async getDeviceStats(
    @Param('id') categoryId: string,
    @Query('days') days?: string,
  ): Promise<any[]> {
    const daysNum = days ? parseInt(days, 10) : 30;
    
    if (isNaN(daysNum) || daysNum <= 0) {
      throw new BadRequestException('Days must be a positive number');
    }
    
    return this.analyticsService.getDeviceStats(categoryId, daysNum);
  }

  /**
   * Detect device type from user agent
   * @private
   */
  private detectDeviceType(userAgent: string): string {
    if (!userAgent) {
      return 'unknown';
    }
    
    userAgent = userAgent.toLowerCase();
    
    if (/mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
      return 'mobile';
    } else if (/tablet|ipad/i.test(userAgent)) {
      return 'tablet';
    } else if (/smart-tv|smarttv|googletv|appletv|hbbtv|pov_tv|netcast.tv/i.test(userAgent)) {
      return 'tv';
    } else {
      return 'desktop';
    }
  }
} 