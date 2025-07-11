import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Serialize user to store in session
   */
  serializeUser(user: any, done: (err: Error | null, id?: string) => void): void {
    done(null, user.id || user.sub);
  }

  /**
   * Deserialize user from session
   */
  async deserializeUser(
    id: string,
    done: (err: Error | null, user?: any) => void,
  ): Promise<void> {
    try {
      // Find the user with their roles
      const user = await this.prisma.user.findUnique({
        where: { id },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!user) {
        return done(null, null);
      }

      // Extract roles for easier access
      const roles = user.userRoles.map(ur => ur.role.name);

      // Remove sensitive data
      const { password, ...result } = user;

      // Add roles to the user object
      const userWithRoles = {
        ...result,
        roles,
      };

      done(null, userWithRoles);
    } catch (error) {
      done(error);
    }
  }
} 