import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type * as express from 'express';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { parseExpiration } from '../utils/parse-expiration';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) { }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 attempts per minute
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const { accessToken, refreshToken } =
      await this.authService.register(dto.email, dto.password);

    // Set refresh token as HTTP-only cookie
    this.setRefreshTokenCookie(res, refreshToken);

    // Return only access token in body
    return { accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 attempts per minute
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const { accessToken, refreshToken } =
      await this.authService.login(dto.email, dto.password);

    // Set refresh token as HTTP-only cookie
    this.setRefreshTokenCookie(res, refreshToken);

    // Return only access token in body
    return { accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 attempts per minute
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    // Extract refresh token from HTTP-only cookie
    const refreshToken = req.cookies?.['refreshToken'];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await this.authService.refresh(refreshToken);

    // Set new refresh token as HTTP-only cookie (rotation)
    this.setRefreshTokenCookie(res, newRefreshToken);

    // Return only access token in body
    return { accessToken };
  }

  @Post('logout')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 attempts per minute
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    // Extract refresh token from HTTP-only cookie
    const refreshToken = req.cookies?.['refreshToken'];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    // Clear refresh token cookie
    this.clearRefreshTokenCookie(res);
  }

  private setRefreshTokenCookie(res: express.Response, refreshToken: string): void {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const cookieMaxAge = parseExpiration(
      this.configService.get<string>('jwt.cookieMaxAge') || '30d',
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction, // HTTPS only in production
      sameSite: 'lax',
      path: '/auth',
      maxAge: cookieMaxAge,
    });
  }

  private clearRefreshTokenCookie(res: express.Response): void {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/auth',
    });
  }
}
