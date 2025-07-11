import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsService } from '../../sms/sms.service';
import { EmailService } from '../../email/email.service';
import { OTPType } from '@prisma/client';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Generate a new OTP for a user
   */
  async generateOTP(userId: string, type: OTPType): Promise<{ code: string; expiresAt: Date }> {
    // Validate user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if we have the required contact info for the OTP type
    if (type === OTPType.EMAIL_VERIFICATION && !user.email) {
      throw new BadRequestException('User does not have an email address');
    }

    if (type === OTPType.PHONE_VERIFICATION && !user.phone) {
      throw new BadRequestException('User does not have a phone number');
    }

    // Invalidate any existing OTPs of the same type
    await this.prisma.oTP.updateMany({
      where: {
        userId,
        type,
        isUsed: false,
      },
      data: {
        isUsed: true,
      },
    });

    // Generate a new OTP code
    const code = this.generateOTPCode();
    const expiryMinutes = this.getOTPExpiryMinutes(type);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Create the OTP record
    const otp = await this.prisma.oTP.create({
      data: {
        userId,
        code,
        type,
        expiresAt,
        isUsed: false,
        attempts: 0,
        maxAttempts: this.getMaxAttempts(type),
      },
    });

    // Send the OTP via the appropriate channel
    try {
      if (type === OTPType.EMAIL_VERIFICATION || type === OTPType.PASSWORD_RESET) {
        await this.sendEmailOTP(user.email!, code, type, expiryMinutes);
      } else if (type === OTPType.PHONE_VERIFICATION || type === OTPType.TWO_FACTOR_AUTH) {
        await this.sendSmsOTP(user.phone!, code, type, expiryMinutes);
      }
    } catch (error) {
      this.logger.error(`Failed to send OTP: ${error.message}`, error.stack);
      // We still return the OTP even if sending fails, as it might be needed for testing or debugging
    }

    return {
      code,
      expiresAt,
    };
  }

  /**
   * Verify an OTP code
   */
  async verifyOTP(userId: string, code: string, type: OTPType): Promise<boolean> {
    // Find the active OTP
    const otp = await this.prisma.oTP.findFirst({
      where: {
        userId,
        type,
        isUsed: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otp) {
      throw new BadRequestException('No active OTP found or OTP has expired');
    }

    // Check if max attempts exceeded
    if (otp.attempts >= otp.maxAttempts) {
      throw new BadRequestException('Maximum verification attempts exceeded');
    }

    // Increment attempts
    await this.prisma.oTP.update({
      where: { id: otp.id },
      data: {
        attempts: {
          increment: 1,
        },
      },
    });

    // Verify the code
    if (otp.code !== code) {
      // If this was the last attempt, mark as used
      if (otp.attempts + 1 >= otp.maxAttempts) {
        await this.prisma.oTP.update({
          where: { id: otp.id },
          data: {
            isUsed: true,
          },
        });
      }
      throw new BadRequestException('Invalid verification code');
    }

    // Mark OTP as used
    await this.prisma.oTP.update({
      where: { id: otp.id },
      data: {
        isUsed: true,
      },
    });

    // Update user verification status
    if (type === OTPType.EMAIL_VERIFICATION) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isEmailVerified: true,
        },
      });
    } else if (type === OTPType.PHONE_VERIFICATION) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isPhoneVerified: true,
        },
      });
    }

    return true;
  }

  /**
   * Send OTP via SMS using the existing SMS service
   */
  private async sendSmsOTP(phone: string, code: string, type: OTPType, expiryMinutes: number): Promise<void> {
    try {
      // Get template based on OTP type
      const templateMessage = this.getSmsTemplate(type);
      
      // Send SMS using the existing SMS service
      const success = await this.smsService.sendTemplateSms(
        templateMessage,
        {
          code,
          minutes: expiryMinutes,
          type: this.getOTPTypeName(type)
        },
        { to: phone }
      );
      
      if (!success) {
        this.logger.warn(`SMS service failed to send OTP to ${phone}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send SMS: ${error.message}`, error.stack);
      throw new Error('Failed to send verification code');
    }
  }

  /**
   * Send OTP via email using the existing Email service
   */
  private async sendEmailOTP(email: string, code: string, type: OTPType, expiryMinutes: number): Promise<void> {
    try {
      // Get subject and template based on OTP type
      const subject = this.getEmailSubject(type);
      const templateHtml = this.getEmailTemplate(type);
      
      // Send email using the existing Email service
      const success = await this.emailService.sendTemplateEmail(
        templateHtml,
        {
          code,
          minutes: expiryMinutes,
          type: this.getOTPTypeName(type)
        },
        { 
          to: email,
          subject
        }
      );
      
      if (!success) {
        this.logger.warn(`Email service failed to send OTP to ${email}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      throw new Error('Failed to send verification code');
    }
  }

  /**
   * Generate a random OTP code
   */
  private generateOTPCode(length = 6): string {
    // For better security in production, use a crypto library
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Get OTP expiry time in minutes based on type
   */
  private getOTPExpiryMinutes(type: OTPType): number {
    switch (type) {
      case OTPType.EMAIL_VERIFICATION:
        return 60; // 1 hour
      case OTPType.PHONE_VERIFICATION:
        return 15; // 15 minutes
      case OTPType.PASSWORD_RESET:
        return 30; // 30 minutes
      case OTPType.TWO_FACTOR_AUTH:
        return 10; // 10 minutes
      default:
        return 15; // Default: 15 minutes
    }
  }

  /**
   * Get maximum allowed verification attempts based on OTP type
   */
  private getMaxAttempts(type: OTPType): number {
    switch (type) {
      case OTPType.TWO_FACTOR_AUTH:
        return 3; // More strict for 2FA
      default:
        return 5; // Default: 5 attempts
    }
  }
  
  /**
   * Get SMS template based on OTP type
   */
  private getSmsTemplate(type: OTPType): string {
    switch (type) {
      case OTPType.PHONE_VERIFICATION:
        return 'Your phone verification code is: {{code}}. Valid for {{minutes}} minutes.';
      case OTPType.TWO_FACTOR_AUTH:
        return 'Your authentication code is: {{code}}. Valid for {{minutes}} minutes.';
      case OTPType.PASSWORD_RESET:
        return 'Your password reset code is: {{code}}. Valid for {{minutes}} minutes.';
      default:
        return 'Your verification code is: {{code}}. Valid for {{minutes}} minutes.';
    }
  }
  
  /**
   * Get email subject based on OTP type
   */
  private getEmailSubject(type: OTPType): string {
    switch (type) {
      case OTPType.EMAIL_VERIFICATION:
        return 'Verify Your Email Address';
      case OTPType.PASSWORD_RESET:
        return 'Password Reset Request';
      default:
        return 'Verification Code';
    }
  }
  
  /**
   * Get email template based on OTP type
   */
  private getEmailTemplate(type: OTPType): string {
    // Simple HTML template - in production, you'd use proper HTML templates
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your {{type}} Code</h2>
        <p>Your verification code is:</p>
        <div style="background-color: #f4f4f4; padding: 15px; font-size: 24px; text-align: center; letter-spacing: 5px; font-weight: bold;">
          {{code}}
        </div>
        <p>This code is valid for {{minutes}} minutes.</p>
        <p>If you didn't request this code, please ignore this message.</p>
      </div>
    `;
  }
  
  /**
   * Get user-friendly name for OTP type
   */
  private getOTPTypeName(type: OTPType): string {
    switch (type) {
      case OTPType.EMAIL_VERIFICATION:
        return 'Email Verification';
      case OTPType.PHONE_VERIFICATION:
        return 'Phone Verification';
      case OTPType.PASSWORD_RESET:
        return 'Password Reset';
      case OTPType.TWO_FACTOR_AUTH:
        return 'Two-Factor Authentication';
      default:
        return 'Verification';
    }
  }
} 