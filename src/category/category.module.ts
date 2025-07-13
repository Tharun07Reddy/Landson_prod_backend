import { Module } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { CategoryAttributeService } from './category-attribute.service';
import { CategoryAnalyticsService } from './category-analytics.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CategoryController],
  providers: [
    CategoryService,
    CategoryAttributeService,
    CategoryAnalyticsService,
  ],
  exports: [
    CategoryService,
    CategoryAttributeService,
    CategoryAnalyticsService,
  ],
})
export class CategoryModule {} 