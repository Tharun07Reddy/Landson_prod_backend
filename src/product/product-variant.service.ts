import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';

@Injectable()
export class ProductVariantService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new product variant
   */
  async create(productId: string, createVariantDto: CreateProductVariantDto) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    const { media, quantity, lowStockThreshold, backorderAllowed, ...variantData } = createVariantDto;

    try {
      // Create the variant
      const variant = await this.prisma.productVariant.create({
        data: {
          ...variantData,
          product: {
            connect: { id: productId },
          },
          // Add media if provided
          ...(media && {
            media: {
              create: media.map((m, index) => ({
                url: m.url,
                altText: m.altText,
                title: m.title,
                type: m.type || 'IMAGE',
                position: m.position || index,
              })),
            },
          }),
        },
        include: {
          media: true,
        },
      });

      // Create inventory record if quantity is provided
      if (quantity !== undefined) {
        await this.prisma.productInventory.create({
          data: {
            variant: {
              connect: { id: variant.id },
            },
            quantity,
            lowStockThreshold,
            backorderAllowed,
          },
        });
      }

      // Update product to indicate it has variants
      await this.prisma.product.update({
        where: { id: productId },
        data: { hasVariants: true },
      });

      // Fetch the complete variant with inventory
      return this.findOne(variant.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Variant with this SKU or barcode already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Find all variants for a product
   */
  async findAll(productId: string) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    return this.prisma.productVariant.findMany({
      where: {
        productId,
      },
      include: {
        media: {
          orderBy: {
            position: 'asc',
          },
        },
        inventory: true,
      },
      orderBy: {
        position: 'asc',
      },
    });
  }

  /**
   * Find a single variant by ID
   */
  async findOne(id: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      include: {
        media: {
          orderBy: {
            position: 'asc',
          },
        },
        inventory: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${id} not found`);
    }

    return variant;
  }

  /**
   * Update a variant
   */
  async update(id: string, updateVariantDto: any) {
    const { media, quantity, lowStockThreshold, backorderAllowed, ...variantData } = updateVariantDto;

    // Check if variant exists
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      include: {
        inventory: true,
      },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${id} not found`);
    }

    try {
      // Update the variant
      const updatedVariant = await this.prisma.productVariant.update({
        where: { id },
        data: variantData,
        include: {
          media: true,
          inventory: true,
        },
      });

      // Update inventory if provided
      if (quantity !== undefined) {
        if (variant.inventory) {
          await this.prisma.productInventory.update({
            where: { variantId: id },
            data: {
              quantity,
              ...(lowStockThreshold !== undefined && { lowStockThreshold }),
              ...(backorderAllowed !== undefined && { backorderAllowed }),
            },
          });
        } else {
          await this.prisma.productInventory.create({
            data: {
              variant: {
                connect: { id },
              },
              quantity,
              lowStockThreshold,
              backorderAllowed,
            },
          });
        }
      }

      // Fetch the updated variant with inventory
      return this.findOne(id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Variant with this SKU or barcode already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Delete a variant
   */
  async remove(id: string) {
    // Check if variant exists
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            variants: true,
          },
        },
      },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${id} not found`);
    }

    // Delete the variant (inventory will be cascade deleted)
    await this.prisma.productVariant.delete({
      where: { id },
    });

    // If this was the last variant, update the product
    if (variant.product.variants.length === 1) {
      await this.prisma.product.update({
        where: { id: variant.product.id },
        data: { hasVariants: false },
      });
    }

    return { id, message: 'Variant deleted successfully' };
  }
} 