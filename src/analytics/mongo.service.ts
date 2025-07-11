import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { MongoClient, Db, Collection, Document, OptionalUnlessRequiredId } from 'mongodb';

@Injectable()
export class MongoService implements OnModuleInit {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isConnected = false;
  private collections: Record<string, Collection> = {};

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    try {
      const isEnabled = await this.configService.get<boolean>('enable-analytics', true);
      
      if (!isEnabled) {
        console.warn('Analytics service is disabled by feature flag');
        return;
      }

      const uri = await this.configService.get<string>('ANALYTICES_URL', '');
      const dbName = await this.configService.get<string>('MONGODB_DB_NAME', 'analytics');
      
      if (!uri) {
        console.warn('MongoDB URI not configured, analytics will be disabled');
        return;
      }

      this.client = new MongoClient(uri);
      await this.client.connect();
      this.db = this.client.db(dbName);
      
      // Initialize collections
      this.collections = {
        events: this.db.collection('events'),
        metrics: this.db.collection('metrics'),
        errors: this.db.collection('errors'),
      };
      
      // Create indexes for better query performance
      await this.createIndexes();
      
      this.isConnected = true;
      console.log('Connected to MongoDB for analytics');
    } catch (error) {
      console.error('Failed to connect to MongoDB', error);
      this.isConnected = false;
    }
  }

  /**
   * Create indexes for better query performance
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) return;

    try {
      // Events collection indexes
      await this.collections.events.createIndex({ timestamp: -1 });
      await this.collections.events.createIndex({ type: 1, timestamp: -1 });
      await this.collections.events.createIndex({ userId: 1, timestamp: -1 });
      await this.collections.events.createIndex({ sessionId: 1, timestamp: -1 });
      
      // Metrics collection indexes
      await this.collections.metrics.createIndex({ timestamp: -1 });
      await this.collections.metrics.createIndex({ name: 1, timestamp: -1 });
      await this.collections.metrics.createIndex({ 'tags.serviceId': 1, timestamp: -1 });
      
      // Errors collection indexes
      await this.collections.errors.createIndex({ timestamp: -1 });
      await this.collections.errors.createIndex({ level: 1, timestamp: -1 });
      await this.collections.errors.createIndex({ serviceId: 1, timestamp: -1 });
      
      console.log('Created MongoDB indexes for analytics collections');
    } catch (error) {
      console.error('Failed to create MongoDB indexes', error);
    }
  }

  /**
   * Get a collection by name
   */
  getCollection<T extends Document = Document>(name: string): Collection<T> | null {
    if (!this.isConnected || !this.collections[name]) {
      return null;
    }
    return this.collections[name] as unknown as Collection<T>;
  }

  /**
   * Insert a document into a collection
   */
  async insertOne<T extends Document = Document>(collectionName: string, document: T): Promise<boolean> {
    const collection = this.getCollection<T>(collectionName);
    if (!collection) {
      return false;
    }

    try {
      await collection.insertOne(document as any);
      return true;
    } catch (error) {
      console.error(`Error inserting into ${collectionName}`, error);
      return false;
    }
  }

  /**
   * Insert multiple documents into a collection
   */
  async insertMany<T extends Document = Document>(collectionName: string, documents: T[]): Promise<boolean> {
    const collection = this.getCollection<T>(collectionName);
    if (!collection) {
      return false;
    }

    try {
      await collection.insertMany(documents as any);
      return true;
    } catch (error) {
      console.error(`Error inserting many into ${collectionName}`, error);
      return false;
    }
  }

  /**
   * Find documents in a collection
   */
  async find<T extends Document = Document>(
    collectionName: string,
    query: any,
    options: { limit?: number; skip?: number; sort?: any } = {},
  ): Promise<T[]> {
    const collection = this.getCollection<T>(collectionName);
    if (!collection) {
      return [];
    }

    try {
      let cursor = collection.find(query);
      
      if (options.sort) {
        cursor = cursor.sort(options.sort);
      }
      
      if (options.skip) {
        cursor = cursor.skip(options.skip);
      }
      
      if (options.limit) {
        cursor = cursor.limit(options.limit);
      }
      
      return await cursor.toArray() as unknown as T[];
    } catch (error) {
      console.error(`Error finding in ${collectionName}`, error);
      return [];
    }
  }

  /**
   * Count documents in a collection
   */
  async count(collectionName: string, query: any): Promise<number> {
    const collection = this.getCollection(collectionName);
    if (!collection) {
      return 0;
    }

    try {
      return await collection.countDocuments(query);
    } catch (error) {
      console.error(`Error counting in ${collectionName}`, error);
      return 0;
    }
  }

  /**
   * Aggregate documents in a collection
   */
  async aggregate<T extends Document = Document>(collectionName: string, pipeline: any[]): Promise<T[]> {
    const collection = this.getCollection(collectionName);
    if (!collection) {
      return [];
    }

    try {
      return await collection.aggregate(pipeline).toArray() as unknown as T[];
    } catch (error) {
      console.error(`Error aggregating in ${collectionName}`, error);
      return [];
    }
  }

  /**
   * Check if MongoDB is connected
   */
  isReady(): boolean {
    return this.isConnected;
  }
} 