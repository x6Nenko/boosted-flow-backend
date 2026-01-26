import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { eq, gt, and, lt } from 'drizzle-orm';
import { UsersService } from '../users/users.service';
import { DatabaseService } from '../database/database.service';
import { refreshTokens, authCodes } from '../database/schema';
import { parseExpiration } from '../utils/parse-expiration';

const AUTH_CODE_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) { }

  async register(email: string, password: string) {
    // Check if user exists
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password with cost factor 12
    const hashedPassword = await bcrypt.hash(password, 12);

    try {
      // Create user
      const user = await this.usersService.create(email, hashedPassword);
      // Generate tokens
      return this.generateTokens(user.id);
    } catch (error) {
      throw new InternalServerErrorException(
        'Something went wrong, please try again later',
      );
    }
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // OAuth users don't have password
    if (!user.hashedPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user.id);
  }

  async oauthLogin(provider: string, providerUserId: string, email: string) {
    const user = await this.usersService.findOrCreateOAuthUser(
      provider,
      providerUserId,
      email,
    );
    return this.createAuthCode(user.id);
  }

  async exchangeAuthCode(code: string) {
    const now = new Date().toISOString();

    // Find and validate code
    const storedCode = await this.databaseService.db.query.authCodes.findFirst({
      where: and(
        eq(authCodes.code, code),
        gt(authCodes.expiresAt, now),
      ),
    });

    if (!storedCode) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    // Delete used code (one-time use)
    await this.databaseService.db
      .delete(authCodes)
      .where(eq(authCodes.code, code));

    return this.generateTokens(storedCode.userId);
  }

  private async createAuthCode(userId: string): Promise<string> {
    const code = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + AUTH_CODE_EXPIRATION_MS);

    // Clean up expired codes for this user
    await this.databaseService.db
      .delete(authCodes)
      .where(
        and(
          eq(authCodes.userId, userId),
          lt(authCodes.expiresAt, now.toISOString()),
        ),
      );

    await this.databaseService.db.insert(authCodes).values({
      code,
      userId,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    });

    return code;
  }

  async refresh(refreshToken: string) {
    // 1. Verify refresh token signature: subject (user id) and jwt id
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // 2. Verify user exists and is active FIRST
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 3. Check token exists, matches hash, not expired, and not revoked
    const hashedToken = await this.hashToken(refreshToken);
    const storedToken =
      await this.databaseService.db.query.refreshTokens.findFirst({
        where: and(
          eq(refreshTokens.id, payload.jti),
          eq(refreshTokens.userId, payload.sub),
          eq(refreshTokens.hashedToken, hashedToken),
          eq(refreshTokens.revoked, false),
          gt(refreshTokens.expiresAt, new Date().toISOString()),
        ),
      });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token not found or revoked');
    }

    // 4. Check if refresh token should be rotated (based on JWT_ROTATION_PERIOD)
    const tokenAge = Date.now() - new Date(storedToken.createdAt).getTime();
    const rotationPeriod = this.configService.get<string>('jwt.rotationPeriod')!;
    const rotationPeriodMs = parseExpiration(rotationPeriod);
    const shouldRotate = tokenAge > rotationPeriodMs;

    if (shouldRotate) {
      // Revoke old token and generate new pair
      await this.databaseService.db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.id, payload.jti));

      return this.generateTokens(user.id);
    } else {
      // Only generate new access token, reuse refresh token
      const accessExpiration = this.configService.get<string>('jwt.accessExpiration')!;
      const accessToken = await this.jwtService.signAsync(
        { sub: user.id },
        {
          secret: this.configService.get<string>('jwt.secret'),
          expiresIn: accessExpiration as any,
        },
      );

      return { accessToken, refreshToken };
    }
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      // Token invalid, but that's okay for logout
      return;
    }

    await this.databaseService.db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(
        and(
          eq(refreshTokens.id, payload.jti),
          eq(refreshTokens.userId, payload.sub), // ownership check
        ),
      );

    return;
  }

  private async generateTokens(userId: string) {
    const tokenId = uuidv4();

    const accessExpiration = this.configService.get<string>('jwt.accessExpiration')!;
    const refreshExpiration = this.configService.get<string>('jwt.refreshExpiration')!;

    // Access token - short lived (returned in body)
    // Only contains userId (sub) - no email to minimize payload
    const accessToken = await this.jwtService.signAsync(
      { sub: userId },
      {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: accessExpiration as any,
      },
    );

    // Refresh token - long lived with unique ID (jti) (set as HTTP-only cookie)
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, jti: tokenId },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiration as any,
      },
    );

    // Store hashed refresh token
    const hashedToken = await this.hashToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + parseExpiration(refreshExpiration),
    ).toISOString();

    await this.databaseService.db.insert(refreshTokens).values({
      id: tokenId,
      userId,
      hashedToken,
      expiresAt,
      createdAt: new Date().toISOString(),
    });

    return { accessToken, refreshToken };
  }

  private async hashToken(token: string): Promise<string> {
    // converts string into bytes
    const encoder = new TextEncoder();
    // converts string into a Uint8Array (e.g., [97, 98, 99])
    const data = encoder.encode(token);
    // generates raw binary data that is sitting in memory
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    // converts buffer into byte array so we can work with it
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // converts bytes to hex string
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
