import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RoleModule } from '../role/role.module';
import { PermissionModule } from '../permission/permission.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [PrismaModule, RoleModule, PermissionModule, CacheModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {} 