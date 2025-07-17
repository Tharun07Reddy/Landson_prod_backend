import { 
  IsString, 
  IsOptional, 
  IsNumber, 
  IsNotEmpty,
  Min,
  Max,
} from 'class-validator';

export class CreateProductReviewDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;
} 