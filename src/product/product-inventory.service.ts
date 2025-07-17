import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

@Injectable()
export class ProductInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Update inventory for a product
   */
  async updateForProduct(productId: string, updateInventoryDto: UpdateInventoryDto) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        inventory: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    // If product has variants, don't allow direct inventory update
    if (product.hasVariants) {
      throw new NotFoundException(`Product has variants. Please update variant inventory instead.`);
    }

    // Update or create inventory record
    if (product.inventory) {
      return this.prisma.productInventory.update({
        where: { id: product.inventory.id },
        data: updateInventoryDto,
      });
    } else {
      return this.prisma.productInventory.create({
        data: {
          ...updateInventoryDto,
          product: {
            connect: { id: productId },
          },
        },
      });
    }
  }

  /**
   * Update inventory for a variant
   */
  async updateForVariant(variantId: string, updateInventoryDto: UpdateInventoryDto) {
    // Check if variant exists
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        inventory: true,
      },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    // Update or create inventory record
    if (variant.inventory) {
      return this.prisma.productInventory.update({
        where: { id: variant.inventory.id },
        data: updateInventoryDto,
      });
    } else {
      return this.prisma.productInventory.create({
        data: {
          ...updateInventoryDto,
          variant: {
            connect: { id: variantId },
          },
        },
      });
    }
  }

  /**
   * Check if a product is in stock
   */
  async isInStock(productId: string, quantity = 1): Promise<boolean> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        inventory: true,
        variants: {
          include: {
            inventory: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    // If product has variants, check if any variant is in stock
    if (product.hasVariants) {
      return product.variants.some(variant => 
        variant.inventory && variant.inventory.quantity >= quantity
      );
    }

    // Otherwise check the product inventory
    return product.inventory 
      ? product.inventory.quantity >= quantity 
      : false;
  }

  /**
   * Check if a specific variant is in stock
   */
  async isVariantInStock(variantId: string, quantity = 1): Promise<boolean> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        inventory: true,
      },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    return variant.inventory 
      ? variant.inventory.quantity >= quantity 
      : false;
  }

  /**
   * Reserve inventory for a product or variant
   */
  async reserveInventory(
    options: {
      productId?: string;
      variantId?: string;
      quantity: number;
    }
  ) {
    const { productId, variantId, quantity } = options;

    if (!productId && !variantId) {
      throw new Error('Either productId or variantId must be provided');
    }

    if (productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        include: {
          inventory: true,
        },
      });

      if (!product) {
        throw new NotFoundException(`Product with ID ${productId} not found`);
      }

      if (!product.inventory) {
        throw new NotFoundException(`Product with ID ${productId} has no inventory record`);
      }

      if (product.inventory.quantity < quantity) {
        throw new Error(`Not enough inventory for product ${productId}`);
      }

      return this.prisma.productInventory.update({
        where: { id: product.inventory.id },
        data: {
          quantity: {
            decrement: quantity,
          },
          reservedQuantity: {
            increment: quantity,
          },
        },
      });
    }

    if (variantId) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: variantId },
        include: {
          inventory: true,
        },
      });

      if (!variant) {
        throw new NotFoundException(`Variant with ID ${variantId} not found`);
      }

      if (!variant.inventory) {
        throw new NotFoundException(`Variant with ID ${variantId} has no inventory record`);
      }

      if (variant.inventory.quantity < quantity) {
        throw new Error(`Not enough inventory for variant ${variantId}`);
      }

      return this.prisma.productInventory.update({
        where: { id: variant.inventory.id },
        data: {
          quantity: {
            decrement: quantity,
          },
          reservedQuantity: {
            increment: quantity,
          },
        },
      });
    }
  }

  /**
   * Release reserved inventory for a product or variant
   */
  async releaseInventory(
    options: {
      productId?: string;
      variantId?: string;
      quantity: number;
    }
  ) {
    const { productId, variantId, quantity } = options;

    if (!productId && !variantId) {
      throw new Error('Either productId or variantId must be provided');
    }

    if (productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        include: {
          inventory: true,
        },
      });

      if (!product || !product.inventory) {
        throw new NotFoundException(`Product inventory not found`);
      }

      return this.prisma.productInventory.update({
        where: { id: product.inventory.id },
        data: {
          quantity: {
            increment: quantity,
          },
          reservedQuantity: {
            decrement: Math.min(quantity, product.inventory.reservedQuantity),
          },
        },
      });
    }

    if (variantId) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: variantId },
        include: {
          inventory: true,
        },
      });

      if (!variant || !variant.inventory) {
        throw new NotFoundException(`Variant inventory not found`);
      }

      return this.prisma.productInventory.update({
        where: { id: variant.inventory.id },
        data: {
          quantity: {
            increment: quantity,
          },
          reservedQuantity: {
            decrement: Math.min(quantity, variant.inventory.reservedQuantity),
          },
        },
      });
    }
  }

  /**
   * Get low stock products
   */
  async getLowStockProducts() {
    // Get products with inventory below threshold
    const productInventory = await this.prisma.productInventory.findMany({
      where: {
        productId: { not: null },
        lowStockThreshold: { not: null },
        quantity: {
          lte: this.prisma.productInventory.fields.lowStockThreshold,
        },
      },
      include: {
        product: {
          include: {
            media: {
              take: 1,
              orderBy: {
                position: 'asc',
              },
            },
          },
        },
      },
    });

    // Get variants with inventory below threshold
    const variantInventory = await this.prisma.productInventory.findMany({
      where: {
        variantId: { not: null },
        lowStockThreshold: { not: null },
        quantity: {
          lte: this.prisma.productInventory.fields.lowStockThreshold,
        },
      },
      include: {
        variant: {
          include: {
            product: {
              include: {
                media: {
                  take: 1,
                  orderBy: {
                    position: 'asc',
                  },
                },
              },
            },
            media: {
              take: 1,
              orderBy: {
                position: 'asc',
              },
            },
          },
        },
      },
    });

    return {
      products: productInventory.map(inv => ({
        ...inv.product,
        inventory: {
          quantity: inv.quantity,
          lowStockThreshold: inv.lowStockThreshold,
          backorderAllowed: inv.backorderAllowed,
        },
      })),
      variants: variantInventory.map(inv => ({
        ...inv.variant,
        inventory: {
          quantity: inv.quantity,
          lowStockThreshold: inv.lowStockThreshold,
          backorderAllowed: inv.backorderAllowed,
        },
      })),
    };
  }

  /**
   * Get out of stock products
   */
  async getOutOfStockProducts() {
    // Get products that are out of stock
    const productInventory = await this.prisma.productInventory.findMany({
      where: {
        productId: { not: null },
        quantity: 0,
      },
      include: {
        product: {
          include: {
            media: {
              take: 1,
              orderBy: {
                position: 'asc',
              },
            },
          },
        },
      },
    });

    // Get variants that are out of stock
    const variantInventory = await this.prisma.productInventory.findMany({
      where: {
        variantId: { not: null },
        quantity: 0,
      },
      include: {
        variant: {
          include: {
            product: {
              include: {
                media: {
                  take: 1,
                  orderBy: {
                    position: 'asc',
                  },
                },
              },
            },
            media: {
              take: 1,
              orderBy: {
                position: 'asc',
              },
            },
          },
        },
      },
    });

    return {
      products: productInventory.map(inv => ({
        ...inv.product,
        inventory: {
          quantity: inv.quantity,
          lowStockThreshold: inv.lowStockThreshold,
          backorderAllowed: inv.backorderAllowed,
        },
      })),
      variants: variantInventory.map(inv => ({
        ...inv.variant,
        inventory: {
          quantity: inv.quantity,
          lowStockThreshold: inv.lowStockThreshold,
          backorderAllowed: inv.backorderAllowed,
        },
      })),
    };
  }
} 