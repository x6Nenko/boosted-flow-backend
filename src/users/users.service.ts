import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { users } from '../database/schema';

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
