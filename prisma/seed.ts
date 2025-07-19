import { PrismaClient, PlatformType, ValueType, ServiceType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  try {
    // ==================== CONFIGURATION CATEGORIES ====================
    console.log('Creating configuration categories...');
    
    const securityCategory = await prisma.configCategory.upsert({
      where: { name: 'security' },
      update: {},
      create: {
        name: 'security',
        description: 'Security-related configuration settings',
      },
    });

    const networkCategory = await prisma.configCategory.upsert({
      where: { name: 'network' },
      update: {},
      create: {
        name: 'network',
        description: 'Network and connectivity settings',
      },
    });

    const notificationCategory = await prisma.configCategory.upsert({
      where: { name: 'notifications' },
      update: {},
      create: {
        name: 'notifications',
        description: 'Notification service settings',
      },
    });

    const serviceCategory = await prisma.configCategory.upsert({
      where: { name: 'services' },
      update: {},
      create: {
        name: 'services',
        description: 'External service configurations',
      },
    });

    // ==================== CONFIGURATION KEYS ====================
    console.log('Creating configuration keys...');

    // JWT Configuration
    const jwtSecret = await prisma.configKey.upsert({
      where: { key: 'JWT_SECRET' },
      update: {},
      create: {
        key: 'JWT_SECRET',
        description: 'Secret key for JWT token signing',
        categoryId: securityCategory.id,
        isSecret: true,
        valueType: ValueType.STRING,
      },
    });

    const jwtExpiration = await prisma.configKey.upsert({
      where: { key: 'JWT_EXPIRATION' },
      update: {},
      create: {
        key: 'JWT_EXPIRATION',
        description: 'Default JWT token expiration time',
        categoryId: securityCategory.id,
        defaultValue: '"15m"',
        valueType: ValueType.STRING,
      },
    });

    // Platform-specific JWT expirations
    const jwtWebExpiration = await prisma.configKey.upsert({
      where: { key: 'JWT_WEB_EXPIRATION' },
      update: {},
      create: {
        key: 'JWT_WEB_EXPIRATION',
        description: 'JWT token expiration time for web platform',
        categoryId: securityCategory.id,
        defaultValue: '"15m"',
        valueType: ValueType.STRING,
      },
    });

    const jwtWebRefreshExpiration = await prisma.configKey.upsert({
      where: { key: 'JWT_WEB_REFRESH_EXPIRATION' },
      update: {},
      create: {
        key: 'JWT_WEB_REFRESH_EXPIRATION',
        description: 'JWT refresh token expiration time for web platform',
        categoryId: securityCategory.id,
        defaultValue: '"30d"',
        valueType: ValueType.STRING,
      },
    });

    const jwtAndroidExpiration = await prisma.configKey.upsert({
      where: { key: 'JWT_ANDROID_EXPIRATION' },
      update: {},
      create: {
        key: 'JWT_ANDROID_EXPIRATION',
        description: 'JWT token expiration time for Android platform',
        categoryId: securityCategory.id,
        defaultValue: '"30d"',
        valueType: ValueType.STRING,
      },
    });

    const jwtAndroidRefreshExpiration = await prisma.configKey.upsert({
      where: { key: 'JWT_ANDROID_REFRESH_EXPIRATION' },
      update: {},
      create: {
        key: 'JWT_ANDROID_REFRESH_EXPIRATION',
        description: 'JWT refresh token expiration time for Android platform',
        categoryId: securityCategory.id,
        defaultValue: '"180d"',
        valueType: ValueType.STRING,
      },
    });

    const jwtIosExpiration = await prisma.configKey.upsert({
      where: { key: 'JWT_IOS_EXPIRATION' },
      update: {},
      create: {
        key: 'JWT_IOS_EXPIRATION',
        description: 'JWT token expiration time for iOS platform',
        categoryId: securityCategory.id,
        defaultValue: '"30d"',
        valueType: ValueType.STRING,
      },
    });

    const jwtIosRefreshExpiration = await prisma.configKey.upsert({
      where: { key: 'JWT_IOS_REFRESH_EXPIRATION' },
      update: {},
      create: {
        key: 'JWT_IOS_REFRESH_EXPIRATION',
        description: 'JWT refresh token expiration time for iOS platform',
        categoryId: securityCategory.id,
        defaultValue: '"180d"',
        valueType: ValueType.STRING,
      },
    });

    const jwtDesktopExpiration = await prisma.configKey.upsert({
      where: { key: 'JWT_DESKTOP_EXPIRATION' },
      update: {},
      create: {
        key: 'JWT_DESKTOP_EXPIRATION',
        description: 'JWT token expiration time for desktop platforms',
        categoryId: securityCategory.id,
        defaultValue: '"7d"',
        valueType: ValueType.STRING,
      },
    });

    const jwtDesktopRefreshExpiration = await prisma.configKey.upsert({
      where: { key: 'JWT_DESKTOP_REFRESH_EXPIRATION' },
      update: {},
      create: {
        key: 'JWT_DESKTOP_REFRESH_EXPIRATION',
        description: 'JWT refresh token expiration time for desktop platforms',
        categoryId: securityCategory.id,
        defaultValue: '"60d"',
        valueType: ValueType.STRING,
      },
    });

    // Twilio SMS Configuration
    const twilioAccountSid = await prisma.configKey.upsert({
      where: { key: 'TWILIO_ACCOUNT_SID' },
      update: {},
      create: {
        key: 'TWILIO_ACCOUNT_SID',
        description: 'Twilio account SID for SMS service',
        categoryId: serviceCategory.id,
        isSecret: true,
        valueType: ValueType.STRING,
      },
    });

    const twilioAuthToken = await prisma.configKey.upsert({
      where: { key: 'TWILIO_AUTH_TOKEN' },
      update: {},
      create: {
        key: 'TWILIO_AUTH_TOKEN',
        description: 'Twilio auth token for SMS service',
        categoryId: serviceCategory.id,
        isSecret: true,
        valueType: ValueType.STRING,
      },
    });

    const twilioPhoneNumber = await prisma.configKey.upsert({
      where: { key: 'TWILIO_PHONE_NUMBER' },
      update: {},
      create: {
        key: 'TWILIO_PHONE_NUMBER',
        description: 'Twilio phone number for sending SMS',
        categoryId: serviceCategory.id,
        valueType: ValueType.STRING,
      },
    });

    // Feature Flags
    const enableSmsNotifications = await prisma.configKey.upsert({
      where: { key: 'enable-sms-notifications' },
      update: {},
      create: {
        key: 'enable-sms-notifications',
        description: 'Enable SMS notifications',
        categoryId: notificationCategory.id,
        defaultValue: 'true',
        valueType: ValueType.BOOLEAN,
      },
    });

    // Connection Settings
    const connectionKeepAliveTimeout = await prisma.configKey.upsert({
      where: { key: 'CONNECTION_KEEP_ALIVE_TIMEOUT' },
      update: {},
      create: {
        key: 'CONNECTION_KEEP_ALIVE_TIMEOUT',
        description: 'HTTP connection keep-alive timeout in milliseconds',
        categoryId: networkCategory.id,
        defaultValue: '60000',
        valueType: ValueType.NUMBER,
      },
    });

    const connectionMaxConnections = await prisma.configKey.upsert({
      where: { key: 'CONNECTION_MAX_CONNECTIONS' },
      update: {},
      create: {
        key: 'CONNECTION_MAX_CONNECTIONS',
        description: 'Maximum number of concurrent connections',
        categoryId: networkCategory.id,
        defaultValue: '10',
        valueType: ValueType.NUMBER,
      },
    });

    const connectionTimeout = await prisma.configKey.upsert({
      where: { key: 'CONNECTION_TIMEOUT' },
      update: {},
      create: {
        key: 'CONNECTION_TIMEOUT',
        description: 'Connection timeout in milliseconds',
        categoryId: networkCategory.id,
        defaultValue: '30000',
        valueType: ValueType.NUMBER,
      },
    });

    // ==================== NETWORK CONFIGURATIONS ====================
    console.log('Creating network configurations...');

    // Development CORS configuration
    await prisma.networkConfig.upsert({
      where: {
        name_environment_platform: {
          name: 'cors',
          environment: 'development',
          platform: PlatformType.ALL,
        },
      },
      update: {},
      create: {
        name: 'cors',
        environment: 'development',
        platform: PlatformType.ALL,
        isEnabled: true,
        config: JSON.stringify({
          origin: true, // Allow all origins in development
          methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
          preflightContinue: false,
          optionsSuccessStatus: 204,
          credentials: true,
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform', 'X-Device-Id'],
          exposedHeaders: ['Content-Disposition', 'X-Suggested-Filename'],
        }),
      },
    });

    // Production CORS configuration - Web
    await prisma.networkConfig.upsert({
      where: {
        name_environment_platform: {
          name: 'cors',
          environment: 'production',
          platform: PlatformType.WEB,
        },
      },
      update: {},
      create: {
        name: 'cors',
        environment: 'production',
        platform: PlatformType.WEB,
        isEnabled: true,
        config: JSON.stringify({
          origin: [
            'http://localhost:3000',
            'http://localhost:3001',
            'https://landsonagri.in',
            'https://management.landsonagri.in',
            'https://developer.landsonagri.in',
          ],
          methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
          preflightContinue: false,
          optionsSuccessStatus: 204,
          credentials: true,
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform', 'X-Device-Id'],
          exposedHeaders: ['Content-Disposition', 'X-Suggested-Filename'],
        }),
      },
    });

    // Production CORS configuration - Mobile Android
    await prisma.networkConfig.upsert({
      where: {
        name_environment_platform: {
          name: 'cors',
          environment: 'production',
          platform: PlatformType.MOBILE_ANDROID,
        },
      },
      update: {},
      create: {
        name: 'cors',
        environment: 'production',
        platform: PlatformType.MOBILE_ANDROID,
        isEnabled: true,
        config: JSON.stringify({
          origin: '*', // Mobile apps typically don't need CORS restrictions
          methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
          preflightContinue: false,
          optionsSuccessStatus: 204,
          credentials: true,
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform', 'X-Device-Id'],
          exposedHeaders: ['Content-Disposition', 'X-Suggested-Filename'],
        }),
      },
    });

    // Same for iOS
    await prisma.networkConfig.upsert({
      where: {
        name_environment_platform: {
          name: 'cors',
          environment: 'production',
          platform: PlatformType.MOBILE_IOS,
        },
      },
      update: {},
      create: {
        name: 'cors',
        environment: 'production',
        platform: PlatformType.MOBILE_IOS,
        isEnabled: true,
        config: JSON.stringify({
          origin: '*',
          methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
          preflightContinue: false,
          optionsSuccessStatus: 204,
          credentials: true,
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform', 'X-Device-Id'],
          exposedHeaders: ['Content-Disposition', 'X-Suggested-Filename'],
        }),
      },
    });

    // ==================== RATE LIMITING RULES ====================
    console.log('Creating rate limiting rules...');

    // Global rate limiting for development (more permissive)
    await prisma.rateLimitRule.upsert({
      where: {
        path_method_environment_platform: {
          path: '.*',
          method: '',
          environment: 'development',
          platform: PlatformType.ALL,
        },
      },
      update: {},
      create: {
        path: '.*',
        method: '',
        limit: 1000,
        windowSec: 60,
        isEnabled: true,
        environment: 'development',
        platform: PlatformType.ALL,
      },
    });

    // Global rate limiting for production (stricter)
    await prisma.rateLimitRule.upsert({
      where: {
        path_method_environment_platform: {
          path: '.*',
          method: '',
          environment: 'production',
          platform: PlatformType.ALL,
        },
      },
      update: {},
      create: {
        path: '.*',
        method: '',
        limit: 300,
        windowSec: 60,
        isEnabled: true,
        environment: 'production',
        platform: PlatformType.ALL,
      },
    });

    // Stricter rate limiting for auth endpoints
    await prisma.rateLimitRule.upsert({
      where: {
        path_method_environment_platform: {
          path: '/auth/.*',
          method: '',
          environment: 'production',
          platform: PlatformType.ALL,
        },
      },
      update: {},
      create: {
        path: '/auth/.*',
        method: '',
        limit: 20,
        windowSec: 60,
        isEnabled: true,
        environment: 'production',
        platform: PlatformType.ALL,
      },
    });

    // Very strict rate limiting for login attempts
    await prisma.rateLimitRule.upsert({
      where: {
        path_method_environment_platform: {
          path: '/auth/login',
          method: 'POST',
          environment: 'production',
          platform: PlatformType.ALL,
        },
      },
      update: {},
      create: {
        path: '/auth/login',
        method: 'POST',
        limit: 5,
        windowSec: 60,
        isEnabled: true,
        environment: 'production',
        platform: PlatformType.ALL,
      },
    });

    // ==================== SERVICES ====================
    console.log('Creating services...');

    // SMS Service
    const smsService = await prisma.service.upsert({
      where: { name: 'twilio-sms' },
      update: {},
      create: {
        name: 'twilio-sms',
        description: 'Twilio SMS service for sending text messages',
        serviceType: ServiceType.SMS,
        isEnabled: true,
      },
    });

    // Connect SMS service to its required configs
    await prisma.serviceConfig.upsert({
      where: { 
        serviceId_configKeyId: {
          serviceId: smsService.id,
          configKeyId: twilioAccountSid.id,
        }
      },
      update: {},
      create: {
        serviceId: smsService.id,
        configKeyId: twilioAccountSid.id,
        isRequired: true,
      },
    });

    await prisma.serviceConfig.upsert({
      where: { 
        serviceId_configKeyId: {
          serviceId: smsService.id,
          configKeyId: twilioAuthToken.id,
        }
      },
      update: {},
      create: {
        serviceId: smsService.id,
        configKeyId: twilioAuthToken.id,
        isRequired: true,
      },
    });

    await prisma.serviceConfig.upsert({
      where: { 
        serviceId_configKeyId: {
          serviceId: smsService.id,
          configKeyId: twilioPhoneNumber.id,
        }
      },
      update: {},
      create: {
        serviceId: smsService.id,
        configKeyId: twilioPhoneNumber.id,
        isRequired: true,
      },
    });

    // ==================== FEATURE FLAGS ====================
    console.log('Creating feature flags...');

    // SMS notifications feature flag
    await prisma.featureFlag.upsert({
      where: {
        name_environment_platform: {
          name: 'enable-sms-notifications',
          environment: '',
          platform: PlatformType.ALL,
        },
      },
      update: {},
      create: {
        name: 'enable-sms-notifications',
        description: 'Enable SMS notifications',
        isEnabled: true,
        environment: '',
        platform: PlatformType.ALL,
      },
    });

    console.log('Database seeding completed successfully');
  } catch (error) {
    console.error('Error during seeding operation:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('Error during database seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 