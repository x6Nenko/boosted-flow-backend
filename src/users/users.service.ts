import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { users, oauthAccounts } from '../database/schema';

@Injectable()
export class UsersService {
  constructor(private readonly databaseService: DatabaseService) {}

  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  async create(
    email: string,
    hashedPassword: string,
  ): Promise<typeof users.$inferSelect> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const normalizedEmail = this.normalizeEmail(email);

    const [user] = await this.databaseService.db
      .insert(users)
      .values({
        id,
        email: normalizedEmail,
        hashedPassword,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return user;
  }

  async findOrCreateOAuthUser(
    provider: string,
    providerUserId: string,
    email: string,
  ): Promise<typeof users.$inferSelect> {
    // Check if OAuth account already exists
    const existingOAuthAccount =
      await this.databaseService.db.query.oauthAccounts.findFirst({
        where: and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerUserId, providerUserId),
        ),
        with: { user: true },
      });

    if (existingOAuthAccount) {
      return existingOAuthAccount.user;
    }

    // Check if user with this email exists (link OAuth to existing account)
    const normalizedEmail = this.normalizeEmail(email);
    const existingUser = await this.findByEmail(normalizedEmail);
    const now = new Date().toISOString();

    if (existingUser) {
      // Link OAuth account to existing user
      await this.databaseService.db.insert(oauthAccounts).values({
        provider,
        providerUserId,
        userId: existingUser.id,
        createdAt: now,
      });
      return existingUser;
    }

    // Create new user + OAuth account
    const userId = crypto.randomUUID();

    const [user] = await this.databaseService.db
      .insert(users)
      .values({
        id: userId,
        email: normalizedEmail,
        hashedPassword: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await this.databaseService.db.insert(oauthAccounts).values({
      provider,
      providerUserId,
      userId: user.id,
      createdAt: now,
    });

    return user;
  }

  async findByEmail(
    email: string,
  ): Promise<typeof users.$inferSelect | undefined> {
    const normalizedEmail = this.normalizeEmail(email);
    return this.databaseService.db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });
  }

  async findById(id: string): Promise<typeof users.$inferSelect | undefined> {
    return this.databaseService.db.query.users.findFirst({
      where: eq(users.id, id),
    });
  }
}
