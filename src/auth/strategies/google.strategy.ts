import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('google.clientId'),
      clientSecret: configService.getOrThrow<string>('google.clientSecret'),
      callbackURL: configService.getOrThrow<string>('google.callbackUrl'),
      scope: ['email', 'profile'],
      state: true,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    console.log('=== GOOGLE STRATEGY VALIDATE ===');
    console.log('Profile ID:', profile?.id);
    console.log('Emails:', profile?.emails);
    console.log('Access Token exists:', !!accessToken);
    console.log('=== END GOOGLE STRATEGY ===');

    const { id, emails } = profile;
    const email = emails?.[0]?.value;
    const emailVerified = profile._json?.email_verified;

    if (!email) {
      done(new Error('No email found in Google profile'), undefined);
      return;
    }

    if (!emailVerified) {
      done(new Error('Email not verified by Google'), undefined);
      return;
    }

    done(null, { providerUserId: id, email });
  }
}
