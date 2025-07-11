import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NetworkService } from './network/network.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Get network service for configuration
  const networkService = app.get(NetworkService);
  
  // Apply CORS configuration
  app.enableCors(networkService.getCorsConfig());
  
  // Apply other network configurations as needed
  
  await app.listen(process.env.PORT ?? 5000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
