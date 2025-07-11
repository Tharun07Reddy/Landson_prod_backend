import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });

    // Log queries in development mode
    if (process.env.NODE_ENV !== 'production') {
      // @ts-expect-error: PrismaClient typings may not include 'query' event
      this.$on('query' as any, (e: any) => {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      });
    }
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Successfully connected to database');
    } catch (error) {
      this.logger.error(`Failed to connect to database: ${error.message}`, error.stack);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('Successfully disconnected from database');
    } catch (error) {
      this.logger.error(`Error disconnecting from database: ${error.message}`, error.stack);
    }
  }

  /**
   * Helper method to clean the database during testing
   * Should only be used in test environments
   */
  async cleanDatabase() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('cleanDatabase should only be called in test environment');
    }

    // Delete records in reverse order of dependencies
    const models = Reflect.ownKeys(this).filter(key => {
      return (
        key[0] !== '_' &&
        key[0] !== '$' &&
        typeof this[key] === 'object' &&
        this[key] !== null &&
        'deleteMany' in this[key]
      );
    });

    return Promise.all(
      models.map(async modelKey => {
        try {
          await this[modelKey].deleteMany();
        } catch (error) {
          this.logger.error(`Error cleaning ${String(modelKey)}: ${error.message}`);
        }
      }),
    );
  }
} 