import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Global authentication module.
 *
 * Registers JwtAuthGuard as a global guard, applied to all routes by default.
 * Use the `@Public()` decorator on routes that should be accessible without
 * authentication (health checks, Swagger docs, login endpoint).
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AuthModule {}
