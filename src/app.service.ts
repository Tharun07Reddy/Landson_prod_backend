import { Injectable } from '@nestjs/common';
import { hostname } from 'os';

@Injectable()
export class AppService {
  private startTime: Date;
  private serverInfo: {
    hostname: string;
    startTime: Date;
    uptime: number;
    memory: {
      used: number;
      total: number;
    };
  };

  constructor() {
    this.startTime = new Date();
    this.serverInfo = {
      hostname: hostname(),
      startTime: this.startTime,
      uptime: 0,
      memory: {
        used: 0,
        total: 0
      }
    };
  }

  getHello(): string {
    return 'Hello World!';
  }

  getHealth(): { status: string; timestamp: Date; serverInfo: any } {
    // Update server info
    const memoryUsage = process.memoryUsage();
    this.serverInfo.uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    this.serverInfo.memory = {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100
    };

    return {
      status: 'ok',
      timestamp: new Date(),
      serverInfo: this.serverInfo
    };
  }
}
