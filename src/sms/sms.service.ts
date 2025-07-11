import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { Twilio } from 'twilio';

interface SmsOptions {
  to: string;
  body: string;
  from?: string;
}

@Injectable()
export class SmsService implements OnModuleInit {
  private client: Twilio | null = null;
  private isConnected = false;
  private defaultFrom = '';

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  /**
   * Connect to Twilio
   */
  async connect(): Promise<void> {
    try {
      const isEnabled = await this.configService.get<boolean>('enable-sms-notifications', true);
      
      if (!isEnabled) {
        console.warn('SMS service is disabled by feature flag');
        return;
      }

      const accountSid = await this.configService.get<string>('TWILIO_ACCOUNT_SID', '');
      const authToken = await this.configService.get<string>('TWILIO_AUTH_TOKEN', '');
      
      if (!accountSid || !authToken) {
        console.warn('Twilio configuration incomplete, SMS service will be disabled');
        return;
      }

      this.client = new Twilio(accountSid, authToken);
      
      // Fix: Ensure defaultFrom is always a string by using nullish coalescing
      const phoneNumber = await this.configService.get<string>('TWILIO_PHONE_NUMBER', '');
      this.defaultFrom = phoneNumber ?? '+15555555555'; // Fallback to a placeholder number
      
      if (!this.defaultFrom) {
        console.warn('No default phone number configured for SMS service');
      }
      
      this.isConnected = true;
      console.log('Connected to Twilio');
    } catch (error) {
      console.error('Failed to connect to Twilio', error);
      this.isConnected = false;
    }
  }

  /**
   * Send an SMS
   */
  async sendSms(options: SmsOptions): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const from = options.from || this.defaultFrom;
      
      if (!from) {
        console.error('No from number provided for SMS');
        return false;
      }

      await this.client.messages.create({
        body: options.body,
        from,
        to: options.to,
      });
      
      return true;
    } catch (error) {
      console.error('Error sending SMS', error);
      return false;
    }
  }

  /**
   * Send a template SMS
   */
  async sendTemplateSms(
    template: string,
    data: Record<string, any>,
    options: Omit<SmsOptions, 'body'>,
  ): Promise<boolean> {
    // Replace variables in the template
    let body = template;
    
    Object.entries(data).forEach(([key, value]) => {
      body = body.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    });

    return this.sendSms({
      ...options,
      body,
    });
  }

  /**
   * Check if SMS service is connected
   */
  isReady(): boolean {
    return this.isConnected;
  }
} 