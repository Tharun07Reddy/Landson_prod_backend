import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { SearchQueryDto } from './dto/search-query.dto';

@Injectable()
export class ProductSearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search products with advanced filtering
   */
  async search(query: SearchQueryDto) {
    const {
      q = '',
      page = 1,
      limit = 20,
      sortBy = 'relevance',
      sortOrder = 'desc',
      categoryId,
      minPrice,
      maxPrice,
      filters = {},
      includeOutOfStock = false,
    } = query;

    const skip = (page - 1) * limit;
    
    // Build the base where clause
    const where: Prisma.ProductWhereInput = {
      isActive: true,
    };

    // Add search term filter
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { shortDescription: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { searchKeywords: { has: q } },
      ];
    }

    // Add category filter
    if (categoryId) {
      where.categories = {
        some: {
          categoryId,
        },
      };
    }

    // Add price range filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      
      if (minPrice !== undefined) {
        where.price.gte = minPrice;
      }
      
      if (maxPrice !== undefined) {
        where.price.lte = maxPrice;
      }
    }

    // Add inventory filter
    if (!includeOutOfStock) {
      where.OR = [
        ...(where.OR || []),
        {
          inventory: {
            quantity: {
              gt: 0,
            },
          },
        },
        {
          variants: {
            some: {
              inventory: {
                quantity: {
                  gt: 0,
                },
              },
            },
          },
        },
      ];
    }

    // Add dynamic attribute filters
    if (Object.keys(filters).length > 0) {
      const attributeFilters = Object.entries(filters).map(([name, value]) => ({
        attributes: {
          some: {
            name,
            value: Array.isArray(value) 
              ? { in: value.map(v => String(v)) } 
              : String(value),
            isFilterable: true,
          },
        },
      }));

      if (attributeFilters.length > 0) {
        // Convert to array if needed
        const existingAnd = Array.isArray(where.AND) ? where.AND : (where.AND ? [where.AND] : []);
        where.AND = [...existingAnd, ...attributeFilters];
      }
    }

    // Determine sorting
    let orderBy: Prisma.ProductOrderByWithRelationInput = {};
    
    switch (sortBy) {
      case 'price':
        orderBy = { price: sortOrder };
        break;
      case 'name':
        orderBy = { name: sortOrder };
        break;
      case 'newest':
        orderBy = { createdAt: sortOrder };
        break;
      case 'popularity':
        orderBy = { viewCount: sortOrder };
        break;
      case 'bestselling':
        orderBy = { purchaseCount: sortOrder };
        break;
      case 'relevance':
      default:
        // For relevance sorting with a search term, we'll use multiple fields
        if (q) {
          // If searching, prioritize exact matches in name, then description
          orderBy = {
            name: sortOrder
          };
          // We can't use conditional expressions in the orderBy, so we'll prioritize by name
          // and then use other fields as secondary sort criteria
        } else {
          // Default sorting if no search term
          orderBy = { updatedAt: 'desc' };
        }
        break;
    }

    // Execute search query with pagination
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
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
          variants: {
            select: {
              id: true,
              name: true,
              price: true,
              options: true,
              inventory: {
                select: {
                  quantity: true,
                },
              },
            },
            take: 5, // Limit number of variants returned
          },
          _count: {
            select: {
              reviews: true,
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    // Get available filters based on search results
    const availableFilters = await this.getAvailableFilters(where);

    return {
      data: products,
      filters: availableFilters,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        query: q,
      },
    };
  }

  /**
   * Get available filters based on the current search
   */
  private async getAvailableFilters(baseWhere: Prisma.ProductWhereInput) {
    // Get all filterable attributes for products matching the base query
    const filterableAttributes = await this.prisma.productAttribute.findMany({
      where: {
        product: baseWhere,
        isFilterable: true,
      },
      select: {
        name: true,
        value: true,
        type: true,
      },
      distinct: ['name', 'value'],
      orderBy: {
        name: 'asc',
      },
    });

    // Group attributes by name
    const filters = filterableAttributes.reduce((acc, attr) => {
      if (!acc[attr.name]) {
        acc[attr.name] = {
          name: attr.name,
          type: attr.type,
          values: [],
        };
      }
      
      if (!acc[attr.name].values.includes(attr.value)) {
        acc[attr.name].values.push(attr.value);
      }
      
      return acc;
    }, {});

    // Add price range filter
    const priceStats = await this.prisma.product.aggregate({
      where: baseWhere,
      _min: {
        price: true,
      },
      _max: {
        price: true,
      },
    });

    filters['price'] = {
      name: 'price',
      type: 'RANGE',
      min: priceStats._min.price,
      max: priceStats._max.price,
    };

    return Object.values(filters);
  }

  /**
   * Get search suggestions based on partial query
   */
  async getSuggestions(query: string, limit = 5) {
    if (!query || query.length < 2) {
      return [];
    }

    // Search for products matching the query
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { searchKeywords: { has: query } },
        ],
      },
      select: {
        name: true,
        slug: true,
      },
      take: limit,
    });

    // Get popular search terms containing the query
    const searchTerms = await this.prisma.productSearch.groupBy({
      by: ['query'],
      where: {
        query: {
          contains: query,
          mode: 'insensitive',
        },
        resultCount: {
          gt: 0, // Only include searches that had results
        },
      },
      _count: {
        query: true,
      },
      orderBy: {
        _count: {
          query: 'desc',
        },
      },
      take: limit,
    });

    return {
      products: products.map(p => ({
        name: p.name,
        slug: p.slug,
        type: 'product',
      })),
      terms: searchTerms.map(s => ({
        term: s.query,
        count: s._count.query,
        type: 'search',
      })),
    };
  }
} 