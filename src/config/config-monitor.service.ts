import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigKey, PlatformType } from '@prisma/client';
import { ConfigService } from './config.service';

export interface ConfigChangeEvent {
  key: string;
  oldValue: any;
  newValue: any;
  userId: string;
  environment?: string | null;
  platform?: PlatformType | null;
  timestamp: Date;
  isCritical: boolean;
}

@Injectable()
export class ConfigMonitorService implements OnModuleInit {
  private readonly logger = new Logger(ConfigMonitorService.name);
  private criticalConfigs: Set<string> = new Set();
  private isEnabled = true;
  private notificationEmail: string = '';
  private webhookUrl: string = '';

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => ConfigService))
    private readonly configService: ConfigService
  ) {}

  async onModuleInit() {
    await this.loadConfiguration();
  }

  /**
   * Load monitoring configuration from database
   */
  async loadConfiguration(): Promise<void> {
    try {
      // Check if monitoring is enabled
      const monitoringEnabled = await this.configService.get<boolean>('ENABLE_CONFIG_MONITORING', true);
      this.isEnabled = monitoringEnabled ?? true;
      
      if (!this.isEnabled) {
        this.logger.log('Configuration monitoring is disabled');
        return;
      }

      // Load notification settings
      this.notificationEmail = await this.configService.get<string>('ALERT_NOTIFICATION_EMAIL', '') ?? '';
      this.webhookUrl = await this.configService.get<string>('ALERT_WEBHOOK_URL', '') ?? '';
      
      // Load critical config keys
      const criticalConfigsJson = await this.configService.get<string>('CRITICAL_CONFIG_KEYS', '[]');
      
      if (criticalConfigsJson) {
        try {
          // Ensure we have a string before calling trim()
          const configStr = typeof criticalConfigsJson === 'string' 
            ? criticalConfigsJson 
            : JSON.stringify(criticalConfigsJson);
            
          // Check if the string starts and ends with brackets to ensure it's an array
          if (configStr.startsWith('[') && configStr.endsWith(']')) {
            const criticalConfigsList = JSON.parse(configStr);
            if (Array.isArray(criticalConfigsList)) {
              this.criticalConfigs = new Set(criticalConfigsList);
              this.logger.log(`Loaded ${this.criticalConfigs.size} critical configuration keys`);
            } else {
              this.logger.warn('Critical configs is not an array, using empty set');
              this.criticalConfigs = new Set();
            }
          } else {
            // If it's not a JSON array, treat it as a comma-separated list
            const configsList = configStr.split(',').map(item => 
              typeof item === 'string' ? item.trim() : String(item)
            );
            this.criticalConfigs = new Set(configsList);
            this.logger.log(`Loaded ${this.criticalConfigs.size} critical configuration keys from comma-separated list`);
          }
        } catch (error) {
          this.logger.error('Failed to parse critical configs list', error);
          // Initialize with empty set on error
          this.criticalConfigs = new Set();
        }
      }
    } catch (error) {
      this.logger.error('Failed to load monitoring configuration', error);
    }
  }

  /**
   * Register a configuration key as critical
   */
  registerCriticalConfig(key: string): void {
    this.criticalConfigs.add(key);
  }

  /**
   * Check if a configuration key is critical
   */
  isCriticalConfig(key: string): boolean {
    return this.criticalConfigs.has(key);
  }

  /**
   * Notify about a configuration change
   */
  notifyConfigChange(
    key: string, 
    oldValue: any, 
    newValue: any, 
    userId: string,
    environment?: string | null,
    platform?: PlatformType | null
  ): void {
    if (!this.isEnabled) return;
    
    const isCritical = this.isCriticalConfig(key);
    
    // Create change event
    const changeEvent: ConfigChangeEvent = {
      key,
      oldValue: this.sanitizeValue(key, oldValue),
      newValue: this.sanitizeValue(key, newValue),
      userId,
      environment,
      platform,
      timestamp: new Date(),
      isCritical
    };
    
    // Emit event for subscribers
    this.eventEmitter.emit('config.changed', changeEvent);
    
    // Log the change
    this.logConfigChange(changeEvent);
    
    // Send alerts for critical changes
    if (isCritical) {
      this.alertCriticalChange(changeEvent);
    }
  }

  /**
   * Sanitize sensitive values for logging
   */
  private sanitizeValue(key: string, value: any): any {
    if (!value) return value;
    
    // Mask sensitive values
    if (
      key.includes('PASSWORD') || 
      key.includes('SECRET') || 
      key.includes('KEY') || 
      key.includes('TOKEN') || 
      key.includes('AUTH') ||
      key.includes('URL') && (value.includes('password') || value.includes('pwd'))
    ) {
      if (typeof value === 'string') {
        return value.length > 8 
          ? `${value.substring(0, 3)}****${value.substring(value.length - 3)}`
          : '********';
      }
      return '********';
    }
    
    return value;
  }

  /**
   * Log configuration changes
   */
  private logConfigChange(event: ConfigChangeEvent): void {
    const logMessage = `Config '${event.key}' changed by ${event.userId}${
      event.environment ? ` in ${event.environment} environment` : ''
    }${
      event.platform ? ` for ${event.platform} platform` : ''
    }`;
    
    if (event.isCritical) {
      this.logger.warn(`CRITICAL ${logMessage}`);
    } else {
      this.logger.log(logMessage);
    }
  }

  /**
   * Alert on critical configuration changes
   */
  private alertCriticalChange(event: ConfigChangeEvent): void {
    // Log the critical change
    this.logger.warn(
      `🚨 CRITICAL CONFIGURATION CHANGED: ${event.key} by ${event.userId} at ${event.timestamp.toISOString()}${
        event.platform ? ` for platform ${event.platform}` : ''
      }`
    );
    
    // Send email notification if configured
    if (this.notificationEmail) {
      this.logger.log(`Would send email alert to ${this.notificationEmail} (not implemented)`);
      // In a real implementation, you would send an email here
    }
    
    // Send webhook notification if configured
    if (this.webhookUrl) {
      this.logger.log(`Would send webhook alert to ${this.webhookUrl} (not implemented)`);
      // In a real implementation, you would send a webhook notification here
    }
  }
} 