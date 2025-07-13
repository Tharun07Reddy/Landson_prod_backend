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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { KnowledgeBaseService } from './knowledge-base.service';

// DTOs would normally be in separate files
class CreateArticleDto {
  title: string;
  content: string;
  excerpt?: string;
  categoryId: string;
  tags?: string[];
  isPublished?: boolean;
  relatedArticleIds?: string[];
}

class UpdateArticleDto {
  title?: string;
  content?: string;
  excerpt?: string;
  categoryId?: string;
  tags?: string[];
  isPublished?: boolean;
  relatedArticleIds?: string[];
}

class CreateCategoryDto {
  name: string;
  description?: string;
  parentId?: string;
}

class UpdateCategoryDto {
  name?: string;
  description?: string;
  parentId?: string | null;
}

class ArticleFeedbackDto {
  isHelpful: boolean;
}

@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  // ==================== Article Endpoints ====================

  /**
   * Get an article by ID
   */
  @Get('articles/:id')
  @Public()
  async getArticleById(
    @Param('id') id: string,
    @Query('view') view?: string,
  ): Promise<any> {
    const article = await this.knowledgeBaseService.getArticleById(
      id,
      view === 'true',
    );
    
    if (!article) {
      throw new NotFoundException(`Article with ID ${id} not found`);
    }
    
    return article;
  }

  /**
   * Get an article by slug
   */
  @Get('articles/by-slug/:slug')
  @Public()
  async getArticleBySlug(
    @Param('slug') slug: string,
    @Query('view') view?: string,
  ): Promise<any> {
    const article = await this.knowledgeBaseService.getArticleBySlug(
      slug,
      view === 'true',
    );
    
    if (!article) {
      throw new NotFoundException(`Article with slug '${slug}' not found`);
    }
    
    return article;
  }

  /**
   * Create a new article
   */
  @Post('articles')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'knowledge', action: 'create' })
  async createArticle(@Body() createArticleDto: CreateArticleDto): Promise<any> {
    return await this.knowledgeBaseService.createArticle(createArticleDto);
  }

  /**
   * Update an article
   */
  @Put('articles/:id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'knowledge', action: 'update' })
  async updateArticle(
    @Param('id') id: string,
    @Body() updateArticleDto: UpdateArticleDto,
  ): Promise<any> {
    return await this.knowledgeBaseService.updateArticle(id, updateArticleDto);
  }

  /**
   * Delete an article
   */
  @Delete('articles/:id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'knowledge', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteArticle(@Param('id') id: string): Promise<void> {
    const result = await this.knowledgeBaseService.deleteArticle(id);
    
    if (!result) {
      throw new BadRequestException('Failed to delete article');
    }
  }

  /**
   * Search articles
   */
  @Get('articles/search')
  @Public()
  async searchArticles(
    @Query('query') query: string,
    @Query('categoryId') categoryId?: string,
    @Query('tags') tags?: string,
    @Query('onlyPublished') onlyPublished?: string,
    @Query('limit') limit?: string,
  ): Promise<any[]> {
    // Parse query parameters
    const parsedTags = tags ? tags.split(',') : undefined;
    const parsedOnlyPublished = onlyPublished !== 'false'; // Default to true
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    
    return await this.knowledgeBaseService.searchArticles(
      query,
      categoryId,
      parsedTags,
      parsedOnlyPublished,
      parsedLimit,
    );
  }

  /**
   * Get popular articles
   */
  @Get('articles/popular')
  @Public()
  async getPopularArticles(
    @Query('limit') limit?: string,
    @Query('categoryId') categoryId?: string,
  ): Promise<any[]> {
    // Parse query parameters
    const parsedLimit = limit ? parseInt(limit, 10) : 5;
    
    return await this.knowledgeBaseService.getPopularArticles(
      parsedLimit,
      categoryId,
    );
  }

  /**
   * Submit article feedback
   */
  @Post('articles/:id/feedback')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async submitArticleFeedback(
    @Param('id') id: string,
    @Body() feedbackDto: ArticleFeedbackDto,
  ): Promise<void> {
    const result = await this.knowledgeBaseService.recordArticleFeedback(
      id,
      feedbackDto.isHelpful,
    );
    
    if (!result) {
      throw new BadRequestException('Failed to record feedback');
    }
  }

  // ==================== Category Endpoints ====================

  /**
   * Get all categories
   */
  @Get('categories')
  @Public()
  async getAllCategories(
    @Query('includeCounts') includeCounts?: string,
  ): Promise<any[]> {
    return await this.knowledgeBaseService.getAllCategories(
      includeCounts === 'true',
    );
  }

  /**
   * Get category tree
   */
  @Get('categories/tree')
  @Public()
  async getCategoryTree(): Promise<any[]> {
    return await this.knowledgeBaseService.getCategoryTree();
  }

  /**
   * Create a new category
   */
  @Post('categories')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'knowledge', action: 'create' })
  async createCategory(@Body() createCategoryDto: CreateCategoryDto): Promise<any> {
    return await this.knowledgeBaseService.createCategory(createCategoryDto);
  }

  /**
   * Update a category
   */
  @Put('categories/:id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'knowledge', action: 'update' })
  async updateCategory(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ): Promise<any> {
    return await this.knowledgeBaseService.updateCategory(id, updateCategoryDto);
  }

  /**
   * Delete a category
   */
  @Delete('categories/:id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'knowledge', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCategory(@Param('id') id: string): Promise<void> {
    const result = await this.knowledgeBaseService.deleteCategory(id);
    
    if (!result) {
      throw new BadRequestException('Failed to delete category');
    }
  }
} 