import { UsersService } from './users.service';

describe('UsersService - normalizeEmail', () => {
  let service: UsersService;

  beforeEach(() => {
    service = new UsersService(null as any);
  });

  it('should convert email to lowercase', () => {
    const normalized = service['normalizeEmail']('USER@EXAMPLE.COM');
    expect(normalized).toBe('user@example.com');
  });

  it('should trim whitespace from email', () => {
    const normalized = service['normalizeEmail']('  user@example.com  ');
    expect(normalized).toBe('user@example.com');
  });

  it('should handle mixed case with whitespace', () => {
    const normalized = service['normalizeEmail']('  UsEr@ExAmPlE.CoM  ');
    expect(normalized).toBe('user@example.com');
  });

  it('should return already normalized email unchanged', () => {
    const normalized = service['normalizeEmail']('user@example.com');
    expect(normalized).toBe('user@example.com');
  });
});
