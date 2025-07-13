import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeArticle, KnowledgeCategory } from '@prisma/client';
import slugify from 'slugify';

interface CreateArticleDto {
  title: string;
  content: string;
  excerpt?: string;
  categoryId: string;
  tags?: string[];
  isPublished?: boolean;
  relatedArticleIds?: string[];
}

interface UpdateArticleDto {
  title?: string;
  content?: string;
  excerpt?: string;
  categoryId?: string;
  tags?: string[];
  isPublished?: boolean;
  relatedArticleIds?: string[];
}

interface CreateCategoryDto {
  name: string;
  description?: string;
  parentId?: string;
}

interface UpdateCategoryDto {
  name?: string;
  description?: string;
  parentId?: string | null;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new knowledge article
   */
  async createArticle(data: CreateArticleDto): Promise<KnowledgeArticle> {
    try {
      // Check if category exists
      const category = await this.prisma.knowledgeCategory.findUnique({
        where: { id: data.categoryId },
      });
      
      if (!category) {
        throw new NotFoundException(`Knowledge category with ID ${data.categoryId} not found`);
      }
      
      // Generate slug from title
      const baseSlug = slugify(data.title, { lower: true });
      let slug = baseSlug;
      let counter = 1;
      
      // Check if slug already exists and generate a unique one
      while (await this.prisma.knowledgeArticle.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      
      // Create the article
      const article = await this.prisma.knowledgeArticle.create({
        data: {
          title: data.title,
          slug,
          content: data.content,
          excerpt: data.excerpt,
          categoryId: data.categoryId,
          tags: data.tags || [],
          isPublished: data.isPublished || false,
          publishedAt: data.isPublished ? new Date() : null,
        },
      });
      
      // Add related articles if provided
      if (data.relatedArticleIds && data.relatedArticleIds.length > 0) {
        await this.updateRelatedArticles(article.id, data.relatedArticleIds);
      }
      
      return article;
    } catch (error) {
      this.logger.error(`Error creating knowledge article: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get an article by ID
   */
  async getArticleById(id: string, incrementViewCount = false): Promise<KnowledgeArticle | null> {
    try {
      const article = await this.prisma.knowledgeArticle.findUnique({
        where: { id },
        include: {
          category: true,
          relatedArticles: {
            include: {
              category: true,
            },
          },
        },
      });
      
      if (!article) {
        return null;
      }
      
      // Increment view count if requested
      if (incrementViewCount) {
        await this.prisma.knowledgeArticle.update({
          where: { id },
          data: {
            viewCount: {
              increment: 1,
            },
          },
        });
      }
      
      return article;
    } catch (error) {
      this.logger.error(`Error getting article by ID: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get an article by slug
   */
  async getArticleBySlug(slug: string, incrementViewCount = false): Promise<KnowledgeArticle | null> {
    try {
      const article = await this.prisma.knowledgeArticle.findUnique({
        where: { slug },
        include: {
          category: true,
          relatedArticles: {
            include: {
              category: true,
            },
          },
        },
      });
      
      if (!article) {
        return null;
      }
      
      // Increment view count if requested
      if (incrementViewCount) {
        await this.prisma.knowledgeArticle.update({
          where: { id: article.id },
          data: {
            viewCount: {
              increment: 1,
            },
          },
        });
      }
      
      return article;
    } catch (error) {
      this.logger.error(`Error getting article by slug: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Update an article
   */
  async updateArticle(id: string, data: UpdateArticleDto): Promise<KnowledgeArticle> {
    try {
      // Check if article exists
      const existingArticle = await this.prisma.knowledgeArticle.findUnique({
        where: { id },
      });
      
      if (!existingArticle) {
        throw new NotFoundException(`Knowledge article with ID ${id} not found`);
      }
      
      // Check if category exists if provided
      if (data.categoryId) {
        const category = await this.prisma.knowledgeCategory.findUnique({
          where: { id: data.categoryId },
        });
        
        if (!category) {
          throw new NotFoundException(`Knowledge category with ID ${data.categoryId} not found`);
        }
      }
      
      // Generate new slug if title is changing
      let slug = existingArticle.slug;
      if (data.title && data.title !== existingArticle.title) {
        const baseSlug = slugify(data.title, { lower: true });
        slug = baseSlug;
        let counter = 1;
        
        // Check if new slug already exists and generate a unique one
        let slugExists = await this.prisma.knowledgeArticle.findFirst({
          where: {
            slug,
            id: { not: id },
          },
        });
        
        while (slugExists) {
          slug = `${baseSlug}-${counter}`;
          counter++;
          slugExists = await this.prisma.knowledgeArticle.findFirst({
            where: {
              slug,
              id: { not: id },
            },
          });
        }
      }
      
      // Check if publishing status is changing
      let publishedAt = existingArticle.publishedAt;
      if (data.isPublished === true && !existingArticle.isPublished) {
        publishedAt = new Date();
      }
      
      // Update the article
      const article = await this.prisma.knowledgeArticle.update({
        where: { id },
        data: {
          title: data.title,
          slug: data.title ? slug : undefined,
          content: data.content,
          excerpt: data.excerpt,
          categoryId: data.categoryId,
          tags: data.tags,
          isPublished: data.isPublished,
          publishedAt,
        },
      });
      
      // Update related articles if provided
      if (data.relatedArticleIds) {
        await this.updateRelatedArticles(id, data.relatedArticleIds);
      }
      
      return article;
    } catch (error) {
      this.logger.error(`Error updating knowledge article: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete an article
   */
  async deleteArticle(id: string): Promise<boolean> {
    try {
      // Check if article exists
      const existingArticle = await this.prisma.knowledgeArticle.findUnique({
        where: { id },
      });
      
      if (!existingArticle) {
        throw new NotFoundException(`Knowledge article with ID ${id} not found`);
      }
      
      // Remove related article connections first
      await this.prisma.$executeRaw`
        DELETE FROM "_RelatedArticles"
        WHERE "A" = ${id} OR "B" = ${id}
      `;
      
      // Delete the article
      await this.prisma.knowledgeArticle.delete({
        where: { id },
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Error deleting knowledge article: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update related articles for an article
   */
  private async updateRelatedArticles(articleId: string, relatedArticleIds: string[]): Promise<void> {
    // First, remove all existing related article connections
    await this.prisma.$executeRaw`
      DELETE FROM "_RelatedArticles"
      WHERE "A" = ${articleId} OR "B" = ${articleId}
    `;
    
    // Then, add the new related article connections
    for (const relatedId of relatedArticleIds) {
      // Skip if trying to relate to itself
      if (relatedId === articleId) continue;
      
      // Check if related article exists
      const relatedArticle = await this.prisma.knowledgeArticle.findUnique({
        where: { id: relatedId },
      });
      
      if (relatedArticle) {
        await this.prisma.$executeRaw`
          INSERT INTO "_RelatedArticles" ("A", "B")
          VALUES (${articleId}, ${relatedId})
          ON CONFLICT DO NOTHING
        `;
      }
    }
  }

  /**
   * Search articles
   */
  async searchArticles(
    query: string,
    categoryId?: string,
    tags?: string[],
    onlyPublished = true,
    limit = 10,
  ): Promise<KnowledgeArticle[]> {
    try {
      // Build where clause
      const where: any = {};
      
      if (onlyPublished) {
        where.isPublished = true;
      }
      
      if (categoryId) {
        where.categoryId = categoryId;
      }
      
      if (tags && tags.length > 0) {
        where.tags = {
          hasSome: tags,
        };
      }
      
      if (query) {
        where.OR = [
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
          { excerpt: { contains: query, mode: 'insensitive' } },
          { tags: { has: query } },
        ];
      }
      
      // Get articles
      const articles = await this.prisma.knowledgeArticle.findMany({
        where,
        include: {
          category: true,
        },
        orderBy: [
          { viewCount: 'desc' },
          { title: 'asc' },
        ],
        take: limit,
      });
      
      return articles;
    } catch (error) {
      this.logger.error(`Error searching articles: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get popular articles
   */
  async getPopularArticles(limit = 5, categoryId?: string): Promise<KnowledgeArticle[]> {
    try {
      const where: any = {
        isPublished: true,
      };
      
      if (categoryId) {
        where.categoryId = categoryId;
      }
      
      return await this.prisma.knowledgeArticle.findMany({
        where,
        orderBy: {
          viewCount: 'desc',
        },
        take: limit,
        include: {
          category: true,
        },
      });
    } catch (error) {
      this.logger.error(`Error getting popular articles: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Record article helpfulness feedback
   */
  async recordArticleFeedback(articleId: string, isHelpful: boolean): Promise<boolean> {
    try {
      await this.prisma.knowledgeArticle.update({
        where: { id: articleId },
        data: {
          helpfulCount: {
            increment: isHelpful ? 1 : 0,
          },
          unhelpfulCount: {
            increment: isHelpful ? 0 : 1,
          },
        },
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Error recording article feedback: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Create a new knowledge category
   */
  async createCategory(data: CreateCategoryDto): Promise<KnowledgeCategory> {
    try {
      // Check if category with same name already exists
      const existingCategory = await this.prisma.knowledgeCategory.findUnique({
        where: { name: data.name },
      });
      
      if (existingCategory) {
        throw new BadRequestException(`Knowledge category with name '${data.name}' already exists`);
      }
      
      // Check if parent category exists if provided
      if (data.parentId) {
        const parentCategory = await this.prisma.knowledgeCategory.findUnique({
          where: { id: data.parentId },
        });
        
        if (!parentCategory) {
          throw new NotFoundException(`Parent category with ID ${data.parentId} not found`);
        }
      }
      
      // Create the category
      return await this.prisma.knowledgeCategory.create({
        data: {
          name: data.name,
          description: data.description,
          parentId: data.parentId,
        },
      });
    } catch (error) {
      this.logger.error(`Error creating knowledge category: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update a knowledge category
   */
  async updateCategory(id: string, data: UpdateCategoryDto): Promise<KnowledgeCategory> {
    try {
      // Check if category exists
      const existingCategory = await this.prisma.knowledgeCategory.findUnique({
        where: { id },
      });
      
      if (!existingCategory) {
        throw new NotFoundException(`Knowledge category with ID ${id} not found`);
      }
      
      // Check if name is unique if changing
      if (data.name && data.name !== existingCategory.name) {
        const categoryWithSameName = await this.prisma.knowledgeCategory.findUnique({
          where: { name: data.name },
        });
        
        if (categoryWithSameName) {
          throw new BadRequestException(`Knowledge category with name '${data.name}' already exists`);
        }
      }
      
      // Check if parent category exists if provided
      if (data.parentId) {
        const parentCategory = await this.prisma.knowledgeCategory.findUnique({
          where: { id: data.parentId },
        });
        
        if (!parentCategory) {
          throw new NotFoundException(`Parent category with ID ${data.parentId} not found`);
        }
        
        // Check for circular reference
        if (await this.wouldCreateCircularReference(data.parentId, id)) {
          throw new BadRequestException('Cannot create circular reference in category hierarchy');
        }
      }
      
      // Update the category
      return await this.prisma.knowledgeCategory.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          parentId: data.parentId,
        },
      });
    } catch (error) {
      this.logger.error(`Error updating knowledge category: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete a knowledge category
   */
  async deleteCategory(id: string): Promise<boolean> {
    try {
      // Check if category exists
      const existingCategory = await this.prisma.knowledgeCategory.findUnique({
        where: { id },
        include: {
          children: true,
          articles: true,
        },
      });
      
      if (!existingCategory) {
        throw new NotFoundException(`Knowledge category with ID ${id} not found`);
      }
      
      // Check if category has children
      if (existingCategory.children.length > 0) {
        throw new BadRequestException('Cannot delete category with child categories');
      }
      
      // Check if category has articles
      if (existingCategory.articles.length > 0) {
        throw new BadRequestException('Cannot delete category with associated articles');
      }
      
      // Delete the category
      await this.prisma.knowledgeCategory.delete({
        where: { id },
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Error deleting knowledge category: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all categories
   */
  async getAllCategories(includeArticleCounts = false): Promise<KnowledgeCategory[]> {
    try {
      return await this.prisma.knowledgeCategory.findMany({
        include: {
          _count: includeArticleCounts ? {
            select: {
              articles: true,
            },
          } : false,
        },
        orderBy: {
          name: 'asc',
        },
      });
    } catch (error) {
      this.logger.error(`Error getting all categories: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get category hierarchy as tree
   */
  async getCategoryTree(): Promise<any[]> {
    try {
      const allCategories = await this.prisma.knowledgeCategory.findMany({
        include: {
          _count: {
            select: {
              articles: true,
            },
          },
        },
      });
      
      // Build the tree structure
      const categoryMap = new Map();
      const rootCategories: any[] = [];
      
      // First pass: create map of all categories
      allCategories.forEach(category => {
        categoryMap.set(category.id, {
          ...category,
          children: [],
          articleCount: category._count.articles,
        });
        delete categoryMap.get(category.id)._count;
      });
      
      // Second pass: build the tree
      allCategories.forEach(category => {
        const categoryWithChildren = categoryMap.get(category.id);
        
        if (category.parentId) {
          const parent = categoryMap.get(category.parentId);
          if (parent) {
            parent.children.push(categoryWithChildren);
          } else {
            rootCategories.push(categoryWithChildren);
          }
        } else {
          rootCategories.push(categoryWithChildren);
        }
      });
      
      return rootCategories;
    } catch (error) {
      this.logger.error(`Error getting category tree: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Check if setting parentId would create a circular reference
   */
  private async wouldCreateCircularReference(parentId: string, currentId: string): Promise<boolean> {
    // If parent is the same as current, it's a circular reference
    if (parentId === currentId) {
      return true;
    }
    
    // Check if any ancestor of the parent is the current category
    let ancestor = await this.prisma.knowledgeCategory.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    });
    
    while (ancestor && ancestor.parentId) {
      if (ancestor.parentId === currentId) {
        return true;
      }
      
      ancestor = await this.prisma.knowledgeCategory.findUnique({
        where: { id: ancestor.parentId },
        select: { parentId: true },
      });
    }
    
    return false;
  }
} 