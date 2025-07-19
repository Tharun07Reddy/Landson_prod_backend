import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  Query, 
  UseGuards,
  NotFoundException,
  BadRequestException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductVariantService } from './product-variant.service';
import { ProductMediaService } from './product-media.service';
import { ProductInventoryService } from './product-inventory.service';
import { ProductReviewService } from './product-review.service';
import { ProductAnalyticsService } from './product-analytics.service';
import { ProductSearchService } from './product-search.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { CreateProductReviewDto } from './dto/create-product-review.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SearchQueryDto } from './dto/search-query.dto';

@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly variantService: ProductVariantService,
    private readonly mediaService: ProductMediaService,
    private readonly inventoryService: ProductInventoryService,
    private readonly reviewService: ProductReviewService,
    private readonly analyticsService: ProductAnalyticsService,
    private readonly searchService: ProductSearchService,
  ) {}

  @Post()
  @RequirePermissions({ resource: 'products', action: 'create' })
  async create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }

  @Get()
  @Public()
  async findAll(@Query() query: ProductQueryDto) {
    return this.productService.findAll(query);
  }

  @Get('featured')
  @Public()
  async getFeatured(@Query('limit') limit?: number) {
    return this.productService.findFeatured(limit);
  }

  @Get('popular')
  @Public()
  async getPopular(@Query('limit') limit?: number) {
    return this.analyticsService.getPopularProducts(limit);
  }

  @Get('trending')
  @Public()
  async getTrending(
    @Query('days') days?: number,
    @Query('limit') limit?: number,
  ) {
    return this.analyticsService.getTrendingProducts(days, limit);
  }

  @Get('category/:categoryId')
  @Public()
  async getByCategory(
    @Param('categoryId') categoryId: string,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
  ) {
    return this.productService.findByCategory(categoryId, limit, page);
  }

  @Get('search')
  @Public()
  async search(@Query() query: SearchQueryDto) {
    const results = await this.searchService.search(query);
    
    // Track search analytics
    this.analyticsService.trackProductSearch({
      query: query.q || '',
      filters: query.filters,
      sortBy: query.sortBy,
      resultCount: results.meta.total,
    }).catch(error => {
      console.error('Failed to track product search:', error);
    });
    
    return results;
  }

  @Get(':id')
  @Public()
  async findOne(@Param('id') id: string) {
    return this.productService.findOne(id);
  }

  @Get('slug/:slug')
  @Public()
  async findBySlug(@Param('slug') slug: string) {
    return this.productService.findBySlug(slug);
  }

  @Get(':id/related')
  @Public()
  async getRelated(
    @Param('id') id: string,
    @Query('limit') limit?: number,
  ) {
    return this.productService.findRelated(id, limit);
  }

  @Patch(':id')
  @RequirePermissions({ resource: 'products', action: 'update' })
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productService.update(id, updateProductDto);
  }

  @Delete(':id')
  @RequirePermissions({ resource: 'products', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return this.productService.remove(id);
  }

  // Variant endpoints
  @Post(':productId/variants')
  @RequirePermissions({ resource: 'products', action: 'update' })
  async createVariant(
    @Param('productId') productId: string,
    @Body() createVariantDto: CreateProductVariantDto,
  ) {
    return this.variantService.create(productId, createVariantDto);
  }

  @Get(':productId/variants')
  @Public()
  async getVariants(@Param('productId') productId: string) {
    return this.variantService.findAll(productId);
  }

  @Get('variants/:id')
  @Public()
  async getVariant(@Param('id') id: string) {
    return this.variantService.findOne(id);
  }

  @Patch('variants/:id')
  @RequirePermissions({ resource: 'products', action: 'update' })
  async updateVariant(
    @Param('id') id: string,
    @Body() updateVariantDto: any,
  ) {
    return this.variantService.update(id, updateVariantDto);
  }

  @Delete('variants/:id')
  @RequirePermissions({ resource: 'products', action: 'update' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeVariant(@Param('id') id: string) {
    return this.variantService.remove(id);
  }

  // Media endpoints
  @Post(':productId/media')
  @RequirePermissions({ resource: 'products', action: 'update' })
  async addMedia(
    @Param('productId') productId: string,
    @Body() mediaDto: any,
  ) {
    return this.mediaService.addToProduct(productId, mediaDto);
  }

  @Post('variants/:variantId/media')
  @RequirePermissions({ resource: 'products', action: 'update' })
  async addVariantMedia(
    @Param('variantId') variantId: string,
    @Body() mediaDto: any,
  ) {
    return this.mediaService.addToVariant(variantId, mediaDto);
  }

  @Delete('media/:id')
  @RequirePermissions({ resource: 'products', action: 'update' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMedia(@Param('id') id: string) {
    return this.mediaService.remove(id);
  }

  // Inventory endpoints
  @Patch(':productId/inventory')
  @RequirePermissions({ resource: 'inventory', action: 'update' })
  async updateInventory(
    @Param('productId') productId: string,
    @Body() updateInventoryDto: UpdateInventoryDto,
  ) {
    return this.inventoryService.updateForProduct(productId, updateInventoryDto);
  }

  @Patch('variants/:variantId/inventory')
  @RequirePermissions({ resource: 'inventory', action: 'update' })
  async updateVariantInventory(
    @Param('variantId') variantId: string,
    @Body() updateInventoryDto: UpdateInventoryDto,
  ) {
    return this.inventoryService.updateForVariant(variantId, updateInventoryDto);
  }

  // Review endpoints
  @Post(':productId/reviews')
  @Public()
  async addReview(
    @Param('productId') productId: string,
    @Body() reviewDto: CreateProductReviewDto,
    @CurrentUser() user: any,
  ) {
    return this.reviewService.create(productId, {
      ...reviewDto,
      userId: user?.id,
    });
  }

  @Get(':productId/reviews')
  @Public()
  async getReviews(
    @Param('productId') productId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('approved') approved = true,
  ) {
    return this.reviewService.findAll(productId, { page, limit, approved });
  }

  @Patch('reviews/:id/approve')
  @RequirePermissions({ resource: 'reviews', action: 'moderate' })
  async approveReview(@Param('id') id: string) {
    return this.reviewService.approve(id);
  }

  @Delete('reviews/:id')
  @RequirePermissions({ resource: 'reviews', action: 'moderate' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeReview(@Param('id') id: string) {
    return this.reviewService.remove(id);
  }

  // Analytics endpoints
  @Get(':productId/stats')
  @RequirePermissions({ resource: 'analytics', action: 'view' })
  async getProductStats(
    @Param('productId') productId: string,
    @Query('days') days = 30,
  ) {
    return this.analyticsService.getProductViewStats(productId, days);
  }

  @Get('analytics/search-queries')
  @RequirePermissions({ resource: 'analytics', action: 'view' })
  async getTopSearchQueries(@Query('limit') limit = 10) {
    return this.analyticsService.getTopSearchQueries(limit);
  }

  @Get('analytics/zero-result-searches')
  @RequirePermissions({ resource: 'analytics', action: 'view' })
  async getZeroResultSearches(@Query('limit') limit = 10) {
    return this.analyticsService.getZeroResultSearches(limit);
  }

  // Free Items endpoints
  @Get(':productId/free-items')
  @Public()
  async getProductFreeItems(@Param('productId') productId: string) {
    // This endpoint is handled by the FreeItemService
    // It's included here for API consistency
    return { message: 'Use /free-items/products/:productId endpoint' };
  }
} 