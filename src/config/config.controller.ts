import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Delete, 
  Query, 
  Put,
  ParseIntPipe,
  DefaultValuePipe,
  NotFoundException,
  BadRequestException,
  Req
} from '@nestjs/common';
import { ConfigService } from './config.service';
import { PlatformType, ValueType } from '@prisma/client';
import { Request } from 'express';

interface SetConfigDto {
  value: any;
  ttlSeconds?: number;
}

interface CreateConfigKeyDto {
  key: string;
  description?: string;
  categoryId: string;
  isSecret?: boolean;
  defaultValue?: string;
  valueType?: ValueType;
}

interface UpdateConfigKeyDto {
  key?: string;
  description?: string;
  categoryId?: string;
  isSecret?: boolean;
  defaultValue?: string;
  valueType?: ValueType;
}

interface ConfigValueDto {
  value: string;
  environment?: string;
  platform?: PlatformType;
  isActive?: boolean;
}

interface ConfigContext {
  environment?: string;
  platform?: PlatformType;
  userId?: string;
}

@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  async getAllConfigs(
    @Query('category') category?: string,
    @Query('platform') platformQuery?: PlatformType,
    @Req() req?: Request
  ) {
    // Use platform from query, request object, or null
    const platform = platformQuery || (req as any).platform || null;
    
    const context: ConfigContext = {
      environment: process.env.NODE_ENV || undefined,
      platform
    };
    
    if (category) {
      return this.configService.getByCategory(category, context);
    }
    
    // For security, we don't return all configs by default
    // Instead, return available categories
    const categories = await this.getCategories();
    return { 
      categories,
      platform: platform || 'not specified',
      environment: context.environment || 'not specified'
    };
  }

  @Get('categories')
  async getCategories() {
    return this.configService.getCategories();
  }

  @Get('overrides')
  getOverrides() {
    return {
      overrides: this.configService.getOverrides()
    };
  }

  @Get('platform')
  getCurrentPlatform(@Req() req: Request) {
    return {
      detectedPlatform: (req as any).platform || null,
      currentPlatform: this.configService.getPlatform()
    };
  }

  @Get(':key')
  async getConfig(
    @Param('key') key: string,
    @Query('platform') platformQuery?: PlatformType,
    @Req() req?: Request
  ) {
    // Use platform from query, request object, or null
    const platform = platformQuery || (req as any).platform || null;

    const context: ConfigContext = {
      environment: process.env.NODE_ENV || undefined,
      platform
    };

    const value = await this.configService.get(key, undefined, true, context);
    return { 
      key, 
      value,
      platform: platform || 'not specified',
      environment: context.environment || 'not specified'
    };
  }

  @Post('override/:key')
  async setOverride(
    @Param('key') key: string,
    @Body() dto: SetConfigDto,
  ) {
    this.configService.setTemporary(key, dto.value, dto.ttlSeconds);
    return { 
      key, 
      value: dto.value,
      temporary: true,
      ttlSeconds: dto.ttlSeconds,
      message: `Runtime override set for ${key}`
    };
  }

  @Delete('override/:key')
  async removeOverride(@Param('key') key: string) {
    const removed = this.configService.removeTemporary(key);
    return { 
      key,
      removed,
      message: removed ? `Runtime override removed for ${key}` : `No override found for ${key}`
    };
  }

  @Post('reload')
  async reloadConfigurations() {
    await this.configService.reloadConfigurations();
    return { message: 'Configurations reloaded successfully' };
  }

  /**
   * Get all configuration keys with pagination and filtering
   */
  @Get('keys')
  async getAllConfigKeys(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('isSecret') isSecret?: boolean,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize = 20,
    @Query('includeValues', new DefaultValuePipe(false)) includeValues = false,
  ) {
    const result = await this.configService.findAllConfigKeys({
      search,
      categoryId,
      isSecret,
      page,
      pageSize,
      includeValues,
    });
    
    return result;
  }

  /**
   * Get a configuration key by ID
   */
  @Get('keys/:id')
  async getConfigKeyById(
    @Param('id') id: string,
    @Query('includeValues', new DefaultValuePipe(false)) includeValues = false,
  ) {
    const configKey = await this.configService.findConfigKeyById(id, includeValues);
    if (!configKey) {
      throw new NotFoundException(`Configuration key with ID ${id} not found`);
    }
    return configKey;
  }

  /**
   * Get a configuration key by key name
   */
  @Get('keys/by-key/:key')
  async getConfigKeyByKey(
    @Param('key') key: string,
    @Query('includeValues', new DefaultValuePipe(false)) includeValues = false,
  ) {
    const configKey = await this.configService.findConfigKeyByKey(key, includeValues);
    if (!configKey) {
      throw new NotFoundException(`Configuration key with key ${key} not found`);
    }
    return configKey;
  }

  /**
   * Get all configuration keys by category
   */
  @Get('keys/by-category/:categoryId')
  async getConfigKeysByCategory(
    @Param('categoryId') categoryId: string,
    @Query('includeValues', new DefaultValuePipe(false)) includeValues = false,
  ) {
    return this.configService.findConfigKeysByCategory(categoryId, includeValues);
  }

  /**
   * Create a new configuration key
   */
  @Post('keys')
  async createConfigKey(@Body() createDto: CreateConfigKeyDto) {
    try {
      return await this.configService.createConfigKey(createDto);
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`Configuration key with key ${createDto.key} already exists`);
      }
      throw error;
    }
  }

  /**
   * Update a configuration key
   */
  @Put('keys/:id')
  async updateConfigKey(
    @Param('id') id: string,
    @Body() updateDto: UpdateConfigKeyDto,
  ) {
    try {
      const configKey = await this.configService.updateConfigKey(id, updateDto);
      if (!configKey) {
        throw new NotFoundException(`Configuration key with ID ${id} not found`);
      }
      return configKey;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`Configuration key with key ${updateDto.key} already exists`);
      }
      throw error;
    }
  }

  /**
   * Delete a configuration key
   */
  @Delete('keys/:id')
  async deleteConfigKey(@Param('id') id: string) {
    const deleted = await this.configService.deleteConfigKey(id);
    if (!deleted) {
      throw new NotFoundException(`Configuration key with ID ${id} not found`);
    }
    return { 
      success: true, 
      message: `Configuration key with ID ${id} has been deleted` 
    };
  }

  /**
   * Create a new configuration value with platform support
   */
  @Post('keys/:id/values')
  async createConfigValue(
    @Param('id') id: string,
    @Body() valueDto: ConfigValueDto,
    @Query('userId') userId = 'system',
    @Req() req?: Request
  ) {
    // If platform not specified in DTO, use the one from request
    if (!valueDto.platform && req) {
      valueDto.platform = (req as any).platform;
    }
    
    try {
      return await this.configService.createConfigValue(id, valueDto, userId);
    } catch (error) {
      if (error.message === 'CONFIG_KEY_NOT_FOUND') {
        throw new NotFoundException(`Configuration key with ID ${id} not found`);
      }
      throw error;
    }
  }

  /**
   * Update a configuration value
   */
  @Put('values/:id')
  async updateConfigValue(
    @Param('id') id: string,
    @Body() valueDto: ConfigValueDto,
    @Query('userId') userId = 'system',
    @Req() req?: Request
  ) {
    // If platform not specified in DTO, use the one from request
    if (!valueDto.platform && req) {
      valueDto.platform = (req as any).platform;
    }
    
    try {
      const configValue = await this.configService.updateConfigValue(id, valueDto, userId);
      if (!configValue) {
        throw new NotFoundException(`Configuration value with ID ${id} not found`);
      }
      return configValue;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete a configuration value
   */
  @Delete('values/:id')
  async deleteConfigValue(
    @Param('id') id: string,
    @Query('userId') userId = 'system',
  ) {
    const deleted = await this.configService.deleteConfigValue(id, userId);
    if (!deleted) {
      throw new NotFoundException(`Configuration value with ID ${id} not found`);
    }
    return { 
      success: true, 
      message: `Configuration value with ID ${id} has been deleted` 
    };
  }

  /**
   * Get platform-specific configuration values
   */
  @Get('platform/:platform')
  async getPlatformConfigs(
    @Param('platform') platform: PlatformType,
    @Query('category') category?: string
  ) {
    const context: ConfigContext = {
        environment: process.env.NODE_ENV || undefined,
      platform
    };
    
    if (category) {
      return this.configService.getByCategory(category, context);
    }
    
    // Return platform info
    return {
      platform,
      environment: context.environment,
      message: 'Use with ?category=name to get platform-specific configs for a category'
    };
  }
} 