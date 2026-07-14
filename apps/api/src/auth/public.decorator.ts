import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';

/**
 * Mark a route or controller as publicly accessible (no JWT required).
 *
 * @example
 *   @Public()
 *   @Get('health')
 *   healthCheck() { return { status: 'ok' }; }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
