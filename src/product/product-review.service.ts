import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductReviewDto } from './dto/create-product-review.dto';

interface ReviewQueryOptions {
  page?: number;
  limit?: number;
  approved?: boolean;
}

@Injectable()
export class ProductReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new product review
   */
  async create(productId: string, reviewDto: CreateProductReviewDto & { userId?: string }) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    // Check if user has already reviewed this product
    if (reviewDto.userId) {
      const existingReview = await this.prisma.productReview.findFirst({
        where: {
          productId,
          userId: reviewDto.userId,
        },
      });

      if (existingReview) {
        throw new BadRequestException('You have already reviewed this product');
      }
    }

    // Create the review
    const review = await this.prisma.productReview.create({
      data: {
        title: reviewDto.title,
        content: reviewDto.content,
        rating: reviewDto.rating,
        userId: reviewDto.userId,
        product: {
          connect: { id: productId },
        },
        // Auto-approve if no user ID (anonymous) or based on settings
        isApproved: !reviewDto.userId,
      },
    });

    // Update product rating statistics (async)
    this.updateProductRatingStats(productId).catch(error => {
      console.error('Failed to update product rating stats:', error);
    });

    return review;
  }

  /**
   * Find all reviews for a product
   */
  async findAll(productId: string, options: ReviewQueryOptions = {}) {
    const { 
      page = 1, 
      limit = 10,
      approved = true,
    } = options;
    
    const skip = (page - 1) * limit;

    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    const [reviews, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where: {
          productId,
          isApproved: approved,
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.productReview.count({
        where: {
          productId,
          isApproved: approved,
        },
      }),
    ]);

    return {
      data: reviews,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find all reviews that need moderation
   */
  async findPendingReviews(options: ReviewQueryOptions = {}) {
    const { 
      page = 1, 
      limit = 10,
    } = options;
    
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where: {
          isApproved: false,
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      }),
      this.prisma.productReview.count({
        where: {
          isApproved: false,
        },
      }),
    ]);

    return {
      data: reviews,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single review by ID
   */
  async findOne(id: string) {
    const review = await this.prisma.productReview.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    return review;
  }

  /**
   * Approve a review
   */
  async approve(id: string) {
    const review = await this.prisma.productReview.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    const updatedReview = await this.prisma.productReview.update({
      where: { id },
      data: {
        isApproved: true,
      },
    });

    // Update product rating statistics (async)
    this.updateProductRatingStats(review.productId).catch(error => {
      console.error('Failed to update product rating stats:', error);
    });

    return updatedReview;
  }

  /**
   * Add merchant response to a review
   */
  async respondToReview(id: string, response: string) {
    const review = await this.prisma.productReview.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    return this.prisma.productReview.update({
      where: { id },
      data: {
        response,
        responseAt: new Date(),
      },
    });
  }

  /**
   * Mark a review as helpful
   */
  async markHelpful(id: string) {
    const review = await this.prisma.productReview.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    return this.prisma.productReview.update({
      where: { id },
      data: {
        helpfulCount: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Report a review
   */
  async reportReview(id: string) {
    const review = await this.prisma.productReview.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    return this.prisma.productReview.update({
      where: { id },
      data: {
        reportCount: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Delete a review
   */
  async remove(id: string) {
    const review = await this.prisma.productReview.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    await this.prisma.productReview.delete({
      where: { id },
    });

    // Update product rating statistics (async)
    this.updateProductRatingStats(review.productId).catch(error => {
      console.error('Failed to update product rating stats:', error);
    });

    return { id, message: 'Review deleted successfully' };
  }

  /**
   * Update product rating statistics
   */
  private async updateProductRatingStats(productId: string) {
    // Instead of updating fields directly, we'll just recalculate the stats
    // and make them available when needed through a separate method
    
    // This is handled asynchronously, so no need to return anything
    // In a real-world scenario, you might want to store this in a cache
    // or a separate analytics table
  }

  /**
   * Get review statistics for a product
   */
  async getProductReviewStats(productId: string) {
    // Get all approved reviews for the product
    const reviews = await this.prisma.productReview.findMany({
      where: {
        productId,
        isApproved: true,
      },
      select: {
        rating: true,
      },
    });

    // Calculate average rating
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = reviews.length > 0 ? totalRating / reviews.length : 0;

    // Count reviews by rating
    const ratingCounts = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };

    reviews.forEach(review => {
      ratingCounts[review.rating.toString()]++;
    });

    return {
      reviewCount: reviews.length,
      averageRating,
      ratingCounts,
    };
  }
} 