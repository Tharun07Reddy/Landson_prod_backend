# Configuration System

This document explains how the configuration system works and how to properly set up your environment.

## Overview

The application uses a multi-layered configuration system with the following priority:

1. Runtime overrides (temporary configurations set during runtime)
2. Database configurations (with platform & environment specificity)
3. Environment variables
4. Default values

## Environment Setup

The application requires minimal environment variables. Create a `.env` file in the root directory with:

```
# Environment
NODE_ENV=development  # or production

# Database
DATABASE_URL="postgresql://username:password@localhost:5432/mydb?schema=public"
```

All other configuration is stored in the database and managed through the ConfigService.

## Database Configuration

The database stores configurations with support for:
- Different environments (development, production)
- Platform-specific settings (web, mobile, desktop)
- Feature flags
- Service configurations

### Initial Setup

To initialize the database with default configurations:

```bash
# Run migrations first
npx prisma migrate dev

# Seed the database with default configurations
npx prisma db seed
```

## Configuration Categories

Configurations are organized into the following categories:

### Security
- JWT tokens and authentication
- Password policies
- Security headers

### Network
- CORS settings
- Rate limiting rules
- Connection settings

### Services
- External service configurations (Twilio, etc.)
- API keys and credentials

### Notifications
- Email templates
- SMS settings
- Push notification configurations

## CORS Configuration

CORS is configured separately for each environment and platform:

- **Development**: Permissive CORS settings for local development
- **Production**: Strict CORS settings with proper origin restrictions
  - Web: Specific allowed origins
  - Mobile: More permissive settings
  - Desktop: App-specific origins

## Rate Limiting

Rate limiting rules are defined per:
- Environment
- Platform
- API path
- HTTP method

Rules are applied in order of specificity, with more specific rules taking precedence.

## Security Headers

The application automatically applies security headers based on the environment:

- **Development**: Basic security headers
- **Production**: Strict security headers including:
  - Content-Security-Policy
  - Strict-Transport-Security
  - X-Content-Type-Options
  - X-Frame-Options
  - X-XSS-Protection
  - Referrer-Policy

## SMS Configuration

To configure SMS functionality:

1. Ensure the database is seeded with proper configurations
2. Update the Twilio credentials in the database:
   - TWILIO_ACCOUNT_SID
   - TWILIO_AUTH_TOKEN
   - TWILIO_PHONE_NUMBER
3. Enable the SMS feature flag: `enable-sms-notifications`

## Managing Configurations

Configurations can be managed through:

1. The ConfigService API
2. The admin interface at `/admin/config`
3. Direct database updates (not recommended for production)

## Environment-Specific Configurations

The system automatically loads the appropriate configurations based on the NODE_ENV environment variable:

- `development`: Development settings with more logging and permissive security
- `production`: Production settings with strict security and optimized performance

## Troubleshooting

If configurations are not loading correctly:

1. Check the NODE_ENV environment variable
2. Verify database connectivity
3. Check logs for configuration loading errors
4. Run `npx prisma db seed` to reset configurations to defaults

For SMS-specific issues:

1. Verify Twilio credentials in the database
2. Check that the SMS feature flag is enabled
3. Look for SMS-related errors in the logs 