import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatSession, ChatMessage, ChatStatus, SenderType } from '@prisma/client';
import { randomUUID } from 'crypto';

interface CreateChatSessionDto {
  userId?: string;
  metadata?: Record<string, any>;
}

interface CreateChatMessageDto {
  chatSessionId: string;
  senderId?: string;
  senderType: SenderType;
  content: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new chat session
   */
  async createChatSession(data: CreateChatSessionDto): Promise<ChatSession> {
    try {
      // If userId is provided, check if user exists
      if (data.userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: data.userId },
        });
        
        if (!user) {
          throw new NotFoundException(`User with ID ${data.userId} not found`);
        }
      }
      
      // Generate a unique session key
      const sessionKey = randomUUID();
      
      // Create the chat session
      const session = await this.prisma.chatSession.create({
        data: {
          userId: data.userId,
          sessionKey,
          metadata: data.metadata || {},
        },
      });
      
      // Create initial system message
      await this.prisma.chatMessage.create({
        data: {
          chatSessionId: session.id,
          senderType: SenderType.SYSTEM,
          content: 'Welcome to our support chat. How can we help you today?',
        },
      });
      
      return session;
    } catch (error) {
      this.logger.error(`Error creating chat session: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a chat session by ID
   */
  async getChatSessionById(id: string, includeMessages = true): Promise<ChatSession | null> {
    try {
      return await this.prisma.chatSession.findUnique({
        where: { id },
        include: {
          messages: includeMessages ? {
            orderBy: {
              createdAt: 'asc',
            },
          } : false,
        },
      });
    } catch (error) {
      this.logger.error(`Error getting chat session by ID: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get a chat session by session key
   */
  async getChatSessionByKey(sessionKey: string, includeMessages = true): Promise<ChatSession | null> {
    try {
      return await this.prisma.chatSession.findUnique({
        where: { sessionKey },
        include: {
          messages: includeMessages ? {
            orderBy: {
              createdAt: 'asc',
            },
          } : false,
        },
      });
    } catch (error) {
      this.logger.error(`Error getting chat session by key: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Add a message to a chat session
   */
  async addChatMessage(data: CreateChatMessageDto): Promise<ChatMessage> {
    try {
      // Check if chat session exists and is active
      const session = await this.prisma.chatSession.findUnique({
        where: { id: data.chatSessionId },
      });
      
      if (!session) {
        throw new NotFoundException(`Chat session with ID ${data.chatSessionId} not found`);
      }
      
      if (session.status === ChatStatus.CLOSED) {
        throw new BadRequestException('Cannot add message to a closed chat session');
      }
      
      // If sender is USER and senderId is provided, check if user exists
      if (data.senderType === SenderType.USER && data.senderId) {
        const user = await this.prisma.user.findUnique({
          where: { id: data.senderId },
        });
        
        if (!user) {
          throw new NotFoundException(`User with ID ${data.senderId} not found`);
        }
      }
      
      // If sender is AGENT and senderId is provided, check if agent exists
      if (data.senderType === SenderType.AGENT && data.senderId) {
        const agent = await this.prisma.user.findUnique({
          where: { id: data.senderId },
        });
        
        if (!agent) {
          throw new NotFoundException(`Agent with ID ${data.senderId} not found`);
        }
        
        // If this is the first agent message, assign the agent to the chat session
        if (!session.agentId) {
          await this.prisma.chatSession.update({
            where: { id: data.chatSessionId },
            data: {
              agentId: data.senderId,
              status: ChatStatus.ACTIVE,
            },
          });
        }
      }
      
      // Create the message
      const message = await this.prisma.chatMessage.create({
        data: {
          chatSessionId: data.chatSessionId,
          senderId: data.senderId,
          senderType: data.senderType,
          content: data.content,
          isRead: data.senderType === SenderType.SYSTEM, // System messages are automatically read
        },
      });
      
      return message;
    } catch (error) {
      this.logger.error(`Error adding chat message: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(chatSessionId: string, senderType?: SenderType): Promise<number> {
    try {
      const where: any = {
        chatSessionId,
        isRead: false,
      };
      
      // If senderType is provided, only mark messages from that sender type as read
      if (senderType) {
        where.senderType = senderType;
      }
      
      const result = await this.prisma.chatMessage.updateMany({
        where,
        data: {
          isRead: true,
        },
      });
      
      return result.count;
    } catch (error) {
      this.logger.error(`Error marking messages as read: ${error.message}`, error.stack);
      return 0;
    }
  }

  /**
   * Update chat session status
   */
  async updateChatSessionStatus(id: string, status: ChatStatus): Promise<ChatSession> {
    try {
      // Check if chat session exists
      const session = await this.prisma.chatSession.findUnique({
        where: { id },
      });
      
      if (!session) {
        throw new NotFoundException(`Chat session with ID ${id} not found`);
      }
      
      // Update the session
      const updatedSession = await this.prisma.chatSession.update({
        where: { id },
        data: {
          status,
          // If closing the session, set endedAt
          endedAt: status === ChatStatus.CLOSED ? new Date() : undefined,
        },
      });
      
      // If closing the session, add a system message
      if (status === ChatStatus.CLOSED) {
        await this.prisma.chatMessage.create({
          data: {
            chatSessionId: id,
            senderType: SenderType.SYSTEM,
            content: 'This chat session has been closed.',
            isRead: true,
          },
        });
      }
      
      return updatedSession;
    } catch (error) {
      this.logger.error(`Error updating chat session status: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Assign an agent to a chat session
   */
  async assignAgentToSession(sessionId: string, agentId: string): Promise<ChatSession> {
    try {
      // Check if chat session exists
      const session = await this.prisma.chatSession.findUnique({
        where: { id: sessionId },
      });
      
      if (!session) {
        throw new NotFoundException(`Chat session with ID ${sessionId} not found`);
      }
      
      // Check if agent exists
      const agent = await this.prisma.user.findUnique({
        where: { id: agentId },
      });
      
      if (!agent) {
        throw new NotFoundException(`Agent with ID ${agentId} not found`);
      }
      
      // Update the session
      const updatedSession = await this.prisma.chatSession.update({
        where: { id: sessionId },
        data: {
          agentId,
          status: ChatStatus.ACTIVE,
        },
      });
      
      // Add a system message
      await this.prisma.chatMessage.create({
        data: {
          chatSessionId: sessionId,
          senderType: SenderType.SYSTEM,
          content: `An agent has been assigned to this chat.`,
          isRead: true,
        },
      });
      
      return updatedSession;
    } catch (error) {
      this.logger.error(`Error assigning agent to session: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Transfer a chat session to another agent
   */
  async transferChatSession(sessionId: string, newAgentId: string): Promise<ChatSession> {
    try {
      // Check if chat session exists
      const session = await this.prisma.chatSession.findUnique({
        where: { id: sessionId },
      });
      
      if (!session) {
        throw new NotFoundException(`Chat session with ID ${sessionId} not found`);
      }
      
      // Check if new agent exists
      const newAgent = await this.prisma.user.findUnique({
        where: { id: newAgentId },
      });
      
      if (!newAgent) {
        throw new NotFoundException(`Agent with ID ${newAgentId} not found`);
      }
      
      // Update the session
      const updatedSession = await this.prisma.chatSession.update({
        where: { id: sessionId },
        data: {
          agentId: newAgentId,
          status: ChatStatus.TRANSFERRED,
        },
      });
      
      // Add a system message
      await this.prisma.chatMessage.create({
        data: {
          chatSessionId: sessionId,
          senderType: SenderType.SYSTEM,
          content: `This chat has been transferred to another agent.`,
          isRead: true,
        },
      });
      
      return updatedSession;
    } catch (error) {
      this.logger.error(`Error transferring chat session: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get active chat sessions for an agent
   */
  async getAgentActiveSessions(agentId: string): Promise<ChatSession[]> {
    try {
      return await this.prisma.chatSession.findMany({
        where: {
          agentId,
          status: {
            in: [ChatStatus.ACTIVE, ChatStatus.TRANSFERRED],
          },
        },
        include: {
          _count: {
            select: {
              messages: true,
            },
          },
        },
        orderBy: {
          startedAt: 'desc',
        },
      });
    } catch (error) {
      this.logger.error(`Error getting agent active sessions: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get waiting chat sessions (no agent assigned)
   */
  async getWaitingChatSessions(): Promise<ChatSession[]> {
    try {
      return await this.prisma.chatSession.findMany({
        where: {
          agentId: null,
          status: ChatStatus.WAITING,
        },
        include: {
          _count: {
            select: {
              messages: true,
            },
          },
        },
        orderBy: {
          startedAt: 'asc', // Oldest first (FIFO)
        },
      });
    } catch (error) {
      this.logger.error(`Error getting waiting chat sessions: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get chat statistics
   */
  async getChatStatistics(days = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Get total sessions
      const totalSessions = await this.prisma.chatSession.count({
        where: {
          startedAt: {
            gte: startDate,
          },
        },
      });
      
      // Get sessions by status
      const sessionsByStatus = await this.prisma.chatSession.groupBy({
        by: ['status'],
        where: {
          startedAt: {
            gte: startDate,
          },
        },
        _count: {
          id: true,
        },
      });
      
      // Get average session duration for closed sessions
      const closedSessions = await this.prisma.chatSession.findMany({
        where: {
          status: ChatStatus.CLOSED,
          startedAt: {
            gte: startDate,
          },
          endedAt: {
            not: null,
          },
        },
        select: {
          startedAt: true,
          endedAt: true,
        },
      });
      
      let averageDurationMinutes = 0;
      
      if (closedSessions.length > 0) {
        const totalDurationMs = closedSessions.reduce((total, session) => {
          const durationMs = session.endedAt!.getTime() - session.startedAt.getTime();
          return total + durationMs;
        }, 0);
        
        averageDurationMinutes = totalDurationMs / (closedSessions.length * 60000); // Convert ms to minutes
      }
      
      // Format the status counts
      const formattedStatusCounts = Object.values(ChatStatus).reduce((acc, status) => {
        const found = sessionsByStatus.find(s => s.status === status);
        acc[status] = found ? found._count.id : 0;
        return acc;
      }, {} as Record<string, number>);
      
      return {
        totalSessions,
        sessionsByStatus: formattedStatusCounts,
        averageDurationMinutes,
        activeChats: formattedStatusCounts[ChatStatus.ACTIVE] || 0,
        waitingChats: formattedStatusCounts[ChatStatus.WAITING] || 0,
      };
    } catch (error) {
      this.logger.error(`Error getting chat statistics: ${error.message}`, error.stack);
      return {
        totalSessions: 0,
        sessionsByStatus: {},
        averageDurationMinutes: 0,
        activeChats: 0,
        waitingChats: 0,
      };
    }
  }

  /**
   * Set agent schedule
   */
  async setAgentSchedule(
    agentId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
  ): Promise<any> {
    try {
      // Validate inputs
      if (dayOfWeek < 0 || dayOfWeek > 6) {
        throw new BadRequestException('Day of week must be between 0 (Sunday) and 6 (Saturday)');
      }
      
      // Check if agent exists
      const agent = await this.prisma.user.findUnique({
        where: { id: agentId },
      });
      
      if (!agent) {
        throw new NotFoundException(`Agent with ID ${agentId} not found`);
      }
      
      // Check if schedule already exists for this agent and day
      const existingSchedule = await this.prisma.agentSchedule.findUnique({
        where: {
          agentId_dayOfWeek: {
            agentId,
            dayOfWeek,
          },
        },
      });
      
      if (existingSchedule) {
        // Update existing schedule
        return await this.prisma.agentSchedule.update({
          where: {
            id: existingSchedule.id,
          },
          data: {
            startTime,
            endTime,
            isActive: true,
          },
        });
      } else {
        // Create new schedule
        return await this.prisma.agentSchedule.create({
          data: {
            agentId,
            dayOfWeek,
            startTime,
            endTime,
          },
        });
      }
    } catch (error) {
      this.logger.error(`Error setting agent schedule: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get agent schedule
   */
  async getAgentSchedule(agentId: string): Promise<any[]> {
    try {
      return await this.prisma.agentSchedule.findMany({
        where: {
          agentId,
        },
        orderBy: {
          dayOfWeek: 'asc',
        },
      });
    } catch (error) {
      this.logger.error(`Error getting agent schedule: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Delete agent schedule for a specific day
   */
  async deleteAgentSchedule(agentId: string, dayOfWeek: number): Promise<boolean> {
    try {
      const result = await this.prisma.agentSchedule.deleteMany({
        where: {
          agentId,
          dayOfWeek,
        },
      });
      
      return result.count > 0;
    } catch (error) {
      this.logger.error(`Error deleting agent schedule: ${error.message}`, error.stack);
      return false;
    }
  }
} 