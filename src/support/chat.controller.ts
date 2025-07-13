import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ChatService } from './chat.service';
import { ChatStatus, SenderType } from '@prisma/client';
import { Request } from 'express';

// DTOs would normally be in separate files
class CreateChatSessionDto {
  metadata?: Record<string, any>;
}

class CreateChatMessageDto {
  content: string;
}

class SetAgentScheduleDto {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface RequestWithUser extends Request {
  user: {
    sub: string;
    username: string;
    email?: string;
    roles: string[];
  };
}

@Controller('support/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Create a new chat session
   */
  @Post('sessions')
  @Public()
  async createChatSession(
    @Body() createSessionDto: CreateChatSessionDto,
    @Req() req: Request,
  ): Promise<any> {
    // Get user ID if authenticated
    const user = (req as any).user;
    const userId = user?.sub;
    
    // Add client info to metadata
    const metadata = {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      ...createSessionDto.metadata,
    };
    
    const session = await this.chatService.createChatSession({
      userId,
      metadata,
    });
    
    return {
      sessionId: session.id,
      sessionKey: session.sessionKey,
    };
  }

  /**
   * Get a chat session by session key
   */
  @Get('sessions/:sessionKey')
  @Public()
  async getChatSessionByKey(@Param('sessionKey') sessionKey: string): Promise<any> {
    const session = await this.chatService.getChatSessionByKey(sessionKey);
    
    if (!session) {
      throw new NotFoundException(`Chat session with key ${sessionKey} not found`);
    }
    
    return session;
  }

  /**
   * Add a message to a chat session (from user)
   */
  @Post('sessions/:sessionKey/messages')
  @Public()
  async addUserChatMessage(
    @Param('sessionKey') sessionKey: string,
    @Body() createMessageDto: CreateChatMessageDto,
    @Req() req: Request,
  ): Promise<any> {
    // Get session
    const session = await this.chatService.getChatSessionByKey(sessionKey, false);
    
    if (!session) {
      throw new NotFoundException(`Chat session with key ${sessionKey} not found`);
    }
    
    // Check if session is closed
    if (session.status === ChatStatus.CLOSED) {
      throw new BadRequestException('Cannot add message to a closed chat session');
    }
    
    // Get user ID if authenticated
    const user = (req as any).user;
    const userId = user?.sub;
    
    // Add the message
    const message = await this.chatService.addChatMessage({
      chatSessionId: session.id,
      senderId: userId,
      senderType: SenderType.USER,
      content: createMessageDto.content,
    });
    
    // If session is in WAITING status, keep it there
    // If session is in any other status, update to ACTIVE
    if (session.status !== ChatStatus.WAITING) {
      await this.chatService.updateChatSessionStatus(session.id, ChatStatus.ACTIVE);
    }
    
    return message;
  }

  /**
   * Add a message to a chat session (from agent)
   */
  @Post('sessions/:id/agent-messages')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'update' })
  async addAgentChatMessage(
    @Param('id') id: string,
    @Body() createMessageDto: CreateChatMessageDto,
    @Req() req: RequestWithUser,
  ): Promise<any> {
    // Get session
    const session = await this.chatService.getChatSessionById(id, false);
    
    if (!session) {
      throw new NotFoundException(`Chat session with ID ${id} not found`);
    }
    
    // Check if session is closed
    if (session.status === ChatStatus.CLOSED) {
      throw new BadRequestException('Cannot add message to a closed chat session');
    }
    
    // Add the message
    const message = await this.chatService.addChatMessage({
      chatSessionId: id,
      senderId: req.user.sub,
      senderType: SenderType.AGENT,
      content: createMessageDto.content,
    });
    
    return message;
  }

  /**
   * Mark messages as read
   */
  @Put('sessions/:id/mark-read')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'update' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async markMessagesAsRead(
    @Param('id') id: string,
    @Query('senderType') senderType?: SenderType,
  ): Promise<void> {
    const count = await this.chatService.markMessagesAsRead(id, senderType);
    
    if (count === 0) {
      throw new BadRequestException('No messages were marked as read');
    }
  }

  /**
   * Update chat session status
   */
  @Put('sessions/:id/status/:status')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'update' })
  async updateChatSessionStatus(
    @Param('id') id: string,
    @Param('status') status: ChatStatus,
  ): Promise<any> {
    return await this.chatService.updateChatSessionStatus(id, status);
  }

  /**
   * Assign an agent to a chat session
   */
  @Put('sessions/:id/assign')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'update' })
  async assignAgentToSession(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ): Promise<any> {
    return await this.chatService.assignAgentToSession(id, req.user.sub);
  }

  /**
   * Transfer a chat session to another agent
   */
  @Put('sessions/:id/transfer/:agentId')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'update' })
  async transferChatSession(
    @Param('id') id: string,
    @Param('agentId') agentId: string,
  ): Promise<any> {
    return await this.chatService.transferChatSession(id, agentId);
  }

  /**
   * Get active chat sessions for current agent
   */
  @Get('my-sessions')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'read' })
  async getMyActiveSessions(@Req() req: RequestWithUser): Promise<any[]> {
    return await this.chatService.getAgentActiveSessions(req.user.sub);
  }

  /**
   * Get waiting chat sessions
   */
  @Get('waiting-sessions')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'read' })
  async getWaitingSessions(): Promise<any[]> {
    return await this.chatService.getWaitingChatSessions();
  }

  /**
   * Get chat statistics
   */
  @Get('statistics')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'read' })
  async getChatStatistics(@Query('days') days?: string): Promise<any> {
    const daysNum = days ? parseInt(days, 10) : 30;
    return await this.chatService.getChatStatistics(daysNum);
  }

  /**
   * Set agent schedule
   */
  @Put('agent-schedule/:dayOfWeek')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'update' })
  async setAgentSchedule(
    @Param('dayOfWeek') dayOfWeek: string,
    @Body() scheduleDto: SetAgentScheduleDto,
    @Req() req: RequestWithUser,
  ): Promise<any> {
    const dayNum = parseInt(dayOfWeek, 10);
    
    if (isNaN(dayNum) || dayNum < 0 || dayNum > 6) {
      throw new BadRequestException('Day of week must be between 0 (Sunday) and 6 (Saturday)');
    }
    
    return await this.chatService.setAgentSchedule(
      req.user.sub,
      dayNum,
      scheduleDto.startTime,
      scheduleDto.endTime,
    );
  }

  /**
   * Get agent schedule
   */
  @Get('agent-schedule')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'read' })
  async getAgentSchedule(@Req() req: RequestWithUser): Promise<any[]> {
    return await this.chatService.getAgentSchedule(req.user.sub);
  }

  /**
   * Delete agent schedule for a specific day
   */
  @Put('agent-schedule/:dayOfWeek/delete')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'update' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAgentSchedule(
    @Param('dayOfWeek') dayOfWeek: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    const dayNum = parseInt(dayOfWeek, 10);
    
    if (isNaN(dayNum) || dayNum < 0 || dayNum > 6) {
      throw new BadRequestException('Day of week must be between 0 (Sunday) and 6 (Saturday)');
    }
    
    const result = await this.chatService.deleteAgentSchedule(req.user.sub, dayNum);
    
    if (!result) {
      throw new BadRequestException('No schedule found for this day');
    }
  }
} 