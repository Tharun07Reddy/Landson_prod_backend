import { Controller, Get, Query, Param, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ConfigAuditService, AuditLogFilter, AuditLogPage, AuditLogEntry } from './config-audit.service';

@Controller('config/audit')
export class ConfigAuditController {
  constructor(private readonly configAuditService: ConfigAuditService) {}

  /**
   * Get audit logs with filtering and pagination
   */
  @Get()
  async getAuditLogs(
    @Query('key') key?: string,
    @Query('userId') userId?: string,
    @Query('environment') environment?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize = 20,
  ): Promise<AuditLogPage> {
    const filter: AuditLogFilter = {
      key,
      userId,
      environment: environment || null,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      page,
      pageSize,
    };

    return this.configAuditService.getAuditLogs(filter);
  }

  /**
   * Get audit history for a specific config key
   */
  @Get('key/:key')
  async getConfigHistory(
    @Param('key') key: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ): Promise<AuditLogEntry[]> {
    return this.configAuditService.getConfigHistory(key, limit);
  }

  /**
   * Get audit logs by user
   */
  @Get('user/:userId')
  async getAuditLogsByUser(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize = 20,
  ): Promise<AuditLogPage> {
    return this.configAuditService.getAuditLogs({
      userId,
      page,
      pageSize,
    });
  }

  /**
   * Get audit logs by environment
   */
  @Get('environment/:env')
  async getAuditLogsByEnvironment(
    @Param('env') environment: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize = 20,
  ): Promise<AuditLogPage> {
    return this.configAuditService.getAuditLogs({
      environment,
      page,
      pageSize,
    });
  }

  /**
   * Get recent audit logs
   */
  @Get('recent')
  async getRecentAuditLogs(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ): Promise<AuditLogEntry[]> {
    const result = await this.configAuditService.getAuditLogs({
      page: 1,
      pageSize: limit,
    });
    return result.items;
  }
} 