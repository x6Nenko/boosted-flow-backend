import { Injectable, UnauthorizedException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { eq, gt, and } from 'drizzle-orm';
import { UsersService } from '../users/users.service';
import { DatabaseService } from '../database/database.service';
import { refreshTokens } from '../database/schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {}

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
      return this.generateTokenPair(user.id, user.email);
    } catch (error) {
      throw new InternalServerErrorException('Something went wrong, please try again later');
    }
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokenPair(user.id, user.email);
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
    const storedToken = await this.databaseService.db.query.refreshTokens.findFirst({
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

    // 4. Revoke old token (rotation)
    await this.databaseService.db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.id, payload.jti));

    // 5. Generate new pair
    return this.generateTokenPair(user.id, user.email);
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
          eq(refreshTokens.userId, payload.sub) // ownership check
        )
      );

    return;
  }

  private async generateTokenPair(userId: string, email: string) {
    const tokenId = uuidv4();

    // Access token - short lived
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email },
      {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: '15m',
      },
    );

    // Refresh token - long lived with unique ID (jti)
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, jti: tokenId },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: '7d',
      },
    );

    // Store hashed refresh token
    const hashedToken = await this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

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
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}