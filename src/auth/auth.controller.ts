import {
  Controller,
  Post,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UnauthorizedException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type * as express from 'express';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ExchangeCodeDto } from './dto/exchange-code.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { parseExpiration } from '../utils/parse-expiration';
import { EmailService } from '../email/email.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
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

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    // Guard redirects to Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    const { providerUserId, email } = req.user as {
      providerUserId: string;
      email: string;
    };
    const code = await this.authService.oauthLogin('google', providerUserId, email);

    const frontendUrl = this.configService.get<string>('frontend.url');
    res.redirect(`${frontendUrl}/auth/callback?code=${code}`);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  async exchangeCode(
    @Body() dto: ExchangeCodeDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const { accessToken, refreshToken } =
      await this.authService.exchangeAuthCode(dto.code);

    this.setRefreshTokenCookie(res, refreshToken);

    return { accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const token = await this.authService.createPasswordResetToken(dto.email);

    // Send email only if token was created (user exists with password)
    if (token) {
      const frontendUrl = this.configService.get<string>('frontend.url');
      const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}`;

      try {
        await this.emailService.sendPasswordResetEmail(dto.email, resetUrl);
      } catch {
        this.logger.error(`Failed to send password reset email to ${dto.email}`);
      }
    }

    // Always return success to prevent email enumeration
    return { message: 'If an account exists, a password reset email has been sent' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
    return { message: 'Password has been reset successfully' };
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
