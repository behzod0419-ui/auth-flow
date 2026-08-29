import { Module } from '@nestjs/common';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    UsersController,
  ],
  
  providers: [
    UsersService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class UsersModule { }