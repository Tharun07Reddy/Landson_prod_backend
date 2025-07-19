import { IsString, IsArray } from 'class-validator';

export class AttachFreeItemDto {
  @IsString()
  freeItemId: string;

  @IsArray()
  productIds: string[];
}

export class AttachProductDto {
  @IsString()
  productId: string;

  @IsArray()
  freeItemIds: string[];
} 