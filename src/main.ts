import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NetworkService } from './network/network.service';
import * as cookieParser from 'cookie-parser';
import * as http from 'http';
import * as https from 'https';

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
  const productionUrl = process.env.PRODUCTION_URL || 'https://api.v1.landsonagri.in';
  setupKeepAlive(productionUrl);
}

function setupKeepAlive(appUrl: string) {
  try {
    // Extract hostname and path from URL
    const url = new URL(appUrl);
    const isHttps = url.protocol === 'https:';
    const hostname = url.hostname;
    const port = url.port || (isHttps ? '443' : '80');
    const path = '/ping';
    
    console.log(`Setting up keep-alive for ${appUrl} (${hostname}:${port}${path})`);
    
    // Set up interval to ping the server every 30 seconds
    setInterval(() => {
      const requestLib = isHttps ? https : http;
      
      const req = requestLib.request({
        hostname,
        port,
        path,
        method: 'GET',
        timeout: 10000, // 10 second timeout
        headers: {
          'User-Agent': 'KeepAliveService/1.0',
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log(`[${new Date().toISOString()}] Keep-alive ping successful (${res.statusCode})`);
          } else {
            console.warn(`[${new Date().toISOString()}] Keep-alive ping returned status ${res.statusCode}`);
          }
        });
      });
      
      req.on('error', (error) => {
        console.error(`[${new Date().toISOString()}] Keep-alive ping failed:`, error.message);
      });
      
      req.on('timeout', () => {
        console.error(`[${new Date().toISOString()}] Keep-alive ping timed out`);
        req.destroy();
      });
      
      req.end();
    }, 30000); // 30 seconds
    
    console.log('Keep-alive service started, pinging server every 30 seconds');
  } catch (error) {
    console.error('Failed to setup keep-alive service:', error);
  }
}

bootstrap();
