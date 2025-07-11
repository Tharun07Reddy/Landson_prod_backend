import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query, 
  NotFoundException,
  BadRequestException,
  ParseIntPipe,
  DefaultValuePipe,
  Req
} from '@nestjs/common';
import { FeatureFlagService } from './feature-flag.service';
import { PlatformType } from '@prisma/client';
import { Request } from 'express';

interface CreateFeatureFlagDto {
  name: string;
  description?: string;
  isEnabled: boolean;
  environment?: string;
  platform?: PlatformType;
}

interface UpdateFeatureFlagDto {
  description?: string;
  isEnabled?: boolean;
  environment?: string;
  platform?: PlatformType;
}

@Controller('features')
export class FeatureFlagController {
  constructor(private readonly featureFlagService: FeatureFlagService) {}

  /**
   * Get all feature flags with filtering and pagination
   */
  @Get()
  async findAll(
    @Query('name') name?: string,
    @Query('isEnabled') isEnabled?: boolean,
    @Query('environment') environment?: string,
    @Query('platform') platform?: PlatformType,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize = 20,
  ) {
    return this.featureFlagService.findAll({
      name,
      isEnabled,
      environment,
      platform,
      page,
      pageSize,
    });
  }

  /**
   * Check if a feature is enabled for the current platform
   */
  @Get('check/:name')
  async isEnabled(
    @Param('name') name: string,
    @Query('platform') platformQuery?: PlatformType,
    @Query('default') defaultValue = false,
    @Req() req?: Request
  ) {
    // Use platform from query, request object, or null
    const platform = platformQuery || (req as any).platform || null;
    
    const isEnabled = await this.featureFlagService.isEnabled(
      name, 
      platform, 
      defaultValue
    );
    
    return { 
      name, 
      isEnabled,
      platform: platform || 'all',
      environment: process.env.NODE_ENV || 'default'
    };
  }

  /**
   * Get all feature flags for a specific platform
   */
  @Get('platform/:platform')
  async getByPlatform(
    @Param('platform') platform: PlatformType,
    @Query('environment') environment?: string
  ) {
    return this.featureFlagService.findAll({
      platform,
      environment: environment || process.env.NODE_ENV || undefined,
    });
  }

  /**
   * Get a feature flag by ID
   */
  @Get(':id')
  async findById(@Param('id') id: string) {
    const featureFlag = await this.featureFlagService.findById(id);
    if (!featureFlag) {
      throw new NotFoundException(`Feature flag with ID ${id} not found`);
    }
    return featureFlag;
  }

  /**
   * Create a new feature flag
   */
  @Post()
  async create(@Body() createDto: CreateFeatureFlagDto) {
    try {
      // Check if feature flag with same name, platform, and environment already exists
      const existing = await this.featureFlagService.findByName(
        createDto.name,
        createDto.platform || null,
        createDto.environment || process.env.NODE_ENV || null
      );
      
      if (existing) {
        throw new BadRequestException(
          `Feature flag with name ${createDto.name} already exists for this platform and environment`
        );
      }
      
      return await this.featureFlagService.create(createDto);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Update a feature flag
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateFeatureFlagDto
  ) {
    try {
      const featureFlag = await this.featureFlagService.update(id, updateDto);
      if (!featureFlag) {
        throw new NotFoundException(`Feature flag with ID ${id} not found`);
      }
      return featureFlag;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Toggle a feature flag
   */
  @Put(':id/toggle')
  async toggle(@Param('id') id: string) {
    try {
      const featureFlag = await this.featureFlagService.toggle(id);
      return {
        ...featureFlag,
        message: `Feature flag ${featureFlag.name} has been ${featureFlag.isEnabled ? 'enabled' : 'disabled'}`
      };
    } catch (error) {
      throw new NotFoundException(`Feature flag with ID ${id} not found`);
    }
  }

  /**
   * Delete a feature flag
   */
  @Delete(':id')
  async delete(@Param('id') id: string) {
    const deleted = await this.featureFlagService.delete(id);
    if (!deleted) {
      throw new NotFoundException(`Feature flag with ID ${id} not found`);
    }
    return {
      success: true,
      message: `Feature flag with ID ${id} has been deleted`
    };
  }

  /**
   * Clear feature flag cache
   */
  @Post('cache/clear')
  async clearCache() {
    this.featureFlagService.clearCache();
    return {
      success: true,
      message: 'Feature flag cache has been cleared'
    };
  }
} 