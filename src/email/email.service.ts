import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import * as nodemailer from 'nodemailer';

interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private transporter: nodemailer.Transporter | null = null;
  private isConnected = false;
  private defaultFrom = '';

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    if (this.transporter) {
      this.transporter.close();
    }
    this.isConnected = false;
  }

  /**
   * Connect to SMTP server
   */
  async connect(): Promise<void> {
    try {
      const isEnabled = await this.configService.get<boolean>('enable-email-notifications', true);
      
      if (!isEnabled) {
        console.warn('Email service is disabled by feature flag');
        return;
      }

      const host = await this.configService.get<string>('SMTP_HOST', '');
      const port = await this.configService.get<number>('SMTP_PORT', 587);
      const user = await this.configService.get<string>('SMTP_USER', '');
      const pass = await this.configService.get<string>('SMTP_PASS', '');
      
      if (!host || !user || !pass) {
        console.warn('SMTP configuration incomplete, email service will be disabled');
        return;
      }

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });
      //console.log(this.transporter);
      // Verify connection
      await this.transporter.verify();
      
      // Fix: Ensure defaultFrom is always a string by using nullish coalescing
      const emailFrom = await this.configService.get<string>('EMAIL_FROM', user);
      this.defaultFrom = emailFrom ?? user ?? 'noreply@example.com';
      console.log(emailFrom);
      this.isConnected = true;
      console.log('Connected to SMTP server');
    } catch (error) {
      console.error('Failed to connect to SMTP server', error);
      this.isConnected = false;
    }
  }

  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.isConnected || !this.transporter) {
      return false;
    }

    try {
      const from = options.from || this.defaultFrom;
      
      await this.transporter.sendMail({
        from,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      });
      
      return true;
    } catch (error) {
      console.error('Error sending email', error);
      return false;
    }
  }

  /**
   * Send a template email
   */
  async sendTemplateEmail(
    template: string,
    data: Record<string, any>,
    options: Omit<EmailOptions, 'html' | 'text'>,
  ): Promise<boolean> {
    // In a real implementation, this would use a template engine
    // For now, we'll just do a simple variable replacement
    let html = template;
    
    // Replace variables in the template
    Object.entries(data).forEach(([key, value]) => {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    });

    return this.sendEmail({
      ...options,
      html,
    });
  }

  /**
   * Check if email service is connected
   */
  isReady(): boolean {
    return this.isConnected;
  }
} 