import { 
  IsString, 
  IsOptional, 
  IsNumber, 
  IsBoolean, 
  IsArray, 
  IsDecimal, 
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductMediaDto } from './create-product.dto';

export class CreateProductVariantDto {
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

  @IsBoolean()
  @IsOptional()
  backorderAllowed?: boolean = false;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaDto)
  media?: ProductMediaDto[];
} 