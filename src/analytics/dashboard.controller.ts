import { Controller, Get, Post, Body, Param, Delete, Put, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MongoService } from './mongo.service';

@Controller('dashboards')
export class DashboardController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly mongoService: MongoService,
  ) {}

  @Get()
  async getAllDashboards() {
    return this.prismaService.dashboard.findMany({
      include: {
        widgets: true,
      },
    });
  }

  @Get(':id')
  async getDashboard(@Param('id') id: string) {
    return this.prismaService.dashboard.findUnique({
      where: { id },
      include: {
        widgets: true,
      },
    });
  }

  @Post()
  async createDashboard(@Body() data: any) {
    const { widgets, ...dashboardData } = data;
    
    return this.prismaService.dashboard.create({
      data: {
        ...dashboardData,
        widgets: {
          create: widgets || [],
        },
      },
      include: {
        widgets: true,
      },
    });
  }

  @Put(':id')
  async updateDashboard(@Param('id') id: string, @Body() data: any) {
    const { widgets, ...dashboardData } = data;
    
    // First update the dashboard
    const updatedDashboard = await this.prismaService.dashboard.update({
      where: { id },
      data: dashboardData,
    });
    
    // If widgets are provided, handle them separately
    if (widgets && Array.isArray(widgets)) {
      // Delete existing widgets
      await this.prismaService.dashboardWidget.deleteMany({
        where: { dashboardId: id },
      });
      
      // Create new widgets
      for (const widget of widgets) {
        await this.prismaService.dashboardWidget.create({
          data: {
            ...widget,
            dashboardId: id,
          },
        });
      }
    }
    
    // Return the updated dashboard with widgets
    return this.prismaService.dashboard.findUnique({
      where: { id },
      include: {
        widgets: true,
      },
    });
  }

  @Delete(':id')
  async deleteDashboard(@Param('id') id: string) {
    // Delete widgets first due to foreign key constraints
    await this.prismaService.dashboardWidget.deleteMany({
      where: { dashboardId: id },
    });
    
    // Then delete the dashboard
    return this.prismaService.dashboard.delete({
      where: { id },
    });
  }

  @Get(':id/data')
  async getDashboardData(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    // Get the dashboard with widgets
    const dashboard = await this.prismaService.dashboard.findUnique({
      where: { id },
      include: {
        widgets: true,
      },
    });
    
    if (!dashboard) {
      return { error: 'Dashboard not found' };
    }
    
    // Parse date range
    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default to last 24 hours
    const toDate = to ? new Date(to) : new Date();
    
    // Fetch data for each widget
    const widgetsWithData = await Promise.all(
      dashboard.widgets.map(async (widget) => {
        const data = await this.getWidgetData(widget, fromDate, toDate);
        return {
          ...widget,
          data,
        };
      })
    );
    
    return {
      ...dashboard,
      widgets: widgetsWithData,
    };
  }

  /**
   * Get data for a specific widget
   */
  private async getWidgetData(widget: any, fromDate: Date, toDate: Date) {
    const config = widget.config || {};
    const { dataSource, metric, aggregation, groupBy } = config;
    
    if (!dataSource) {
      return [];
    }
    
    // Build MongoDB aggregation pipeline
    const pipeline: any[] = [
      {
        $match: {
          timestamp: {
            $gte: fromDate,
            $lte: toDate,
          },
        },
      },
    ];
    
    // Add grouping if specified
    if (groupBy) {
      const groupStage: any = {
        $group: {
          _id: {},
        },
      };
      
      // Handle different group by fields
      if (groupBy === 'time') {
        const timeUnit = config.timeUnit || 'hour';
        let format: string;
        
        switch (timeUnit) {
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
        
        groupStage.$group._id = {
          time: { $dateToString: { format, date: '$timestamp' } },
        };
      } else {
        groupStage.$group._id[groupBy] = `$${groupBy}`;
      }
      
      // Add aggregation for the metric
      if (metric) {
        switch (aggregation) {
          case 'count':
            groupStage.$group.value = { $sum: 1 };
            break;
          case 'sum':
            groupStage.$group.value = { $sum: `$${metric}` };
            break;
          case 'avg':
            groupStage.$group.value = { $avg: `$${metric}` };
            break;
          case 'min':
            groupStage.$group.value = { $min: `$${metric}` };
            break;
          case 'max':
            groupStage.$group.value = { $max: `$${metric}` };
            break;
          default:
            groupStage.$group.value = { $sum: 1 };
        }
      } else {
        groupStage.$group.value = { $sum: 1 };
      }
      
      pipeline.push(groupStage);
    }
    
    // Add sort stage
    pipeline.push({
      $sort: { '_id.time': 1 },
    });
    
    // Execute the aggregation
    return this.mongoService.aggregate(dataSource, pipeline);
  }
} 