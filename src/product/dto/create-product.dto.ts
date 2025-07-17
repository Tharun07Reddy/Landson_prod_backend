import { 
  IsString, 
  IsOptional, 
  IsNumber, 
  IsBoolean, 
  IsArray, 
  IsDecimal, 
  IsNotEmpty,
  ValidateNested,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AttributeType, MediaType } from '@prisma/client';

export class ProductAttributeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  value: string;

  @IsEnum(AttributeType)
  type: AttributeType;

  @IsBoolean()
  @IsOptional()
  isFilterable?: boolean;

  @IsBoolean()
  @IsOptional()
  isSearchable?: boolean;

  @IsBoolean()
  @IsOptional()
  isVariantOption?: boolean;

  @IsNumber()
  @IsOptional()
  position?: number;
}

export class ProductMediaDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsOptional()
  altText?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsEnum(MediaType)
  @IsOptional()
  type?: MediaType;

  @IsNumber()
  @IsOptional()
  position?: number;
}

export class ProductVariantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsDecimal()
  @IsOptional()
  price?: number;

  @IsDecimal()
  @IsOptional()
  compareAtPrice?: number;
  
  @IsDecimal()
  @IsOptional()
  dealerPrice?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @IsNumber()
  @IsOptional()
  position?: number = 0;

  @IsNotEmpty()
  options: Record<string, string | number | boolean>;

  @IsNumber()
  @IsOptional()
  quantity?: number = 0;

  @IsNumber()
  @IsOptional()
  lowStockThreshold?: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaDto)
  media?: ProductMediaDto[];
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  shortDescription?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsDecimal()
  @IsOptional()
  price?: number = 0;

  @IsDecimal()
  @IsOptional()
  compareAtPrice?: number;

  @IsDecimal()
  @IsOptional()
  costPrice?: number;
  
  @IsDecimal()
  @IsOptional()
  dealerPrice?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean = false;

  @IsBoolean()
  @IsOptional()
  isDigital?: boolean = false;

  @IsDecimal()
  @IsOptional()
  weight?: number;

  @IsOptional()
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
  };

  @IsString()
  @IsOptional()
  metaTitle?: string;

  @IsString()
  @IsOptional()
  metaDescription?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  metaKeywords?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  searchKeywords?: string[];

  @IsNumber()
  @IsOptional()
  seoScore?: number;

  @IsString()
  @IsOptional()
  pageTitle?: string;

  @IsString()
  @IsOptional()
  canonicalUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categories?: string[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeDto)
  attributes?: ProductAttributeDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaDto)
  media?: ProductMediaDto[];

  @IsNumber()
  @IsOptional()
  quantity?: number = 0;

  @IsNumber()
  @IsOptional()
  lowStockThreshold?: number;

  @IsBoolean()
  @IsOptional()
  backorderAllowed?: boolean = false;
} 