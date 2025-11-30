import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, Client } from '@libsql/client';
import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private client: Client;
  public db: LibSQLDatabase<typeof schema>;

  constructor(private configService: ConfigService) {
    this.client = createClient({
      url: this.configService.get<string>('database.url')!,
      authToken: this.configService.get<string>('database.authToken'),
    });
    this.db = drizzle(this.client, { schema });
  }

  onModuleDestroy() {
    this.client.close();
  }
}
