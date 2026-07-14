import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * JWT Authentication Guard.
 *
 * Validates Bearer tokens on protected routes. Routes decorated with
 * `@Public()` are excluded from authentication.
 *
 * Token format: `Bearer <jwt>`
 * Verification is delegated to a configurable JWT secret + algorithm.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Allow @Public() routes to bypass auth
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    try {
      const payload = this.verifyToken(token);
      (request as any).user = payload;
      return true;
    } catch (err: any) {
      this.logger.warn(`JWT verification failed: ${err.message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;

    return token;
  }

  /**
   * Verify a JWT token and return its payload.
   * Production: use @nestjs/jwt JwtService or jsonwebtoken directly.
   */
  private verifyToken(token: string): Record<string, unknown> {
    // Dynamic import to avoid hard dependency on jsonwebtoken
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jwt = require('jsonwebtoken') as {
      verify: (token: string, secret: string, opts?: Record<string, unknown>) => unknown;
    };

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      this.logger.error('JWT_SECRET 环境变量未设置！请在生产环境中配置强密钥。');
      throw new Error('Authentication is not configured');
    }

    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      maxAge: process.env.JWT_EXPIRATION ?? '7d',
    });

    return payload as Record<string, unknown>;
  }
}
