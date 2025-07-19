import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateFreeItemDto } from './dto/create-free-item.dto';
import { UpdateFreeItemDto } from './dto/update-free-item.dto';
import { FreeItemQueryDto } from './dto/free-item-query.dto';
import { AttachFreeItemDto, AttachProductDto } from './dto/attach-free-item.dto';

@Injectable()
export class FreeItemService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new free item
   */
  async create(createFreeItemDto: CreateFreeItemDto) {
    const { productIds, ...freeItemData } = createFreeItemDto;

    try {
      // Create the free item
      const freeItem = await this.prisma.freeItem.create({
        data: {
          ...freeItemData,
        },
      });

      // If product IDs are provided, attach them to the free item
      if (productIds && productIds.length > 0) {
        await this.prisma.freeItemProduct.createMany({
          data: productIds.map(productId => ({
            freeItemId: freeItem.id,
            productId,
          })),
          skipDuplicates: true,
        });
      }

      return this.findOne(freeItem.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Free item with this name already exists');
        }
        if (error.code === 'P2003') {
          throw new BadRequestException('Invalid product ID provided');
        }
      }
      throw error;
    }
  }

  /**
   * Find all free items with filtering, pagination, and sorting
   */
  async findAll(query: FreeItemQueryDto) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isActive,
      search,
    } = query;

    const skip = (page - 1) * limit;
    
    // Build where clause based on filters
    const where: Prisma.FreeItemWhereInput = {};
    
    if (isActive !== undefined) {
      where.isActive = isActive;
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    // Execute query with pagination
    const [freeItems, total] = await Promise.all([
      this.prisma.freeItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      }),
      this.prisma.freeItem.count({ where }),
    ]);
    
    return {
      data: freeItems,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find a single free item by ID
   */
  async findOne(id: string) {
    const freeItem = await this.prisma.freeItem.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                price: true,
                media: {
                  orderBy: {
                    position: 'asc',
                  },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!freeItem) {
      throw new NotFoundException(`Free item with ID ${id} not found`);
    }

    return freeItem;
  }

  /**
   * Update a free item
   */
  async update(id: string, updateFreeItemDto: UpdateFreeItemDto) {
    const { productIds, ...freeItemData } = updateFreeItemDto;

    // Check if free item exists
    await this.findOne(id);

    try {
      // Update the free item
      const updatedFreeItem = await this.prisma.freeItem.update({
        where: { id },
        data: freeItemData,
      });

      // If product IDs are provided, update the relationships
      if (productIds) {
        // First, remove all existing relationships
        await this.prisma.freeItemProduct.deleteMany({
          where: { freeItemId: id },
        });

        // Then create new relationships
        if (productIds.length > 0) {
          await this.prisma.freeItemProduct.createMany({
            data: productIds.map(productId => ({
              freeItemId: id,
              productId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return this.findOne(id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Free item with this name already exists');
        }
        if (error.code === 'P2003') {
          throw new BadRequestException('Invalid product ID provided');
        }
      }
      throw error;
    }
  }

  /**
   * Remove a free item
   */
  async remove(id: string) {
    // Check if free item exists
    await this.findOne(id);

    // Delete the free item (cascade will handle relationships)
    await this.prisma.freeItem.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Attach a free item to multiple products
   */
  async attachToProducts(attachDto: AttachFreeItemDto) {
    const { freeItemId, productIds } = attachDto;

    // Check if free item exists
    await this.findOne(freeItemId);

    // Check if all products exist
    for (const productId of productIds) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new NotFoundException(`Product with ID ${productId} not found`);
      }
    }

    // Create relationships
    await this.prisma.freeItemProduct.createMany({
      data: productIds.map(productId => ({
        freeItemId,
        productId,
      })),
      skipDuplicates: true,
    });

    return this.findOne(freeItemId);
  }

  /**
   * Detach a free item from a product
   */
  async detachFromProduct(freeItemId: string, productId: string) {
    // Check if relationship exists
    const relationship = await this.prisma.freeItemProduct.findFirst({
      where: {
        freeItemId,
        productId,
      },
    });

    if (!relationship) {
      throw new NotFoundException(
        `Relationship between free item ${freeItemId} and product ${productId} not found`,
      );
    }

    // Delete the relationship
    await this.prisma.freeItemProduct.delete({
      where: { id: relationship.id },
    });

    return { success: true };
  }

  /**
   * Get all free items for a product
   */
  async findByProduct(productId: string) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    // Get all free items for the product
    const freeItemProducts = await this.prisma.freeItemProduct.findMany({
      where: { productId },
      include: {
        freeItem: true,
      },
    });

    return freeItemProducts.map(fip => fip.freeItem);
  }

  /**
   * Attach multiple free items to a product
   */
  async attachToProduct(attachDto: AttachProductDto) {
    const { productId, freeItemIds } = attachDto;

    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    // Check if all free items exist
    for (const freeItemId of freeItemIds) {
      await this.findOne(freeItemId);
    }

    // Create relationships
    await this.prisma.freeItemProduct.createMany({
      data: freeItemIds.map(freeItemId => ({
        freeItemId,
        productId,
      })),
      skipDuplicates: true,
    });

    return this.findByProduct(productId);
  }
} 