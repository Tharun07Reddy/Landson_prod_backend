import { Controller, Get, Query, Param } from '@nestjs/common';
import { MongoService } from './mongo.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly mongoService: MongoService,
    private readonly prismaService: PrismaService,
  ) {}

  @Get()
  async getMetrics(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('name') name: string,
    @Query('limit') limit = '100',
    @Query('sort') sort = 'desc',
  ) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    const limitNum = parseInt(limit, 10);
    
    const query: any = {
      timestamp: {
        $gte: fromDate,
        $lte: toDate,
      },
    };
    
    if (name) {
      query.name = name;
    }
    
    const options = {
      limit: limitNum,
      sort: { timestamp: sort === 'asc' ? 1 : -1 },
    };
    
    return this.mongoService.find('metrics', query, options);
  }

  @Get('names')
  async getMetricNames() {
    const result = await this.mongoService.aggregate('metrics', [
      { $group: { _id: '$name' } },
      { $sort: { _id: 1 } },
    ]);
    
    return result.map(item => item._id);
  }

  @Get('summary')
  async getMetricsSummary(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    
    // Get recent metrics from PostgreSQL for quick access
    const recentMetrics = await this.prismaService.performanceMetric.findMany({
      where: {
        timestamp: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 100,
    });
    
    // Get aggregated metrics from MongoDB
    const aggregatedMetrics = await this.mongoService.aggregate('metrics', [
      {
        $match: {
          timestamp: {
            $gte: fromDate,
            $lte: toDate,
          },
        },
      },
      {
        $group: {
          _id: '$name',
          avg: { $avg: '$value' },
          min: { $min: '$value' },
          max: { $max: '$value' },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);
    
    return {
      recent: recentMetrics,
      aggregated: aggregatedMetrics,
    };
  }

  @Get(':name')
  async getMetricByName(
    @Param('name') name: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('interval') interval = 'hour',
  ) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    
    // Determine time format based on interval
    let format: string;
    switch (interval) {
      case 'minute':
        format = '%Y-%m-%d %H:%M';
        break;
      case 'hour':
        format = '%Y-%m-%d %H:00';
        break;
      case 'day':
        format = '%Y-%m-%d';
        break;
      case 'week':
        format = '%Y-W%U';
        break;
      case 'month':
        format = '%Y-%m';
        break;
      default:
        format = '%Y-%m-%d %H:00';
    }
    
    // Get time-series data
    const timeSeriesData = await this.mongoService.aggregate('metrics', [
      {
        $match: {
          name,
          timestamp: {
            $gte: fromDate,
            $lte: toDate,
          },
        },
      },
      {
        $group: {
          _id: {
            time: { $dateToString: { format, date: '$timestamp' } },
          },
          avg: { $avg: '$value' },
          min: { $min: '$value' },
          max: { $max: '$value' },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { '_id.time': 1 },
      },
    ]);
    
    // Get overall statistics
    const overallStats = await this.mongoService.aggregate('metrics', [
      {
        $match: {
          name,
          timestamp: {
            $gte: fromDate,
            $lte: toDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          avg: { $avg: '$value' },
          min: { $min: '$value' },
          max: { $max: '$value' },
          count: { $sum: 1 },
          p95: { $percentile: { input: '$value', p: 0.95 } },
        },
      },
    ]);
    
    return {
      name,
      timeSeries: timeSeriesData,
      stats: overallStats[0] || { avg: 0, min: 0, max: 0, count: 0 },
    };
  }
} 