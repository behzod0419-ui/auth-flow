import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MailModule } from './mail/mail.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './auth/users/users.module';
import { PrismaModule } from './auth/prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true,
  }),
  ThrottlerModule.forRoot([
    {
      ttl: 60000,
      limit: 10,
    },
  ]), AuthModule, UsersModule, PrismaModule, MailModule,],
  controllers: [AppController],
  providers: [AppService, {
    provide: APP_GUARD,
    useClass: ThrottlerGuard,
  },],
})
export class AppModule { }
