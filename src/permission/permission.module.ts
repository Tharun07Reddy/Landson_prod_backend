import { Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [PrismaModule, CacheModule],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionModule {} 