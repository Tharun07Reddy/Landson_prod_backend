import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductAnalyticsService } from './product-analytics.service';
import { generateSlug } from '../utils/string-utils';

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productAnalytics: ProductAnalyticsService,
  ) {}

  /**
   * Create a new product
   */
  async create(createProductDto: CreateProductDto) {
    const { categories, attributes, variants, media, ...productData } = createProductDto;

    // Generate slug if not provided
    let slug: string;
    if (!productData.slug) {
      slug = await this.generateUniqueSlug(productData.name);
    } else {
      // Validate slug is unique
      const existingProduct = await this.prisma.product.findUnique({
        where: { slug: productData.slug },
      });
      
      if (existingProduct) {
        throw new BadRequestException(`Product with slug '${productData.slug}' already exists`);
      }
      slug = productData.slug;
    }

    // Create product with nested relations
    try {
      const product = await this.prisma.product.create({
        data: {
          ...productData,
          slug, // Ensure slug is always a string
          // Connect categories if provided
          ...(categories && {
            categories: {
              create: categories.map(categoryId => ({
                category: { connect: { id: categoryId } },
                isPrimary: categories.indexOf(categoryId) === 0, // First category is primary
              })),
            },
          }),
          // Create attributes if provided
          ...(attributes && {
            attributes: {
              create: attributes.map(attr => ({
                name: attr.name,
                value: attr.value,
                type: attr.type,
                isFilterable: attr.isFilterable || false,
                isSearchable: attr.isSearchable || false,
                isVariantOption: attr.isVariantOption || false,
                position: attr.position || 0,
              })),
            },
          }),
          // Create media if provided
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
          categories: {
            include: {
              category: true,
            },
          },
          attributes: true,
          media: true,
        },
      });

      // Create variants if provided
      if (variants && variants.length > 0) {
        // Update product to indicate it has variants
        await this.prisma.product.update({
          where: { id: product.id },
          data: { hasVariants: true },
        });

        // Create each variant separately
        for (const variant of variants) {
          await this.prisma.productVariant.create({
            data: {
              name: variant.name,
              sku: variant.sku,
              barcode: variant.barcode,
              price: variant.price,
              compareAtPrice: variant.compareAtPrice,
              dealerPrice: variant.dealerPrice,
              isActive: variant.isActive ?? true,
              position: variant.position ?? 0,
              options: variant.options,
              product: {
                connect: { id: product.id }
              }
            }
          });
        }
      }

      return product;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Product with this SKU or barcode already exists');
        }
        if (error.code === 'P2003') {
          throw new BadRequestException('Invalid category ID provided');
        }
      }
      throw error;
    }
  }

  /**
   * Find all products with filtering, pagination, and sorting
   */
  async findAll(query: ProductQueryDto) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isActive,
      isFeatured,
      categoryId,
      minPrice,
      maxPrice,
      search,
      hasVariants,
    } = query;

    const skip = (page - 1) * limit;
    
    // Build where clause based on filters
    const where: Prisma.ProductWhereInput = {};
    
    if (isActive !== undefined) {
      where.isActive = isActive;
    }
    
    if (isFeatured !== undefined) {
      where.isFeatured = isFeatured;
    }
    
    if (categoryId) {
      where.categories = {
        some: {
          categoryId,
        },
      };
    }
    
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      
      if (minPrice !== undefined) {
        where.price.gte = minPrice;
      }
      
      if (maxPrice !== undefined) {
        where.price.lte = maxPrice;
      }
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (hasVariants !== undefined) {
      where.hasVariants = hasVariants;
    }
    
    // Execute query with pagination
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          categories: {
            include: {
              category: true,
            },
          },
          media: {
            orderBy: {
              position: 'asc',
            },
            take: 1, // Just get the primary image for listing
          },
          _count: {
            select: {
              variants: true,
              reviews: true,
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    
    return {
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find a single product by ID
   */
  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        categories: {
          include: {
            category: true,
          },
        },
        attributes: {
          orderBy: {
            position: 'asc',
          },
        },
        media: {
          orderBy: {
            position: 'asc',
          },
        },
        variants: {
          include: {
            media: true,
            inventory: true,
          },
          orderBy: {
            position: 'asc',
          },
        },
        inventory: true,
        reviews: {
          where: {
            isApproved: true,
          },
          take: 5,
          orderBy: {
            createdAt: 'desc',
          },
        },
        relatedProducts: {
          include: {
            targetProduct: {
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
          orderBy: {
            position: 'asc',
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  /**
   * Find a single product by slug
   */
  async findBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        categories: {
          include: {
            category: true,
          },
        },
        attributes: {
          orderBy: {
            position: 'asc',
          },
        },
        media: {
          orderBy: {
            position: 'asc',
          },
        },
        variants: {
          include: {
            media: true,
            inventory: true,
          },
          orderBy: {
            position: 'asc',
          },
        },
        inventory: true,
        reviews: {
          where: {
            isApproved: true,
          },
          take: 5,
          orderBy: {
            createdAt: 'desc',
          },
        },
        relatedProducts: {
          include: {
            targetProduct: {
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
          orderBy: {
            position: 'asc',
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with slug ${slug} not found`);
    }

    // Track product view
    this.productAnalytics.trackProductView(product.id).catch(error => {
      console.error('Failed to track product view:', error);
    });

    return product;
  }

  /**
   * Update a product
   */
  async update(id: string, updateProductDto: UpdateProductDto) {
    const { categories, attributes, variants, media, ...productData } = updateProductDto;

    // Check if product exists
    const existingProduct = await this.prisma.product.findUnique({
      where: { id },
      include: {
        categories: true,
        attributes: true,
      },
    });

    if (!existingProduct) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    // If slug is being updated, ensure it's unique
    if (productData.slug && productData.slug !== existingProduct.slug) {
      const slugExists = await this.prisma.product.findUnique({
        where: { slug: productData.slug },
      });
      
      if (slugExists) {
        throw new BadRequestException(`Product with slug '${productData.slug}' already exists`);
      }
    }

    // Update product basic data
    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: productData, // This now excludes media, categories, attributes, variants
        include: {
          categories: {
            include: {
              category: true,
            },
          },
          attributes: true,
          media: true,
        },
      });

      // Handle media separately if provided
      if (media && media.length > 0) {
        for (const mediaItem of media) {
          await this.prisma.productMedia.create({
            data: {
              url: mediaItem.url,
              altText: mediaItem.altText,
              title: mediaItem.title,
              type: mediaItem.type || 'IMAGE',
              position: mediaItem.position || 0,
              product: {
                connect: { id }
              }
            }
          });
        }
      }

      // Handle variants separately if provided
      if (variants && variants.length > 0) {
        // Update product to indicate it has variants if not already set
        if (!existingProduct.hasVariants) {
          await this.prisma.product.update({
            where: { id },
            data: { hasVariants: true },
          });
        }

        // This would need a more complex implementation to handle variant updates
        // For now, we'll just indicate that variants should be updated separately
      }

      return product;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Product with this SKU or barcode already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Delete a product
   */
  async remove(id: string) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    // Delete product and all related records via cascading delete
    await this.prisma.product.delete({
      where: { id },
    });

    return { id, message: 'Product deleted successfully' };
  }

  /**
   * Generate a unique slug for a product
   */
  private async generateUniqueSlug(name: string): Promise<string> {
    let slug = generateSlug(name);
    let isUnique = false;
    let counter = 0;
    let candidateSlug = slug;

    while (!isUnique) {
      const existingProduct = await this.prisma.product.findUnique({
        where: { slug: candidateSlug },
      });

      if (!existingProduct) {
        isUnique = true;
      } else {
        counter++;
        candidateSlug = `${slug}-${counter}`;
      }
    }

    return candidateSlug;
  }

  /**
   * Find featured products
   */
  async findFeatured(limit = 8) {
    return this.prisma.product.findMany({
      where: {
        isFeatured: true,
        isActive: true,
      },
      take: limit,
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        media: {
          take: 1,
          orderBy: {
            position: 'asc',
          },
        },
        categories: {
          include: {
            category: true,
          },
        },
      },
    });
  }

  /**
   * Find products by category
   */
  async findByCategory(categoryId: string, limit = 12, page = 1) {
    const skip = (page - 1) * limit;
    
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          isActive: true,
          categories: {
            some: {
              categoryId,
            },
          },
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          media: {
            take: 1,
            orderBy: {
              position: 'asc',
            },
          },
          categories: {
            include: {
              category: true,
            },
          },
        },
      }),
      this.prisma.product.count({
        where: {
          isActive: true,
          categories: {
            some: {
              categoryId,
            },
          },
        },
      }),
    ]);
    
    return {
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find related products
   */
  async findRelated(productId: string, limit = 4) {
    // First check for explicitly defined related products
    const explicitRelated = await this.prisma.productRelation.findMany({
      where: {
        sourceProductId: productId,
      },
      include: {
        targetProduct: {
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
      take: limit,
    });

    if (explicitRelated.length >= limit) {
      return explicitRelated.map(relation => relation.targetProduct);
    }

    // If not enough explicit relations, find products in same categories
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        categories: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    const categoryIds = product.categories.map(pc => pc.categoryId);
    
    const relatedByCategoryIds = await this.prisma.product.findMany({
      where: {
        id: { not: productId }, // Exclude the current product
        isActive: true,
        categories: {
          some: {
            categoryId: { in: categoryIds },
          },
        },
      },
      take: limit - explicitRelated.length,
      orderBy: {
        viewCount: 'desc', // Show most popular products first
      },
      include: {
        media: {
          take: 1,
          orderBy: {
            position: 'asc',
          },
        },
      },
    });

    // Combine both types of related products
    return [
      ...explicitRelated.map(relation => relation.targetProduct),
      ...relatedByCategoryIds,
    ];
  }

  /**
   * Find products with free items
   */
  async findWithFreeItems(limit = 10, page = 1) {
    const skip = (page - 1) * limit;
    
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          freeItems: {
            some: {},
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          media: {
            orderBy: {
              position: 'asc',
            },
            take: 1,
          },
          freeItems: {
            include: {
              freeItem: true,
            },
          },
        },
      }),
      this.prisma.product.count({
        where: {
          freeItems: {
            some: {},
          },
        },
      }),
    ]);
    
    return {
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
} 