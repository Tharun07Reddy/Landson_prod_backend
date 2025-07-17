import { 
  IsOptional, 
  IsNumber, 
  IsString, 
  IsBoolean, 
  Min, 
  Max,
  IsIn,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SearchQueryDto {
  @IsOptional()
  @IsString()
  q?: string = '';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @IsIn(['relevance', 'price', 'name', 'newest', 'popularity', 'bestselling'])
  sortBy?: string = 'relevance';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsObject()
  filters?: Record<string, string | string[] | number | number[] | boolean>;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeOutOfStock?: boolean = false;
} 