import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttributeType } from '@prisma/client';
import { ProductAttributeDto } from './dto/create-product.dto';

@Injectable()
export class ProductAttributeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Add attributes to a product
   */
  async addToProduct(productId: string, attributes: ProductAttributeDto[]) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    // Check for duplicate attribute names
    const attributeNames = attributes.map(attr => attr.name);
    const uniqueNames = new Set(attributeNames);
    
    if (uniqueNames.size !== attributeNames.length) {
      throw new BadRequestException('Duplicate attribute names are not allowed');
    }

    // Check if any attributes already exist
    const existingAttributes = await this.prisma.productAttribute.findMany({
      where: {
        productId,
        name: {
          in: attributeNames,
        },
      },
    });

    if (existingAttributes.length > 0) {
      const existingNames = existingAttributes.map(attr => attr.name);
      throw new BadRequestException(`Attributes already exist: ${existingNames.join(', ')}`);
    }

    // Create attributes
    const createdAttributes = await this.prisma.productAttribute.createMany({
      data: attributes.map(attr => ({
        name: attr.name,
        value: attr.value,
        type: attr.type,
        isFilterable: attr.isFilterable || false,
        isSearchable: attr.isSearchable || false,
        isVariantOption: attr.isVariantOption || false,
        position: attr.position || 0,
        productId,
      })),
    });

    return this.getProductAttributes(productId);
  }

  /**
   * Update a product attribute
   */
  async update(id: string, attributeData: Partial<ProductAttributeDto>) {
    // Check if attribute exists
    const attribute = await this.prisma.productAttribute.findUnique({
      where: { id },
    });

    if (!attribute) {
      throw new NotFoundException(`Attribute with ID ${id} not found`);
    }

    // If name is being changed, check for duplicates
    if (attributeData.name && attributeData.name !== attribute.name) {
      const existingAttribute = await this.prisma.productAttribute.findFirst({
        where: {
          productId: attribute.productId,
          name: attributeData.name,
        },
      });

      if (existingAttribute) {
        throw new BadRequestException(`Attribute with name '${attributeData.name}' already exists for this product`);
      }
    }

    // Update attribute
    return this.prisma.productAttribute.update({
      where: { id },
      data: attributeData,
    });
  }

  /**
   * Delete a product attribute
   */
  async remove(id: string) {
    // Check if attribute exists
    const attribute = await this.prisma.productAttribute.findUnique({
      where: { id },
    });

    if (!attribute) {
      throw new NotFoundException(`Attribute with ID ${id} not found`);
    }

    // Check if this is a variant option attribute
    if (attribute.isVariantOption) {
      // Check if any variants use this attribute
      const product = await this.prisma.product.findUnique({
        where: { id: attribute.productId },
        include: {
          variants: true,
        },
      });

      if (product && product.variants.length > 0) {
        throw new BadRequestException(`Cannot delete attribute '${attribute.name}' because it is used by product variants`);
      }
    }

    await this.prisma.productAttribute.delete({
      where: { id },
    });

    return { id, message: 'Attribute deleted successfully' };
  }

  /**
   * Get all attributes for a product
   */
  async getProductAttributes(productId: string) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    return this.prisma.productAttribute.findMany({
      where: { productId },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * Get variant option attributes for a product
   */
  async getVariantAttributes(productId: string) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    return this.prisma.productAttribute.findMany({
      where: { 
        productId,
        isVariantOption: true,
      },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * Get filterable attributes for a product
   */
  async getFilterableAttributes(productId: string) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    return this.prisma.productAttribute.findMany({
      where: { 
        productId,
        isFilterable: true,
      },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * Get common filterable attributes for a category
   */
  async getCategoryFilterableAttributes(categoryId: string) {
    // Get all products in this category
    const products = await this.prisma.product.findMany({
      where: {
        categories: {
          some: {
            categoryId,
          },
        },
      },
      select: {
        id: true,
      },
    });

    const productIds = products.map(p => p.id);

    // Get all filterable attributes for these products
    const attributes = await this.prisma.productAttribute.findMany({
      where: {
        productId: {
          in: productIds,
        },
        isFilterable: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Group attributes by name and count occurrences
    const attributeGroups = attributes.reduce((acc, attr) => {
      if (!acc[attr.name]) {
        acc[attr.name] = {
          name: attr.name,
          type: attr.type,
          values: new Set(),
          count: 0,
        };
      }
      
      acc[attr.name].values.add(attr.value);
      acc[attr.name].count++;
      
      return acc;
    }, {});

    // Convert to array and include only attributes that appear in multiple products
    return Object.values(attributeGroups)
      .filter((group: any) => group.count > 1)
      .map((group: any)  => ({
        name: group.name,
        type: group.type,
        values: Array.from(group.values),
      }));
  }
} 