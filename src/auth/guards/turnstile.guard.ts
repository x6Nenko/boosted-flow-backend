import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

@Injectable()
export class TurnstileGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.body?.turnstileToken;

    if (!token) {
      throw new ForbiddenException('Turnstile token is required');
    }

    const secretKey = this.configService.get<string>('turnstile.secretKey');

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: secretKey, response: token }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new ForbiddenException('Turnstile verification failed');
    }

    return true;
  }
}
