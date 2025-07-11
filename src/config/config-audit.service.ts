import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from './config.service';
import { PlatformType } from '@prisma/client';

export interface AuditLogFilter {
  key?: string;
  userId?: string;
  environment?: string | null;
  platform?: PlatformType | null;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  pageSize?: number;
}

export interface AuditLogEntry {
  id: string;
  configKey: string;
  configKeyId: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  environment: string | null;
  platform: PlatformType | null;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable()
export class ConfigAuditService implements OnModuleInit {
  private readonly logger = new Logger(ConfigAuditService.name);
  private retentionDays = 90;
  private detailLevel: 'basic' | 'standard' | 'verbose' = 'standard';
  
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ConfigService))
    private readonly configService: ConfigService
  ) {}

  async onModuleInit() {
    await this.loadConfiguration();
  }

  /**
   * Load audit configuration from database
   */
  async loadConfiguration(): Promise<void> {
    try {
      // Load retention period
      const retentionDays = await this.configService.get<number>('AUDIT_RETENTION_DAYS', 90);
      this.retentionDays = retentionDays ?? 90;
      
      // Load detail level
      const detailLevel = await this.configService.get<string>('AUDIT_DETAIL_LEVEL', 'standard');
      if (detailLevel === 'basic' || detailLevel === 'standard' || detailLevel === 'verbose') {
        this.detailLevel = detailLevel;
      }
      
      this.logger.log(`Audit configuration loaded: retention=${this.retentionDays} days, detail=${this.detailLevel}`);
      
      // Schedule cleanup of old audit logs
      this.scheduleAuditCleanup();
    } catch (error) {
      this.logger.error('Failed to load audit configuration', error);
    }
  }

  /**
   * Schedule periodic cleanup of old audit logs
   */
  private scheduleAuditCleanup(): void {
    // Run cleanup once a day
    setInterval(() => this.cleanupOldAuditLogs(), 24 * 60 * 60 * 1000);
    
    // Also run once on startup
    this.cleanupOldAuditLogs();
  }

  /**
   * Clean up old audit logs based on retention policy
   */
  private async cleanupOldAuditLogs(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
      
      const result = await this.prisma.$executeRaw`
        DELETE FROM "ConfigAudit"
        WHERE "createdAt" < ${cutoffDate}
      `;
      
      if (result > 0) {
        this.logger.log(`Cleaned up ${result} audit logs older than ${this.retentionDays} days`);
      }
    } catch (error) {
      this.logger.error('Failed to clean up old audit logs', error);
    }
  }

  /**
   * Create an audit log entry with enhanced metadata
   */
  async createAuditLog(
    configValueId: string,
    oldValue: string | null,
    newValue: string | null,
    changedBy: string,
    environment: string | null,
    platform: PlatformType | null,
    metadata?: Record<string, any>
  ): Promise<void> {
    // Add detail level to metadata
    const enhancedMetadata = {
      ...metadata,
      detailLevel: this.detailLevel,
      timestamp: new Date().toISOString(),
    };
    
    // For basic detail level, simplify values
    let processedOldValue = oldValue;
    let processedNewValue = newValue;
    
    if (this.detailLevel === 'basic') {
      // For basic level, just indicate change happened but don't store values
      processedOldValue = oldValue ? '[previous-value]' : null;
      processedNewValue = newValue ? '[new-value]' : null;
    }
    
    await this.prisma.configAudit.create({
      data: {
        configValueId,
        oldValue: processedOldValue,
        newValue: processedNewValue,
        changedBy,
        environment,
        platform,
        // Store additional metadata as JSON
        metadata: enhancedMetadata,
      },
    });
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async getAuditLogs(filter: AuditLogFilter = {}): Promise<AuditLogPage> {
    const {
      key,
      userId,
      environment,
      platform,
      fromDate,
      toDate,
      page = 1,
      pageSize = 20,
    } = filter;

    // Build where clause
    const where: any = {};
    
    if (key) {
      where.configValue = {
        configKey: {
          key,
        },
      };
    }
    
    if (userId) {
      where.changedBy = userId;
    }
    
    if (environment !== undefined) {
      where.environment = environment;
    }
    
    if (platform !== undefined) {
      where.platform = platform;
    }
    
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = fromDate;
      }
      if (toDate) {
        where.createdAt.lte = toDate;
      }
    }

    // Get total count
    const total = await this.prisma.configAudit.count({ where });
    
    // Get paginated results
    const items = await this.prisma.configAudit.findMany({
      where,
      include: {
        configValue: {
          include: {
            configKey: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Format results
    const formattedItems: AuditLogEntry[] = items.map(item => {
      // Parse metadata if exists
      let metadata: Record<string, any> | undefined;
      if (item.metadata) {
        try {
          metadata = item.metadata as Record<string, any>;
        } catch (e) {
          // Ignore parsing errors
        }
      }
      
      return {
        id: item.id,
        configKey: item.configValue.configKey.key,
        configKeyId: item.configValue.configKeyId,
        oldValue: item.oldValue,
        newValue: item.newValue,
        changedBy: item.changedBy,
        environment: item.environment,
        platform: item.platform,
        createdAt: item.createdAt,
        metadata,
      };
    });

    return {
      items: formattedItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get audit history for a specific config key
   */
  async getConfigHistory(
    key: string, 
    limit = 10,
    environment?: string | null,
    platform?: PlatformType | null
  ): Promise<AuditLogEntry[]> {
    const where: any = {
      configValue: {
        configKey: {
          key,
        },
      },
    };
    
    if (environment !== undefined) {
      where.environment = environment;
    }
    
    if (platform !== undefined) {
      where.platform = platform;
    }
    
    const items = await this.prisma.configAudit.findMany({
      where,
      include: {
        configValue: {
          include: {
            configKey: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return items.map(item => ({
      id: item.id,
      configKey: item.configValue.configKey.key,
      configKeyId: item.configValue.configKeyId,
      oldValue: item.oldValue,
      newValue: item.newValue,
      changedBy: item.changedBy,
      environment: item.environment,
      platform: item.platform,
      createdAt: item.createdAt,
      metadata: item.metadata as Record<string, any> | undefined,
    }));
  }
} 