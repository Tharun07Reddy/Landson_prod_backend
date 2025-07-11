import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../session/session.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-default-secret',
    });
  }

  async validate(payload: any) {
    // Extract user ID from the JWT payload
    const userId = payload.sub;
    
    // Check if the user exists and is active
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // If a session ID is provided, validate the session
    if (payload.sessionId) {
      const isValidSession = await this.sessionService.validateSession(payload.sessionId);
      if (!isValidSession) {
        throw new UnauthorizedException('Invalid or expired session');
      }
      
      // Update the session's last active timestamp
      await this.sessionService.updateSessionActivity(payload.sessionId);
    }

    // Extract roles for easier access in guards
    const roles = user.userRoles.map(ur => ur.role.name);

    // Return the user object to be added to the request
    return {
      sub: user.id,
      username: user.username,
      email: user.email,
      roles,
      sessionId: payload.sessionId,
      platform: payload.platform,
    };
  }
} 