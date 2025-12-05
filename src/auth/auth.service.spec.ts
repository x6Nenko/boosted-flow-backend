import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { DatabaseService } from '../database/database.service';

type MockUsersService = {
  findByEmail: jest.Mock;
  findById: jest.Mock;
  create: jest.Mock;
};

type MockJwtService = {
  signAsync: jest.Mock;
  verifyAsync: jest.Mock;
};

type MockConfigService = {
  get: jest.Mock;
};

describe('AuthService', () => {
  let authService: AuthService;
  let mockUsersService: MockUsersService;
  let mockJwtService: MockJwtService;
  let mockConfigService: MockConfigService;
  let mockDatabaseService: any;

  // Sample user data to reuse across tests
  const mockUser = {
    id: 'user-uuid-123',
    email: 'test@example.com',
    hashedPassword: '$2a$12$hashedpassword', // bcrypt hash format
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    // Create fresh mocks for each test
    mockUsersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };

    mockJwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        // Return fake secrets for JWT configuration
        if (key === 'jwt.secret') return 'test-access-secret';
        if (key === 'jwt.refreshSecret') return 'test-refresh-secret';
        return undefined;
      }),
    };

    // Simulate db.insert(table).values(data).returning()
    mockDatabaseService = {
      db: {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnThis(),
          returning: jest.fn().mockResolvedValue([{}]),
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
        query: {
          refreshTokens: {
            findFirst: jest.fn(),
          },
        },
      },
    };

    // Build the testing module - this is NestJS's DI container for tests
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        // Replace real services with mocks
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  // ==========================================================================
  // REGISTER TESTS
  // ==========================================================================
  describe('register', () => {
    /**
     * HAPPY PATH: User registers successfully
     * 
     * 1. Email uniqueness check is performed
     * 2. Password is hashed before storage
     * 3. User is created with hashed password
     * 4. Token pair (access + refresh) is returned
     */
    it('should register a new user and return token pair', async () => {
      // Arrange: Set up the scenario
      const email = 'newuser@example.com';
      const password = 'securePassword123';

      // Mock: No existing user (email is available)
      mockUsersService.findByEmail.mockResolvedValue(undefined);
      // Mock: User creation returns mocked user
      mockUsersService.create.mockResolvedValue({ ...mockUser, email });
      // Mock: JWT signs return fake tokens
      mockJwtService.signAsync
        .mockResolvedValueOnce('fake-access-token')
        .mockResolvedValueOnce('fake-refresh-token');

      // Act: Execute the tested method
      const result = await authService.register(email, password);

      // Assert: Verify the outcomes
      // 1. Email uniqueness was checked
      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(email);

      // 2. User was created (password should be hashed, not plain text)
      expect(mockUsersService.create).toHaveBeenCalled();
      const createCall = mockUsersService.create.mock.calls[0];
      expect(createCall[0]).toBe(email);
      // Password passed to create should NOT be the plain password
      expect(createCall[1]).not.toBe(password);

      // 3. Tokens are returned
      expect(result).toEqual({
        accessToken: 'fake-access-token',
        refreshToken: 'fake-refresh-token',
      });
    });

    /**
     * CRITICAL FAILURE: Email already exists
     * 
     * - ConflictException is thrown when email is taken
     * - User creation is never attempted
     */
    it('should throw ConflictException when email already exists', async () => {
      // Arrange: Email already in database
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      // Act & Assert: Expect the exception
      await expect(
        authService.register('test@example.com', 'password123')
      ).rejects.toThrow(ConflictException);

      // Verify: create() was never called since it failed early
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // LOGIN TESTS
  // ==========================================================================
  describe('login', () => {
    /**
     * HAPPY PATH: User logs in successfully
     * 
     * 1. User is found by email
     * 2. Password comparison succeeds
     * 3. Token pair is returned
     */
    it('should return token pair for valid credentials', async () => {
      // Arrange: Create a user with a real bcrypt hash for the password
      const password = 'correctPassword';
      const hashedPassword = await bcrypt.hash(password, 12);
      const userWithHash = { ...mockUser, hashedPassword };

      mockUsersService.findByEmail.mockResolvedValue(userWithHash);
      mockJwtService.signAsync
        .mockResolvedValueOnce('fake-access-token')
        .mockResolvedValueOnce('fake-refresh-token');

      // Act
      const result = await authService.login(mockUser.email, password);

      // Assert
      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(mockUser.email);
      expect(result).toEqual({
        accessToken: 'fake-access-token',
        refreshToken: 'fake-refresh-token',
      });
    });

    /**
     * CRITICAL FAILURE: User not found
     * 
     * - UnauthorizedException with generic message (prevents user enumeration)
     */
    it('should throw UnauthorizedException when user not found', async () => {
      // Arrange: No user in database
      mockUsersService.findByEmail.mockResolvedValue(undefined);

      // Act & Assert
      await expect(
        authService.login('nonexistent@example.com', 'anyPassword')
      ).rejects.toThrow(UnauthorizedException);
    });

    /**
     * CRITICAL FAILURE: Wrong password
     * 
     * - UnauthorizedException when password doesn't match
     */
    it('should throw UnauthorizedException when password is incorrect', async () => {
      // Arrange: User exists but we'll provide wrong password
      const hashedPassword = await bcrypt.hash('correctPassword', 12);
      mockUsersService.findByEmail.mockResolvedValue({
        ...mockUser,
        hashedPassword
      });

      // Act & Assert: Wrong password should fail
      await expect(
        authService.login(mockUser.email, 'wrongPassword')
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==========================================================================
  // REFRESH TESTS
  // ==========================================================================
  describe('refresh', () => {
    const validTokenPayload = { sub: 'user-uuid-123', jti: 'token-id-456' };

    /**
     * HAPPY PATH: Token refresh succeeds
     * 
     * 1. Refresh token is verified
     * 2. User still exists
     * 3. Stored token is valid (not revoked, not expired)
     * 4. Old token is revoked (rotation)
     * 5. New token pair is returned
     */
    it('should return new token pair for valid refresh token', async () => {
      // Arrange
      mockJwtService.verifyAsync.mockResolvedValue(validTokenPayload);
      mockUsersService.findById.mockResolvedValue(mockUser);
      // Mock: Token found in database and valid
      mockDatabaseService.db.query.refreshTokens.findFirst.mockResolvedValue({
        id: 'token-id-456',
        userId: 'user-uuid-123',
        hashedToken: 'some-hash',
        revoked: false,
        expiresAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      });
      mockJwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      // Act
      const result = await authService.refresh('valid-refresh-token');

      // Assert
      // Token was verified with refresh secret
      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(
        'valid-refresh-token',
        { secret: 'test-refresh-secret' }
      );
      // User existence was checked
      expect(mockUsersService.findById).toHaveBeenCalledWith('user-uuid-123');
      // Old token was revoked (update called)
      expect(mockDatabaseService.db.update).toHaveBeenCalled();
      // New tokens returned
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    /**
     * CRITICAL FAILURE: Invalid refresh token signature
     * 
     * - UnauthorizedException when JWT verification fails
     */
    it('should throw UnauthorizedException for invalid token', async () => {
      // Arrange: JWT verification throws (invalid/expired token)
      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      // Act & Assert
      await expect(
        authService.refresh('invalid-token')
      ).rejects.toThrow(UnauthorizedException);
    });

    /**
     * CRITICAL FAILURE: User no longer exists
     * 
     * - UnauthorizedException when user deleted after token issued
     */
    it('should throw UnauthorizedException when user not found', async () => {
      // Arrange: Token valid but user deleted
      mockJwtService.verifyAsync.mockResolvedValue(validTokenPayload);
      mockUsersService.findById.mockResolvedValue(undefined);

      // Act & Assert
      await expect(
        authService.refresh('valid-token-deleted-user')
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==========================================================================
  // LOGOUT TESTS
  // ==========================================================================
  describe('logout', () => {
    /**
     * HAPPY PATH: Logout succeeds
     * 
     * - Token is revoked in database
     * - No error thrown
     */
    it('should revoke the refresh token', async () => {
      // Arrange
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-uuid-123',
        jti: 'token-id-456'
      });

      // Act
      await authService.logout('valid-refresh-token');

      // Assert: Update was called to revoke the token
      expect(mockDatabaseService.db.update).toHaveBeenCalled();
    });

    /**
     * CRITICAL (but graceful) FAILURE: Invalid token on logout
     * 
     * - No error thrown (logout silently succeeds)
     * - This is intentional: user should always be able to "logout"
     */
    it('should not throw error for invalid token (silent success)', async () => {
      // Arrange: Invalid token
      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid'));

      // Act & Assert: Should not throw
      await expect(authService.logout('invalid-token')).resolves.not.toThrow();
    });
  });
});
