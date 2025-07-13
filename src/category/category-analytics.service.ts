import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CategoryViewData {
  categoryId: string;
  userId?: string;
  sessionId?: string;
  deviceInfo?: Record<string, any>;
  referer?: string;
}

interface CategoryAnalytics {
  categoryId: string;
  categoryName: string;
  totalViews: number;
  uniqueVisitors: number;
  averageDailyViews: number;
  viewsByDay: Array<{
    date: string;
    views: number;
  }>;
}

interface TopCategory {
  id: string;
  name: string;
  views: number;
  slug: string;
}

@Injectable()
export class CategoryAnalyticsService {
  private readonly logger = new Logger(CategoryAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a category view
   */
  async recordView(data: CategoryViewData): Promise<boolean> {
    try {
      await this.prisma.categoryView.create({
        data: {
          categoryId: data.categoryId,
          userId: data.userId,
          sessionId: data.sessionId,
          deviceInfo: data.deviceInfo,
          referer: data.referer,
        },
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Error recording category view: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Get analytics for a specific category
   */
  async getCategoryAnalytics(categoryId: string, days = 30): Promise<CategoryAnalytics | null> {
    try {
      // Check if category exists
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
        select: { name: true },
      });
      
      if (!category) {
        return null;
      }
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Get total views
      const totalViews = await this.prisma.categoryView.count({
        where: {
          categoryId,
          timestamp: {
            gte: startDate,
          },
        },
      });
      
      // Get unique visitors
      const uniqueVisitors = await this.prisma.$queryRaw<number>`
        SELECT COUNT(DISTINCT COALESCE("userId", "sessionId")) 
        FROM "CategoryView"
        WHERE "categoryId" = ${categoryId}
        AND "timestamp" >= ${startDate}
      `;
      
      // Get views by day
      const viewsByDay = await this.prisma.$queryRaw<Array<{ date: string; views: number }>>`
        SELECT 
          TO_CHAR("timestamp", 'YYYY-MM-DD') as date,
          COUNT(*) as views
        FROM "CategoryView"
        WHERE "categoryId" = ${categoryId}
        AND "timestamp" >= ${startDate}
        GROUP BY TO_CHAR("timestamp", 'YYYY-MM-DD')
        ORDER BY date ASC
      `;
      
      // Calculate average daily views
      const averageDailyViews = totalViews / days;
      
      return {
        categoryId,
        categoryName: category.name,
        totalViews,
        uniqueVisitors: Number(uniqueVisitors),
        averageDailyViews,
        viewsByDay,
      };
    } catch (error) {
      this.logger.error(`Error getting category analytics: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get top viewed categories
   */
  async getTopCategories(limit = 10, days = 30): Promise<TopCategory[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const topCategories = await this.prisma.$queryRaw<TopCategory[]>`
        SELECT 
          c.id,
          c.name,
          c.slug,
          COUNT(cv.id) as views
        FROM "Category" c
        JOIN "CategoryView" cv ON c.id = cv."categoryId"
        WHERE cv.timestamp >= ${startDate}
        GROUP BY c.id, c.name, c.slug
        ORDER BY views DESC
        LIMIT ${limit}
      `;
      
      return topCategories;
    } catch (error) {
      this.logger.error(`Error getting top categories: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get referrer statistics for a category
   */
  async getReferrerStats(categoryId: string, days = 30): Promise<Array<{ referer: string; count: number }>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const referrerStats = await this.prisma.$queryRaw<Array<{ referer: string; count: number }>>`
        SELECT 
          COALESCE(referer, 'direct') as referer,
          COUNT(*) as count
        FROM "CategoryView"
        WHERE "categoryId" = ${categoryId}
        AND "timestamp" >= ${startDate}
        GROUP BY COALESCE(referer, 'direct')
        ORDER BY count DESC
      `;
      
      return referrerStats;
    } catch (error) {
      this.logger.error(`Error getting referrer stats: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get device type statistics for a category
   */
  async getDeviceStats(categoryId: string, days = 30): Promise<Array<{ deviceType: string; count: number }>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const deviceStats = await this.prisma.$queryRaw<Array<{ deviceType: string; count: number }>>`
        SELECT 
          COALESCE(("deviceInfo"->>'deviceType'), 'unknown') as "deviceType",
          COUNT(*) as count
        FROM "CategoryView"
        WHERE "categoryId" = ${categoryId}
        AND "timestamp" >= ${startDate}
        GROUP BY COALESCE(("deviceInfo"->>'deviceType'), 'unknown')
        ORDER BY count DESC
      `;
      
      return deviceStats;
    } catch (error) {
      this.logger.error(`Error getting device stats: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Clean up old analytics data (can be run as a scheduled task)
   */
  async cleanupOldData(olderThanDays = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      const result = await this.prisma.categoryView.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate,
          },
        },
      });
      
      return result.count;
    } catch (error) {
      this.logger.error(`Error cleaning up old analytics data: ${error.message}`, error.stack);
      return 0;
    }
  }
} 