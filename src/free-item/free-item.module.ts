import { Module } from '@nestjs/common';
import { FreeItemService } from './free-item.service';
import { FreeItemController } from './free-item.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FreeItemController],
  providers: [FreeItemService],
  exports: [FreeItemService],
})
export class FreeItemModule {} 