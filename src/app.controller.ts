import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigService } from './config/config.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @Public()
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('ping')
  @Public()
  ping() {
    return { 
      status: 'alive', 
      timestamp: new Date().toISOString() 
    };
  }

  @Get('config-demo')
  async configDemo() {
    // Get some configuration values
    const port = await this.configService.get('PORT', 5000);
    const corsOrigin = await this.configService.get('CORS_ORIGIN', '*');
    
    // Get all runtime overrides
    const overrides = this.configService.getOverrides();
    
    // Get all categories
    const categories = await this.configService.getCategories();
    
    // Return a demo object
    return {
      message: 'Configuration System Demo',
      config: {
        port,
        corsOrigin,
      },
      overrides,
      categories,
      note: 'You can set runtime overrides using POST /config/override/:key'
    };
  }
}
