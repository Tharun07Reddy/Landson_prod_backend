import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryAttribute, AttributeType } from '@prisma/client';

interface CreateCategoryAttributeDto {
  categoryId: string;
  name: string;
  type: AttributeType;
  isRequired?: boolean;
  options?: string[];
  defaultValue?: string;
  sortOrder?: number;
}

interface UpdateCategoryAttributeDto {
  name?: string;
  type?: AttributeType;
  isRequired?: boolean;
  options?: string[];
  defaultValue?: string;
  sortOrder?: number;
}

@Injectable()
export class CategoryAttributeService {
  private readonly logger = new Logger(CategoryAttributeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all attributes for a category
   */
  async findByCategoryId(categoryId: string): Promise<CategoryAttribute[]> {
    try {
      return await this.prisma.categoryAttribute.findMany({
        where: { categoryId },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      });
    } catch (error) {
      this.logger.error(`Error finding attributes for category: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get an attribute by ID
   */
  async findById(id: string): Promise<CategoryAttribute | null> {
    try {
      return await this.prisma.categoryAttribute.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error finding attribute by ID: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Create a new category attribute
   */
  async create(data: CreateCategoryAttributeDto): Promise<CategoryAttribute> {
    try {
      // Check if category exists
      const category = await this.prisma.category.findUnique({
        where: { id: data.categoryId },
      });
      
      if (!category) {
        throw new NotFoundException(`Category with ID ${data.categoryId} not found`);
      }
      
      // Check if attribute with same name already exists for this category
      const existingAttribute = await this.prisma.categoryAttribute.findFirst({
        where: {
          categoryId: data.categoryId,
          name: data.name,
        },
      });
      
      if (existingAttribute) {
        throw new BadRequestException(`Attribute with name '${data.name}' already exists for this category`);
      }
      
      // Validate options for dropdown and multiselect types
      if ((data.type === AttributeType.DROPDOWN || data.type === AttributeType.MULTISELECT) && 
          (!data.options || data.options.length === 0)) {
        throw new BadRequestException(`Options are required for ${data.type} attribute type`);
      }
      
      // Validate default value against options for dropdown and multiselect
      if (data.defaultValue && 
          (data.type === AttributeType.DROPDOWN || data.type === AttributeType.MULTISELECT) && 
          data.options && 
          !data.options.includes(data.defaultValue)) {
        throw new BadRequestException(`Default value must be one of the provided options`);
      }
      
      // Create the attribute
      return await this.prisma.categoryAttribute.create({
        data: {
          categoryId: data.categoryId,
          name: data.name,
          type: data.type,
          isRequired: data.isRequired ?? false,
          options: data.options ?? [],
          defaultValue: data.defaultValue,
          sortOrder: data.sortOrder ?? 0,
        },
      });
    } catch (error) {
      this.logger.error(`Error creating category attribute: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update a category attribute
   */
  async update(id: string, data: UpdateCategoryAttributeDto): Promise<CategoryAttribute> {
    try {
      // Check if attribute exists
      const existingAttribute = await this.prisma.categoryAttribute.findUnique({
        where: { id },
      });
      
      if (!existingAttribute) {
        throw new NotFoundException(`Category attribute with ID ${id} not found`);
      }
      
      // If name is changing, check for duplicates
      if (data.name && data.name !== existingAttribute.name) {
        const duplicateName = await this.prisma.categoryAttribute.findFirst({
          where: {
            categoryId: existingAttribute.categoryId,
            name: data.name,
            id: { not: id },
          },
        });
        
        if (duplicateName) {
          throw new BadRequestException(`Attribute with name '${data.name}' already exists for this category`);
        }
      }
      
      // Determine the attribute type (either from update data or existing)
      const attributeType = data.type || existingAttribute.type;
      
      // Validate options for dropdown and multiselect types
      if ((attributeType === AttributeType.DROPDOWN || attributeType === AttributeType.MULTISELECT)) {
        const options = data.options !== undefined ? data.options : existingAttribute.options;
        
        if (!options || options.length === 0) {
          throw new BadRequestException(`Options are required for ${attributeType} attribute type`);
        }
        
        // Validate default value against options
        const defaultValue = data.defaultValue !== undefined ? data.defaultValue : existingAttribute.defaultValue;
        
        if (defaultValue && !options.includes(defaultValue)) {
          throw new BadRequestException(`Default value must be one of the provided options`);
        }
      }
      
      // Update the attribute
      return await this.prisma.categoryAttribute.update({
        where: { id },
        data,
      });
    } catch (error) {
      this.logger.error(`Error updating category attribute: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete a category attribute
   */
  async delete(id: string): Promise<boolean> {
    try {
      // Check if attribute exists
      const existingAttribute = await this.prisma.categoryAttribute.findUnique({
        where: { id },
      });
      
      if (!existingAttribute) {
        throw new NotFoundException(`Category attribute with ID ${id} not found`);
      }
      
      // Delete the attribute
      await this.prisma.categoryAttribute.delete({
        where: { id },
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Error deleting category attribute: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Reorder category attributes
   */
  async reorder(categoryId: string, attributeIds: string[]): Promise<boolean> {
    try {
      // Check if category exists
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });
      
      if (!category) {
        throw new NotFoundException(`Category with ID ${categoryId} not found`);
      }
      
      // Get all attributes for this category
      const attributes = await this.prisma.categoryAttribute.findMany({
        where: { categoryId },
      });
      
      // Validate that all provided IDs belong to this category
      const attributeIdSet = new Set(attributes.map(attr => attr.id));
      const invalidIds = attributeIds.filter(id => !attributeIdSet.has(id));
      
      if (invalidIds.length > 0) {
        throw new BadRequestException(`Some attribute IDs do not belong to this category: ${invalidIds.join(', ')}`);
      }
      
      // Update the sort order for each attribute
      for (let i = 0; i < attributeIds.length; i++) {
        await this.prisma.categoryAttribute.update({
          where: { id: attributeIds[i] },
          data: { sortOrder: i },
        });
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error reordering category attributes: ${error.message}`, error.stack);
      throw error;
    }
  }
} 