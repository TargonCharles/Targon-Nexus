import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  @Public()
  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    // Simple dev auth — in production use a proper auth service
    const adminUser = process.env.ADMIN_USER ?? 'admin';
    const adminPass = process.env.ADMIN_PASS ?? 'targon-nexus-admin';

    if (body.username !== adminUser || body.password !== adminPass) {
      throw new BadRequestException('Invalid credentials');
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jwt = require('jsonwebtoken') as { sign: (...args: any[]) => string };
    const secret = process.env.JWT_SECRET ?? 'targon-nexus-dev-secret';
    const token = jwt.sign(
      { sub: body.username, role: 'admin' },
      secret,
      { algorithm: 'HS256', expiresIn: '7d' },
    );

    return { success: true, data: { token, expiresIn: '7d' } };
  }
}
