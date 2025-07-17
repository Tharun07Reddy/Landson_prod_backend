import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { MongoService } from './mongo.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService, EventData } from './analytics.service';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('events')
export class EventsController {
  constructor(
    private readonly mongoService: MongoService,
    private readonly prismaService: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get()
  @Public()
  async getEvents(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('type') type: string,
    @Query('source') source: string,
    @Query('userId') userId: string,
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
    
    if (type) {
      query.type = type;
    }
    
    if (source) {
      query.source = source;
    }
    
    if (userId) {
      query.userId = userId;
    }
    
    const options = {
      limit: limitNum,
      sort: { timestamp: sort === 'asc' ? 1 : -1 },
    };
    
    return this.mongoService.find('events', query, options);
  }

  @Get('types')
  @Public()
  async getEventTypes() {
    const result = await this.mongoService.aggregate('events', [
      { $group: { _id: '$type' } },
      { $sort: { _id: 1 } },
    ]);
    
    return result.map(item => item._id);
  }

  @Get('sources')
  async getEventSources() {
    const result = await this.mongoService.aggregate('events', [
      { $group: { _id: '$source' } },
      { $sort: { _id: 1 } },
    ]);
    
    return result.map(item => item._id);
  }

  @Get('summary')
  @Public()
  async getEventsSummary(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    
    // Get recent events from PostgreSQL for quick access
    const recentEvents = await this.prismaService.event.findMany({
      where: {
        timestamp: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        metadata: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 100,
    });
    
    // Get aggregated events from MongoDB
    const aggregatedEvents = await this.mongoService.aggregate('events', [
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
          _id: {
            type: '$type',
            source: '$source',
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);
    
    // Get event counts by hour
    const eventsByHour = await this.mongoService.aggregate('events', [
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
          _id: {
            hour: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$timestamp' } },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { '_id.hour': 1 },
      },
    ]);
    
    return {
      recent: recentEvents,
      aggregated: aggregatedEvents,
      byHour: eventsByHour,
    };
  }

  @Post()
  async trackEvent(@Body() eventData: EventData) {
    return this.analyticsService.trackEvent(eventData);
  }

  @Get(':type')
  async getEventsByType(
    @Param('type') type: string,
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
    const timeSeriesData = await this.mongoService.aggregate('events', [
      {
        $match: {
          type,
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
            source: '$source',
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { '_id.time': 1, '_id.source': 1 },
      },
    ]);
    
    // Get overall statistics
    const overallStats = await this.mongoService.aggregate('events', [
      {
        $match: {
          type,
          timestamp: {
            $gte: fromDate,
            $lte: toDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' },
          uniqueSessions: { $addToSet: '$sessionId' },
        },
      },
      {
        $project: {
          _id: 0,
          count: 1,
          uniqueUsers: { $size: '$uniqueUsers' },
          uniqueSessions: { $size: '$uniqueSessions' },
        },
      },
    ]);
    
    return {
      type,
      timeSeries: timeSeriesData,
      stats: overallStats[0] || { count: 0, uniqueUsers: 0, uniqueSessions: 0 },
    };
  }
} 