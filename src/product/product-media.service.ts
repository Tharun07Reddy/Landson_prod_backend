import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaType } from '@prisma/client';

interface MediaDto {
  url: string;
  altText?: string;
  title?: string;
  type?: MediaType;
  position?: number;
}

@Injectable()
export class ProductMediaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Add media to a product
   */
  async addToProduct(productId: string, mediaDto: MediaDto | MediaDto[]) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    const mediaItems = Array.isArray(mediaDto) ? mediaDto : [mediaDto];

    // Get current max position to append new media
    const currentMedia = await this.prisma.productMedia.findMany({
      where: { productId },
      orderBy: { position: 'desc' },
      take: 1,
    });

    const startPosition = currentMedia.length > 0 
      ? currentMedia[0].position + 1 
      : 0;

    // Create media items
    const createdMedia = await Promise.all(
      mediaItems.map((media, index) => {
        return this.prisma.productMedia.create({
          data: {
            url: media.url,
            altText: media.altText,
            title: media.title,
            type: media.type || 'IMAGE',
            position: media.position !== undefined ? media.position : startPosition + index,
            product: {
              connect: { id: productId },
            },
          },
        });
      })
    );

    return createdMedia;
  }

  /**
   * Add media to a variant
   */
  async addToVariant(variantId: string, mediaDto: MediaDto | MediaDto[]) {
    // Check if variant exists
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    const mediaItems = Array.isArray(mediaDto) ? mediaDto : [mediaDto];

    // Get current max position to append new media
    const currentMedia = await this.prisma.productMedia.findMany({
      where: { variantId },
      orderBy: { position: 'desc' },
      take: 1,
    });

    const startPosition = currentMedia.length > 0 
      ? currentMedia[0].position + 1 
      : 0;

    // Create media items
    const createdMedia = await Promise.all(
      mediaItems.map((media, index) => {
        return this.prisma.productMedia.create({
          data: {
            url: media.url,
            altText: media.altText,
            title: media.title,
            type: media.type || 'IMAGE',
            position: media.position !== undefined ? media.position : startPosition + index,
            variant: {
              connect: { id: variantId },
            },
          },
        });
      })
    );

    return createdMedia;
  }

  /**
   * Update media
   */
  async update(id: string, mediaDto: Partial<MediaDto>) {
    // Check if media exists
    const media = await this.prisma.productMedia.findUnique({
      where: { id },
    });

    if (!media) {
      throw new NotFoundException(`Media with ID ${id} not found`);
    }

    return this.prisma.productMedia.update({
      where: { id },
      data: mediaDto,
    });
  }

  /**
   * Remove media
   */
  async remove(id: string) {
    // Check if media exists
    const media = await this.prisma.productMedia.findUnique({
      where: { id },
    });

    if (!media) {
      throw new NotFoundException(`Media with ID ${id} not found`);
    }

    await this.prisma.productMedia.delete({
      where: { id },
    });

    return { id, message: 'Media deleted successfully' };
  }

  /**
   * Update media positions
   */
  async updatePositions(mediaIds: string[]) {
    // Update positions based on array order
    const updates = mediaIds.map((id, index) => {
      return this.prisma.productMedia.update({
        where: { id },
        data: { position: index },
      });
    });

    return Promise.all(updates);
  }

  /**
   * Get media for a product
   */
  async getForProduct(productId: string) {
    return this.prisma.productMedia.findMany({
      where: { productId },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * Get media for a variant
   */
  async getForVariant(variantId: string) {
    return this.prisma.productMedia.findMany({
      where: { variantId },
      orderBy: { position: 'asc' },
    });
  }
} 