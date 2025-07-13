import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import { SupportTicketService } from './support-ticket.service';
import { TicketStatus, TicketPriority } from '@prisma/client';
import { Request } from 'express';

// DTOs would normally be in separate files
class CreateTicketDto {
  subject: string;
  description: string;
  categoryId: string;
  priority?: TicketPriority;
  tags?: string[];
  metadata?: Record<string, any>;
}

class UpdateTicketDto {
  subject?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedToId?: string | null;
  categoryId?: string;
  tags?: string[];
  dueAt?: Date | null;
}

class CreateTicketResponseDto {
  content: string;
  isInternal?: boolean;
}

class CreateTicketCategoryDto {
  name: string;
  description?: string;
}

interface RequestWithUser extends Request {
  user: {
    sub: string;
    username: string;
    email?: string;
    roles: string[];
  };
}

@Controller('support/tickets')
export class SupportTicketController {
  constructor(private readonly supportTicketService: SupportTicketService) {}

  /**
   * Get all tickets with filtering and pagination
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'read' })
  async getTickets(
    @Req() req: RequestWithUser,
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: TicketPriority,
    @Query('categoryId') categoryId?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('userId') userId?: string,
    @Query('search') search?: string,
    @Query('tags') tags?: string,
    @Query('isUnassigned') isUnassigned?: string,
    @Query('isOverdue') isOverdue?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ): Promise<any> {
    // Check if user is admin or support agent
    const isAdmin = req.user.roles.includes('admin');
    const isSupportAgent = req.user.roles.includes('support_agent');
    
    // If user is not admin or support agent, they can only see their own tickets
    if (!isAdmin && !isSupportAgent) {
      userId = req.user.sub;
    }
    
    // Parse query parameters
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const parsedTags = tags ? tags.split(',') : undefined;
    const parsedIsUnassigned = isUnassigned === 'true';
    const parsedIsOverdue = isOverdue === 'true';
    
    // Get tickets with filtering and pagination
    return await this.supportTicketService.getTickets(
      {
        status,
        priority,
        categoryId,
        assignedToId,
        userId,
        search,
        tags: parsedTags,
        isUnassigned: parsedIsUnassigned,
        isOverdue: parsedIsOverdue,
      },
      {
        page: parsedPage,
        limit: parsedLimit,
        sortBy,
        sortOrder,
      },
    );
  }

  /**
   * Get ticket categories
   */
  @Get('categories')
  @Public()
  async getTicketCategories(): Promise<any[]> {
    return await this.supportTicketService.getTicketCategories();
  }

  /**
   * Get my tickets (for current user)
   */
  @Get('my-tickets')
  @UseGuards(JwtAuthGuard)
  async getMyTickets(
    @Req() req: RequestWithUser,
    @Query('status') status?: TicketStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<any> {
    // Parse query parameters
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    
    // Get tickets for the current user
    return await this.supportTicketService.getTickets(
      {
        userId: req.user.sub,
        status,
      },
      {
        page: parsedPage,
        limit: parsedLimit,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      },
    );
  }

  /**
   * Get assigned tickets (for support agents)
   */
  @Get('assigned-to-me')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'read' })
  async getAssignedTickets(
    @Req() req: RequestWithUser,
    @Query('status') status?: TicketStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<any> {
    // Parse query parameters
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    
    // Get tickets assigned to the current user
    return await this.supportTicketService.getTickets(
      {
        assignedToId: req.user.sub,
        status,
      },
      {
        page: parsedPage,
        limit: parsedLimit,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
    );
  }

  /**
   * Get unassigned tickets
   */
  @Get('unassigned')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'read' })
  async getUnassignedTickets(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<any> {
    // Parse query parameters
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    
    // Get unassigned tickets
    return await this.supportTicketService.getTickets(
      {
        isUnassigned: true,
        status: TicketStatus.OPEN,
      },
      {
        page: parsedPage,
        limit: parsedLimit,
        sortBy: 'createdAt',
        sortOrder: 'asc', // Oldest first
      },
    );
  }

  /**
   * Get ticket statistics
   */
  @Get('statistics')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'read' })
  async getTicketStatistics(@Query('userId') userId?: string): Promise<any> {
    return await this.supportTicketService.getTicketStatistics(userId);
  }

  /**
   * Get a ticket by reference number
   */
  @Get('by-reference/:reference')
  @UseGuards(JwtAuthGuard)
  async getTicketByReference(
    @Req() req: RequestWithUser,
    @Param('reference') reference: string,
  ): Promise<any> {
    const ticket = await this.supportTicketService.getTicketByReference(reference);
    
    if (!ticket) {
      throw new NotFoundException(`Ticket with reference ${reference} not found`);
    }
    
    // Check if user has permission to view this ticket
    const isAdmin = req.user.roles.includes('admin');
    const isSupportAgent = req.user.roles.includes('support_agent');
    const isTicketOwner = ticket.userId === req.user.sub;
    
    if (!isAdmin && !isSupportAgent && !isTicketOwner) {
      throw new ForbiddenException('You do not have permission to view this ticket');
    }
    
    return ticket;
  }

  /**
   * Get a ticket by ID
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getTicket(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ): Promise<any> {
    const ticket = await this.supportTicketService.getTicketById(id);
    
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    
    // Check if user has permission to view this ticket
    const isAdmin = req.user.roles.includes('admin');
    const isSupportAgent = req.user.roles.includes('support_agent');
    const isTicketOwner = ticket.userId === req.user.sub;
    
    if (!isAdmin && !isSupportAgent && !isTicketOwner) {
      throw new ForbiddenException('You do not have permission to view this ticket');
    }
    
    return ticket;
  }

  /**
   * Create a new ticket
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createTicket(
    @Req() req: RequestWithUser,
    @Body() createTicketDto: CreateTicketDto,
  ): Promise<any> {
    // Add user ID from authenticated user
    const userId = req.user.sub;
    
    // Get client info for metadata
    const metadata = {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      ...createTicketDto.metadata,
    };
    
    return await this.supportTicketService.createTicket({
      ...createTicketDto,
      userId,
      metadata,
    });
  }

  /**
   * Create a ticket category
   */
  @Post('categories')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'manage' })
  async createTicketCategory(@Body() createCategoryDto: CreateTicketCategoryDto): Promise<any> {
    return await this.supportTicketService.createTicketCategory(
      createCategoryDto.name,
      createCategoryDto.description,
    );
  }

  /**
   * Add a response to a ticket
   */
  @Post(':id/responses')
  @UseGuards(JwtAuthGuard)
  async addTicketResponse(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() createResponseDto: CreateTicketResponseDto,
  ): Promise<any> {
    // Get the ticket to check permissions
    const ticket = await this.supportTicketService.getTicketById(id);
    
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    
    // Check if user has permission to respond to this ticket
    const isAdmin = req.user.roles.includes('admin');
    const isSupportAgent = req.user.roles.includes('support_agent');
    const isTicketOwner = ticket.userId === req.user.sub;
    
    // Only admins and support agents can create internal responses
    if (createResponseDto.isInternal && !isAdmin && !isSupportAgent) {
      throw new ForbiddenException('You do not have permission to create internal responses');
    }
    
    // Regular users can only respond to their own tickets
    if (!isAdmin && !isSupportAgent && !isTicketOwner) {
      throw new ForbiddenException('You do not have permission to respond to this ticket');
    }
    
    return await this.supportTicketService.addTicketResponse({
      ticketId: id,
      userId: req.user.sub,
      content: createResponseDto.content,
      isInternal: createResponseDto.isInternal,
    });
  }

  /**
   * Update a ticket
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateTicket(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() updateTicketDto: UpdateTicketDto,
  ): Promise<any> {
    // Get the ticket to check permissions
    const ticket = await this.supportTicketService.getTicketById(id);
    
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    
    // Check if user has permission to update this ticket
    const isAdmin = req.user.roles.includes('admin');
    const isSupportAgent = req.user.roles.includes('support_agent');
    const isTicketOwner = ticket.userId === req.user.sub;
    
    // Regular users can only update their own tickets and cannot change certain fields
    if (!isAdmin && !isSupportAgent) {
      if (!isTicketOwner) {
        throw new ForbiddenException('You do not have permission to update this ticket');
      }
      
      // Regular users can only update subject, description, and tags
      const allowedFields = ['subject', 'description', 'tags'];
      const attemptedFields = Object.keys(updateTicketDto);
      
      const forbiddenFields = attemptedFields.filter(field => !allowedFields.includes(field));
      if (forbiddenFields.length > 0) {
        throw new ForbiddenException(`You do not have permission to update these fields: ${forbiddenFields.join(', ')}`);
      }
    }
    
    return await this.supportTicketService.updateTicket(id, updateTicketDto);
  }

  /**
   * Assign a ticket to an agent
   */
  @Put(':id/assign/:agentId')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'update' })
  async assignTicket(
    @Param('id') id: string,
    @Param('agentId') agentId: string,
  ): Promise<any> {
    return await this.supportTicketService.updateTicket(id, {
      assignedToId: agentId,
      status: TicketStatus.IN_PROGRESS,
    });
  }

  /**
   * Unassign a ticket
   */
  @Put(':id/unassign')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions({ resource: 'support', action: 'update' })
  async unassignTicket(@Param('id') id: string): Promise<any> {
    return await this.supportTicketService.updateTicket(id, {
      assignedToId: null,
      status: TicketStatus.OPEN,
    });
  }

  /**
   * Change ticket status
   */
  @Put(':id/status/:status')
  @UseGuards(JwtAuthGuard)
  async changeTicketStatus(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('status') status: TicketStatus,
  ): Promise<any> {
    // Get the ticket to check permissions
    const ticket = await this.supportTicketService.getTicketById(id);
    
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    
    // Check if user has permission to change the status
    const isAdmin = req.user.roles.includes('admin');
    const isSupportAgent = req.user.roles.includes('support_agent');
    const isTicketOwner = ticket.userId === req.user.sub;
    
    // Regular users can only change status of their own tickets and only to certain statuses
    if (!isAdmin && !isSupportAgent) {
      if (!isTicketOwner) {
        throw new ForbiddenException('You do not have permission to change the status of this ticket');
      }
      
      // Regular users can only set status to CLOSED
      if (status !== TicketStatus.CLOSED) {
        throw new ForbiddenException('You can only close your own tickets');
      }
    }
    
    return await this.supportTicketService.updateTicket(id, { status });
  }
} 