import { PartialType } from '@nestjs/mapped-types';
import { CreateFreeItemDto } from './create-free-item.dto';

export class UpdateFreeItemDto extends PartialType(CreateFreeItemDto) {} 