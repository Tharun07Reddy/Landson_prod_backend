import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ProductVariantService } from './product-variant.service';
import { ProductAttributeService } from './product-attribute.service';
import { ProductMediaService } from './product-media.service';
import { ProductInventoryService } from './product-inventory.service';
import { ProductReviewService } from './product-review.service';
import { ProductAnalyticsService } from './product-analytics.service';
import { ProductSearchService } from './product-search.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CategoryModule } from '../category/category.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    PrismaModule,
    CategoryModule,
    AnalyticsModule,
  ],
  controllers: [ProductController],
  providers: [
    ProductService,
    ProductVariantService,
    ProductAttributeService,
    ProductMediaService,
    ProductInventoryService,
    ProductReviewService,
    ProductAnalyticsService,
    ProductSearchService,
  ],
  exports: [
    ProductService,
    ProductVariantService,
    ProductAttributeService,
    ProductMediaService,
    ProductInventoryService,
    ProductReviewService,
    ProductAnalyticsService,
    ProductSearchService,
  ],
})
export class ProductModule {} 