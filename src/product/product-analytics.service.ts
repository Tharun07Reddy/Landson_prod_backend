import { Injectable, Inject, Optional } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { Request } from 'express';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class ProductAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(REQUEST) private readonly request: Request,
    private readonly analyticsService: AnalyticsService,
  ) {}

  /**
   * Track product view
   */
  async trackProductView(productId: string) {
    try {
      // Extract data from request if available
      const userId = this.request?.user?.['id'];
      const sessionId = this.request?.cookies?.['sessionId'];
      const analyticsId = this.request?.cookies?.['analyticsId'];
      const userAgent = this.request?.headers?.['user-agent'];
      const referer = this.request?.headers?.['referer'];
      const ip = this.request?.ip;

      // Create device info object
      const deviceInfo = userAgent ? {
        userAgent,
        ip,
      } : undefined;

      // Record view in database
      await this.prisma.productView.create({
        data: {
          productId,
          userId,
          sessionId,
          analyticsId,
          deviceInfo,
          referer,
        },
      });

      // Increment product view count
      await this.prisma.product.update({
        where: { id: productId },
        data: {
          viewCount: {
            increment: 1,
          },
        },
      });

      // Track event in analytics system
      await this.analyticsService.trackEvent({
        type: 'PRODUCT_VIEW',
        source: 'product-service',
        userId,
        sessionId,
        properties: {
          productId,
          analyticsId,
        },
        metadata: {
          ip,
          userAgent,
          referer,
        },
      });

      return true;
    } catch (error) {
      console.error('Failed to track product view:', error);
      return false;
    }
  }

  /**
   * Track product search
   */
  async trackProductSearch(searchData: {
    query: string;
    filters?: Record<string, any>;
    sortBy?: string;
    resultCount: number;
    clickedProductId?: string;
  }) {
    try {
      const { query, filters, sortBy, resultCount, clickedProductId } = searchData;
      
      // Extract data from request if available
      const userId = this.request?.user?.['id'];
      const sessionId = this.request?.cookies?.['sessionId'];
      const analyticsId = this.request?.cookies?.['analyticsId'];
      const userAgent = this.request?.headers?.['user-agent'];
      const referer = this.request?.headers?.['referer'];
      const ip = this.request?.ip;

      // Record search in database
      await this.prisma.productSearch.create({
        data: {
          query,
          userId,
          sessionId,
          analyticsId,
          resultCount,
          filters: filters || undefined,
          sortBy,
          clickedProductId,
        },
      });

      // Track event in analytics system
      await this.analyticsService.trackEvent({
        type: 'PRODUCT_SEARCH',
        source: 'product-service',
        userId,
        sessionId,
        properties: {
          query,
          filters,
          sortBy,
          resultCount,
          clickedProductId,
          analyticsId,
        },
        metadata: {
          ip,
          userAgent,
          referer,
        },
      });

      return true;
    } catch (error) {
      console.error('Failed to track product search:', error);
      return false;
    }
  }

  /**
   * Get popular products based on views
   */
  async getPopularProducts(limit = 10) {
    return this.prisma.product.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        viewCount: 'desc',
      },
      take: limit,
      include: {
        media: {
          take: 1,
          orderBy: {
            position: 'asc',
          },
        },
      },
    });
  }

  /**
   * Get trending products based on recent views
   */
  async getTrendingProducts(days = 7, limit = 10) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get products with most views in the last X days
    const productViews = await this.prisma.productView.groupBy({
      by: ['productId'],
      where: {
        timestamp: {
          gte: startDate,
        },
      },
      _count: {
        productId: true,
      },
      orderBy: {
        _count: {
          productId: 'desc',
        },
      },
      take: limit,
    });

    const productIds = productViews.map(pv => pv.productId);

    // Get the actual product data
    if (productIds.length === 0) {
      return [];
    }

    return this.prisma.product.findMany({
      where: {
        id: {
          in: productIds,
        },
        isActive: true,
      },
      include: {
        media: {
          take: 1,
          orderBy: {
            position: 'asc',
          },
        },
      },
      // Preserve the order from the analytics query
      orderBy: {
        viewCount: 'desc',
      },
    });
  }

  /**
   * Get product view statistics
   */
  async getProductViewStats(productId: string, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Group views by day
    const dailyViews = await this.prisma.productView.groupBy({
      by: ['timestamp'],
      where: {
        productId,
        timestamp: {
          gte: startDate,
        },
      },
      _count: {
        id: true,
      },
    });

    // Format the results
    const stats = dailyViews.map(item => ({
      date: item.timestamp.toISOString().split('T')[0],
      views: item._count.id,
    }));

    return stats;
  }

  /**
   * Get top search queries
   */
  async getTopSearchQueries(limit = 10) {
    return this.prisma.productSearch.groupBy({
      by: ['query'],
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
  }

  /**
   * Get search queries with no results
   */
  async getZeroResultSearches(limit = 10) {
    return this.prisma.productSearch.groupBy({
      by: ['query'],
      where: {
        resultCount: 0,
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
  }
} 