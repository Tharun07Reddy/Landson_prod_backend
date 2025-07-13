import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Category } from '@prisma/client';
import slugify from 'slugify';

interface CreateCategoryDto {
  name: string;
  description?: string;
  parentId?: string;
  image?: string;
  isActive?: boolean;
  sortOrder?: number;
  metaTitle?: string;
  metaDescription?: string;
}

interface UpdateCategoryDto {
  name?: string;
  description?: string;
  parentId?: string | null;
  image?: string;
  isActive?: boolean;
  sortOrder?: number;
  metaTitle?: string;
  metaDescription?: string;
}

interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[];
  _count?: {
    products: number;
  };
}

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all categories (flat structure)
   */
  async findAll(includeInactive = false): Promise<Category[]> {
    try {
      const where = includeInactive ? {} : { isActive: true };
      
      return await this.prisma.category.findMany({
        where,
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      });
    } catch (error) {
      this.logger.error(`Error finding all categories: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get all categories as a hierarchical tree
   */
  async findAllAsTree(includeInactive = false): Promise<CategoryWithChildren[]> {
    try {
      const allCategories = await this.prisma.category.findMany({
        where: includeInactive ? {} : { isActive: true },
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      });
      
      // Build the tree structure
      const categoryMap = new Map<string, CategoryWithChildren>();
      const rootCategories: CategoryWithChildren[] = [];
      
      // First pass: create map of all categories
      allCategories.forEach(category => {
        categoryMap.set(category.id, { ...category, children: [] });
      });
      
      // Second pass: build the tree
      allCategories.forEach(category => {
        const categoryWithChildren = categoryMap.get(category.id);
        
        if (categoryWithChildren) {
          if (category.parentId) {
            const parent = categoryMap.get(category.parentId);
            if (parent) {
              parent.children.push(categoryWithChildren);
            } else {
              // If parent doesn't exist, treat as root
              rootCategories.push(categoryWithChildren);
            }
          } else {
            rootCategories.push(categoryWithChildren);
          }
        }
      });
      
      return rootCategories;
    } catch (error) {
      this.logger.error(`Error finding categories as tree: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get a category by ID
   */
  async findById(id: string, includeChildren = false): Promise<CategoryWithChildren | null> {
    try {
      const category = await this.prisma.category.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      });
      
      if (!category) {
        return null;
      }
      
      if (includeChildren) {
        const children = await this.findChildrenRecursive(id);
        return { ...category, children };
      }
      
      // Add empty children array to satisfy TypeScript
      return { ...category, children: [] };
    } catch (error) {
      this.logger.error(`Error finding category by ID: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get a category by slug
   */
  async findBySlug(slug: string, includeChildren = false): Promise<CategoryWithChildren | null> {
    try {
      const category = await this.prisma.category.findUnique({
        where: { slug },
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      });
      
      if (!category) {
        return null;
      }
      
      if (includeChildren) {
        const children = await this.findChildrenRecursive(category.id);
        return { ...category, children };
      }
      
      // Add empty children array to satisfy TypeScript
      return { ...category, children: [] };
    } catch (error) {
      this.logger.error(`Error finding category by slug: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Create a new category
   */
  async create(data: CreateCategoryDto): Promise<Category> {
    try {
      // Generate slug from name
      const baseSlug = slugify(data.name, { lower: true });
      let slug = baseSlug;
      let counter = 1;
      
      // Check if slug already exists and generate a unique one
      while (await this.prisma.category.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      
      // Check if parent exists if parentId is provided
      if (data.parentId) {
        const parent = await this.prisma.category.findUnique({
          where: { id: data.parentId },
        });
        
        if (!parent) {
          throw new NotFoundException(`Parent category with ID ${data.parentId} not found`);
        }
        
        // Check for circular reference
        if (await this.wouldCreateCircularReference(data.parentId, null)) {
          throw new BadRequestException('Cannot create circular reference in category hierarchy');
        }
      }
      
      return await this.prisma.category.create({
        data: {
          name: data.name,
          slug,
          description: data.description,
          parentId: data.parentId,
          image: data.image,
          isActive: data.isActive ?? true,
          sortOrder: data.sortOrder ?? 0,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
        },
      });
    } catch (error) {
      this.logger.error(`Error creating category: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update a category
   */
  async update(id: string, data: UpdateCategoryDto): Promise<Category> {
    try {
      // Check if category exists
      const existingCategory = await this.prisma.category.findUnique({
        where: { id },
      });
      
      if (!existingCategory) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }
      
      // Generate new slug if name is changing
      let slug = existingCategory.slug;
      if (data.name && data.name !== existingCategory.name) {
        const baseSlug = slugify(data.name, { lower: true });
        slug = baseSlug;
        let counter = 1;
        
        // Check if new slug already exists and generate a unique one
        let slugExists = await this.prisma.category.findFirst({
          where: {
            slug,
            id: { not: id },
          },
        });
        
        while (slugExists) {
          slug = `${baseSlug}-${counter}`;
          counter++;
          slugExists = await this.prisma.category.findFirst({
            where: {
              slug,
              id: { not: id },
            },
          });
        }
      }
      
      // Check if parent exists if parentId is provided
      if (data.parentId !== undefined) {
        if (data.parentId !== null) {
          const parent = await this.prisma.category.findUnique({
            where: { id: data.parentId },
          });
          
          if (!parent) {
            throw new NotFoundException(`Parent category with ID ${data.parentId} not found`);
          }
          
          // Check for circular reference
          if (await this.wouldCreateCircularReference(data.parentId, id)) {
            throw new BadRequestException('Cannot create circular reference in category hierarchy');
          }
          
          // Check if parent is the category itself
          if (data.parentId === id) {
            throw new BadRequestException('A category cannot be its own parent');
          }
        }
      }
      
      return await this.prisma.category.update({
        where: { id },
        data: {
          name: data.name,
          slug: data.name ? slug : undefined,
          description: data.description,
          parentId: data.parentId,
          image: data.image,
          isActive: data.isActive,
          sortOrder: data.sortOrder,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
        },
      });
    } catch (error) {
      this.logger.error(`Error updating category: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete a category
   */
  async delete(id: string): Promise<boolean> {
    try {
      // Check if category exists
      const existingCategory = await this.prisma.category.findUnique({
        where: { id },
        include: {
          children: true,
          products: true,
        },
      });
      
      if (!existingCategory) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }
      
      // Check if category has children
      if (existingCategory.children.length > 0) {
        throw new BadRequestException('Cannot delete category with child categories');
      }
      
      // Check if category has products
      if (existingCategory.products.length > 0) {
        throw new BadRequestException('Cannot delete category with associated products');
      }
      
      // Delete the category
      await this.prisma.category.delete({
        where: { id },
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Error deleting category: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get breadcrumb trail for a category
   */
  async getBreadcrumbs(categoryId: string): Promise<Category[]> {
    try {
      const breadcrumbs: Category[] = [];
      let currentCategory = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });
      
      if (!currentCategory) {
        return breadcrumbs;
      }
      
      breadcrumbs.unshift(currentCategory);
      
      // Traverse up the hierarchy
      while (currentCategory.parentId) {
        currentCategory = await this.prisma.category.findUnique({
          where: { id: currentCategory.parentId },
        });
        
        if (!currentCategory) {
          break;
        }
        
        breadcrumbs.unshift(currentCategory);
      }
      
      return breadcrumbs;
    } catch (error) {
      this.logger.error(`Error getting breadcrumbs: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Find all children of a category recursively
   */
  private async findChildrenRecursive(parentId: string): Promise<CategoryWithChildren[]> {
    const children = await this.prisma.category.findMany({
      where: { parentId },
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });
    
    const result: CategoryWithChildren[] = [];
    
    for (const child of children) {
      const grandchildren = await this.findChildrenRecursive(child.id);
      result.push({
        ...child,
        children: grandchildren,
      });
    }
    
    return result;
  }

  /**
   * Check if setting parentId would create a circular reference
   */
  private async wouldCreateCircularReference(parentId: string, currentId: string | null): Promise<boolean> {
    // If we're checking a new category (currentId is null), there's no risk of circular reference
    if (currentId === null) {
      return false;
    }
    
    // If parent is the same as current, it's a circular reference
    if (parentId === currentId) {
      return true;
    }
    
    // Check if any ancestor of the parent is the current category
    let ancestor = await this.prisma.category.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    });
    
    while (ancestor && ancestor.parentId) {
      if (ancestor.parentId === currentId) {
        return true;
      }
      
      ancestor = await this.prisma.category.findUnique({
        where: { id: ancestor.parentId },
        select: { parentId: true },
      });
    }
    
    return false;
  }
} 