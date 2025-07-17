import { 
  IsOptional, 
  IsNumber, 
  IsBoolean, 
  IsString,
  Min,
} from 'class-validator';

export class UpdateInventoryDto {
  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  lowStockThreshold?: number;

  @IsBoolean()
  @IsOptional()
  backorderAllowed?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  reservedQuantity?: number;

  @IsString()
  @IsOptional()
  warehouseLocation?: string;
} 