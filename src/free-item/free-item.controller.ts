import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { FreeItemService } from './free-item.service';
import { CreateFreeItemDto } from './dto/create-free-item.dto';
import { UpdateFreeItemDto } from './dto/update-free-item.dto';
import { FreeItemQueryDto } from './dto/free-item-query.dto';
import { AttachFreeItemDto, AttachProductDto } from './dto/attach-free-item.dto';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('free-items')
export class FreeItemController {
  constructor(private readonly freeItemService: FreeItemService) {}

  @Post()
  @RequirePermissions({ resource: 'free-items', action: 'create' })
  async create(@Body() createFreeItemDto: CreateFreeItemDto) {
    return this.freeItemService.create(createFreeItemDto);
  }

  @Get()
  @Public()
  async findAll(@Query() query: FreeItemQueryDto) {
    return this.freeItemService.findAll(query);
  }

  @Get(':id')
  @Public()
  async findOne(@Param('id') id: string) {
    return this.freeItemService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ resource: 'free-items', action: 'update' })
  async update(
    @Param('id') id: string,
    @Body() updateFreeItemDto: UpdateFreeItemDto,
  ) {
    return this.freeItemService.update(id, updateFreeItemDto);
  }

  @Delete(':id')
  @RequirePermissions({ resource: 'free-items', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return this.freeItemService.remove(id);
  }

  @Post('attach-to-products')
  @RequirePermissions({ resource: 'free-items', action: 'update' })
  async attachToProducts(@Body() attachDto: AttachFreeItemDto) {
    return this.freeItemService.attachToProducts(attachDto);
  }

  @Delete(':freeItemId/products/:productId')
  @RequirePermissions({ resource: 'free-items', action: 'update' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async detachFromProduct(
    @Param('freeItemId') freeItemId: string,
    @Param('productId') productId: string,
  ) {
    return this.freeItemService.detachFromProduct(freeItemId, productId);
  }

  @Get('products/:productId')
  @Public()
  async findByProduct(@Param('productId') productId: string) {
    return this.freeItemService.findByProduct(productId);
  }

  @Post('products/:productId/attach')
  @RequirePermissions({ resource: 'products', action: 'update' })
  async attachToProduct(
    @Param('productId') productId: string,
    @Body() attachDto: { freeItemIds: string[] },
  ) {
    const dto: AttachProductDto = {
      productId,
      freeItemIds: attachDto.freeItemIds,
    };
    return this.freeItemService.attachToProduct(dto);
  }
} 