import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { DatabaseService } from '../database/database.service';

describe('UsersService', () => {
  let usersService: UsersService;
  let mockDatabaseService: any;

  // Reusable mock user for testing
  const mockUser = {
    id: 'generated-uuid-123',
    email: 'test@example.com',
    hashedPassword: '$2a$12$hashedPasswordValue',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    // Build mock DatabaseService with Drizzle-like chain API
    mockDatabaseService = {
      db: {
        // Mock: db.insert(table).values(data).returning()
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn(),
          }),
        }),
        // Mock: db.query.users.findFirst({ where: ... })
        query: {
          users: {
            findFirst: jest.fn(),
          },
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
  });

  // ==========================================================================
  // CREATE TESTS
  // ==========================================================================
  describe('create', () => {
    /**
     * HAPPY PATH: User is created successfully
     * 
     * 1. Email is normalized (lowercase, trimmed)
     * 2. UUID is generated for the user
     * 3. Timestamps are set
     * 4. Created user is returned
     */
    it('should create a user with normalized email and return it', async () => {
      // Arrange: Email with mixed case and spaces
      const email = '  TEST@Example.COM  ';
      const hashedPassword = '$2a$12$someHashedPassword';
      const expectedNormalizedEmail = 'test@example.com';

      // Mock the insert chain to return our mock user
      const mockReturning = jest.fn().mockResolvedValue([{
        ...mockUser,
        email: expectedNormalizedEmail,
      }]);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockDatabaseService.db.insert.mockReturnValue({ values: mockValues });

      // Act
      const result = await usersService.create(email, hashedPassword);

      // Assert
      // 1. Insert was called
      expect(mockDatabaseService.db.insert).toHaveBeenCalled();

      // 2. Values contains normalized email (not the original)
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          email: expectedNormalizedEmail,
          hashedPassword,
        })
      );

      // 3. Values contains an id (UUID format check)
      const insertedValues = mockValues.mock.calls[0][0];
      expect(insertedValues.id).toBeDefined();
      expect(typeof insertedValues.id).toBe('string');

      // 4. Timestamps are set
      expect(insertedValues.createdAt).toBeDefined();
      expect(insertedValues.updatedAt).toBeDefined();

      // 5. User is returned
      expect(result.email).toBe(expectedNormalizedEmail);
    });
  });

  // ==========================================================================
  // FIND BY EMAIL TESTS
  // ==========================================================================
  describe('findByEmail', () => {
    /**
     * HAPPY PATH: User found by email
     * 
     * 1. Email is normalized before query
     * 2. User object is returned when found
     */
    it('should return user when found', async () => {
      // Arrange
      mockDatabaseService.db.query.users.findFirst.mockResolvedValue(mockUser);

      // Act
      const result = await usersService.findByEmail('TEST@example.com');

      // Assert
      // Query was made (email normalized internally)
      expect(mockDatabaseService.db.query.users.findFirst).toHaveBeenCalled();
      // User is returned
      expect(result).toEqual(mockUser);
    });

    /**
     * CRITICAL FAILURE: User not found
     * 
     * - undefined is returned when no user exists
     * - This is NOT an error condition, just a "not found" result
     */
    it('should return undefined when user not found', async () => {
      // Arrange: No user in database
      mockDatabaseService.db.query.users.findFirst.mockResolvedValue(undefined);

      // Act
      const result = await usersService.findByEmail('nonexistent@example.com');

      // Assert
      expect(result).toBeUndefined();
    });
  });

  // ==========================================================================
  // FIND BY ID TESTS
  // ==========================================================================
  describe('findById', () => {
    /**
     * HAPPY PATH: User found by ID
     * 
     * - User object is returned when found
     */
    it('should return user when found', async () => {
      // Arrange
      mockDatabaseService.db.query.users.findFirst.mockResolvedValue(mockUser);

      // Act
      const result = await usersService.findById('user-uuid-123');

      // Assert
      expect(mockDatabaseService.db.query.users.findFirst).toHaveBeenCalled();
      expect(result).toEqual(mockUser);
    });

    /**
     * CRITICAL FAILURE: User not found by ID
     * 
     * - undefined is returned when ID doesn't exist
     */
    it('should return undefined when user not found', async () => {
      // Arrange
      mockDatabaseService.db.query.users.findFirst.mockResolvedValue(undefined);

      // Act
      const result = await usersService.findById('nonexistent-id');

      // Assert
      expect(result).toBeUndefined();
    });
  });
});
