import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NetworkService } from './network/network.service';
import * as cookieParser from 'cookie-parser';
import * as http from 'http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Get network service for configuration
  const networkService = app.get(NetworkService);
  
  // Apply CORS configuration
  app.enableCors(networkService.getCorsConfig());
  
  // Use cookie parser middleware
  app.use(cookieParser());
  
  // Apply other network configurations as needed
  
  await app.listen(process.env.PORT ?? 5000);
  console.log(`Application is running on: ${await app.getUrl()}`);
  
  // Set up keep-alive mechanism to prevent server from sleeping
  setupKeepAlive(await app.getUrl());
}

function setupKeepAlive(appUrl: string) {
  // Extract hostname and port from URL
  const url = new URL(appUrl);
  const hostname = url.hostname;
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  
  // Set up interval to ping the server every 30 seconds
  setInterval(() => {
    const req = http.request({
      hostname,
      port,
      path: '/ping',
      method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log(`[${new Date().toISOString()}] Keep-alive ping successful: ${data}`);
      });
    });
    
    req.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] Keep-alive ping failed:`, error.message);
    });
    
    req.end();
  }, 30000); // 30 seconds
  
  console.log('Keep-alive service started, pinging server every 30 seconds');
}

bootstrap();
