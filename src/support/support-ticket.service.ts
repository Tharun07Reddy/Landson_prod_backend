import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupportTicket, TicketResponse, TicketStatus, TicketPriority } from '@prisma/client';

interface CreateTicketDto {
  subject: string;
  description: string;
  userId: string;
  categoryId: string;
  priority?: TicketPriority;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface UpdateTicketDto {
  subject?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedToId?: string | null;
  categoryId?: string;
  tags?: string[];
  dueAt?: Date | null;
}

interface CreateResponseDto {
  ticketId: string;
  userId: string;
  content: string;
  isInternal?: boolean;
}

interface TicketFilterOptions {
  status?: TicketStatus;
  priority?: TicketPriority;
  categoryId?: string;
  assignedToId?: string | null;
  userId?: string;
  search?: string;
  tags?: string[];
  isUnassigned?: boolean;
  isOverdue?: boolean;
}

interface TicketPaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class SupportTicketService {
  private readonly logger = new Logger(SupportTicketService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a unique ticket reference number
   */
  private async generateTicketReference(): Promise<string> {
    const prefix = 'TKT';
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    
    // Get the count of tickets created today to use as a sequence
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayTicketCount = await this.prisma.supportTicket.count({
      where: {
        createdAt: {
          gte: todayStart,
        },
      },
    });
    
    // Format the sequence number with leading zeros
    const sequence = String(todayTicketCount + 1).padStart(4, '0');
    
    return `${prefix}-${date}-${sequence}`;
  }

  /**
   * Create a new support ticket
   */
  async createTicket(data: CreateTicketDto): Promise<SupportTicket> {
    try {
      // Check if user exists
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
      });
      
      if (!user) {
        throw new NotFoundException(`User with ID ${data.userId} not found`);
      }
      
      // Check if category exists
      const category = await this.prisma.ticketCategory.findUnique({
        where: { id: data.categoryId },
      });
      
      if (!category) {
        throw new NotFoundException(`Ticket category with ID ${data.categoryId} not found`);
      }
      
      // Generate a unique reference number
      const reference = await this.generateTicketReference();
      
      // Create the ticket
      const ticket = await this.prisma.supportTicket.create({
        data: {
          reference,
          subject: data.subject,
          description: data.description,
          userId: data.userId,
          categoryId: data.categoryId,
          priority: data.priority || TicketPriority.MEDIUM,
          tags: data.tags || [],
          metadata: data.metadata || {},
        },
      });
      
      return ticket;
    } catch (error) {
      this.logger.error(`Error creating support ticket: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a ticket by ID
   */
  async getTicketById(id: string, includeResponses = true): Promise<SupportTicket | null> {
    try {
      const ticket = await this.prisma.supportTicket.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              firstName: true,
              lastName: true,
              profileImageUrl: true,
            },
          },
          assignedTo: includeResponses ? {
            select: {
              id: true,
              email: true,
              username: true,
              firstName: true,
              lastName: true,
              profileImageUrl: true,
            },
          } : false,
          category: true,
          responses: includeResponses ? {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  profileImageUrl: true,
                },
              },
              attachments: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          } : false,
          attachments: includeResponses,
        },
      });
      
      return ticket;
    } catch (error) {
      this.logger.error(`Error getting ticket by ID: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get a ticket by reference number
   */
  async getTicketByReference(reference: string, includeResponses = true): Promise<SupportTicket | null> {
    try {
      const ticket = await this.prisma.supportTicket.findUnique({
        where: { reference },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              firstName: true,
              lastName: true,
              profileImageUrl: true,
            },
          },
          assignedTo: includeResponses ? {
            select: {
              id: true,
              email: true,
              username: true,
              firstName: true,
              lastName: true,
              profileImageUrl: true,
            },
          } : false,
          category: true,
          responses: includeResponses ? {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  profileImageUrl: true,
                },
              },
              attachments: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          } : false,
          attachments: includeResponses,
        },
      });
      
      return ticket;
    } catch (error) {
      this.logger.error(`Error getting ticket by reference: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get tickets with filtering and pagination
   */
  async getTickets(
    filterOptions: TicketFilterOptions = {},
    paginationOptions: TicketPaginationOptions = {},
  ): Promise<{ tickets: SupportTicket[]; total: number; page: number; limit: number; totalPages: number }> {
    try {
      const {
        status,
        priority,
        categoryId,
        assignedToId,
        userId,
        search,
        tags,
        isUnassigned,
        isOverdue,
      } = filterOptions;
      
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = paginationOptions;
      
      // Build the where clause
      const where: any = {};
      
      if (status) {
        where.status = status;
      }
      
      if (priority) {
        where.priority = priority;
      }
      
      if (categoryId) {
        where.categoryId = categoryId;
      }
      
      if (assignedToId !== undefined) {
        where.assignedToId = assignedToId;
      }
      
      if (userId) {
        where.userId = userId;
      }
      
      if (search) {
        where.OR = [
          { subject: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
        ];
      }
      
      if (tags && tags.length > 0) {
        where.tags = {
          hasSome: tags,
        };
      }
      
      if (isUnassigned) {
        where.assignedToId = null;
      }
      
      if (isOverdue) {
        where.dueAt = {
          lt: new Date(),
        };
        where.status = {
          notIn: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
        };
      }
      
      // Calculate skip value for pagination
      const skip = (page - 1) * limit;
      
      // Get total count for pagination
      const total = await this.prisma.supportTicket.count({ where });
      
      // Get tickets with pagination
      const tickets = await this.prisma.supportTicket.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              email: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
          category: true,
          _count: {
            select: {
              responses: true,
              attachments: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      });
      
      // Calculate total pages
      const totalPages = Math.ceil(total / limit);
      
      return {
        tickets,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      this.logger.error(`Error getting tickets: ${error.message}`, error.stack);
      return {
        tickets: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };
    }
  }

  /**
   * Update a ticket
   */
  async updateTicket(id: string, data: UpdateTicketDto): Promise<SupportTicket> {
    try {
      // Check if ticket exists
      const existingTicket = await this.prisma.supportTicket.findUnique({
        where: { id },
      });
      
      if (!existingTicket) {
        throw new NotFoundException(`Ticket with ID ${id} not found`);
      }
      
      // Check if category exists if provided
      if (data.categoryId) {
        const category = await this.prisma.ticketCategory.findUnique({
          where: { id: data.categoryId },
        });
        
        if (!category) {
          throw new NotFoundException(`Ticket category with ID ${data.categoryId} not found`);
        }
      }
      
      // Check if assigned user exists if provided
      if (data.assignedToId) {
        const assignedUser = await this.prisma.user.findUnique({
          where: { id: data.assignedToId },
        });
        
        if (!assignedUser) {
          throw new NotFoundException(`User with ID ${data.assignedToId} not found`);
        }
      }
      
      // Handle status transitions
      let updateData: any = { ...data };
      
      // If status is changing to RESOLVED or CLOSED, set closedAt
      if (data.status === TicketStatus.RESOLVED || data.status === TicketStatus.CLOSED) {
        if (existingTicket.status !== TicketStatus.RESOLVED && existingTicket.status !== TicketStatus.CLOSED) {
          updateData.closedAt = new Date();
        }
      }
      
      // If status is changing from RESOLVED or CLOSED to something else, set reopenedAt
      if (
        data.status &&
        data.status !== TicketStatus.RESOLVED &&
        data.status !== TicketStatus.CLOSED &&
        (existingTicket.status === TicketStatus.RESOLVED || existingTicket.status === TicketStatus.CLOSED)
      ) {
        updateData.reopenedAt = new Date();
      }
      
      // Update the ticket
      const updatedTicket = await this.prisma.supportTicket.update({
        where: { id },
        data: updateData,
      });
      
      return updatedTicket;
    } catch (error) {
      this.logger.error(`Error updating ticket: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Add a response to a ticket
   */
  async addTicketResponse(data: CreateResponseDto): Promise<TicketResponse> {
    try {
      // Check if ticket exists
      const ticket = await this.prisma.supportTicket.findUnique({
        where: { id: data.ticketId },
      });
      
      if (!ticket) {
        throw new NotFoundException(`Ticket with ID ${data.ticketId} not found`);
      }
      
      // Check if user exists
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
      });
      
      if (!user) {
        throw new NotFoundException(`User with ID ${data.userId} not found`);
      }
      
      // Create the response
      const response = await this.prisma.ticketResponse.create({
        data: {
          ticketId: data.ticketId,
          userId: data.userId,
          content: data.content,
          isInternal: data.isInternal || false,
        },
      });
      
      // Update ticket status based on who responded
      // If customer responded to a WAITING_ON_CUSTOMER ticket, change to IN_PROGRESS
      // If agent responded to a ticket, change to WAITING_ON_CUSTOMER
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId: data.userId },
        include: { role: true },
      });
      
      const isAgent = userRoles.some(ur => 
        ur.role.name === 'admin' || 
        ur.role.name === 'support_agent'
      );
      
      let newStatus = ticket.status;
      
      if (isAgent && ticket.status !== TicketStatus.RESOLVED && ticket.status !== TicketStatus.CLOSED) {
        newStatus = TicketStatus.WAITING_ON_CUSTOMER;
      } else if (!isAgent && ticket.status === TicketStatus.WAITING_ON_CUSTOMER) {
        newStatus = TicketStatus.IN_PROGRESS;
      }
      
      // Update the ticket status if needed
      if (newStatus !== ticket.status) {
        await this.prisma.supportTicket.update({
          where: { id: data.ticketId },
          data: { status: newStatus },
        });
      }
      
      return response;
    } catch (error) {
      this.logger.error(`Error adding ticket response: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get ticket categories
   */
  async getTicketCategories(): Promise<any[]> {
    try {
      return await this.prisma.ticketCategory.findMany({
        orderBy: { name: 'asc' },
      });
    } catch (error) {
      this.logger.error(`Error getting ticket categories: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Create a ticket category
   */
  async createTicketCategory(name: string, description?: string): Promise<any> {
    try {
      // Check if category with same name already exists
      const existingCategory = await this.prisma.ticketCategory.findUnique({
        where: { name },
      });
      
      if (existingCategory) {
        throw new BadRequestException(`Ticket category with name '${name}' already exists`);
      }
      
      return await this.prisma.ticketCategory.create({
        data: {
          name,
          description,
        },
      });
    } catch (error) {
      this.logger.error(`Error creating ticket category: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get ticket statistics
   */
  async getTicketStatistics(userId?: string): Promise<any> {
    try {
      const where = userId ? { userId } : {};
      
      // Get counts by status
      const statusCounts = await this.prisma.supportTicket.groupBy({
        by: ['status'],
        where,
        _count: {
          id: true,
        },
      });
      
      // Get counts by priority
      const priorityCounts = await this.prisma.supportTicket.groupBy({
        by: ['priority'],
        where,
        _count: {
          id: true,
        },
      });
      
      // Get average resolution time (for resolved tickets)
      const resolvedTickets = await this.prisma.supportTicket.findMany({
        where: {
          ...where,
          status: { in: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
          closedAt: { not: null },
        },
        select: {
          createdAt: true,
          closedAt: true,
        },
      });
      
      let averageResolutionTimeHours = 0;
      
      if (resolvedTickets.length > 0) {
        const totalResolutionTimeMs = resolvedTickets.reduce((total, ticket) => {
          const resolutionTimeMs = ticket.closedAt!.getTime() - ticket.createdAt.getTime();
          return total + resolutionTimeMs;
        }, 0);
        
        averageResolutionTimeHours = totalResolutionTimeMs / (resolvedTickets.length * 3600000); // Convert ms to hours
      }
      
      // Format the status counts
      const formattedStatusCounts = Object.values(TicketStatus).reduce((acc, status) => {
        const found = statusCounts.find(s => s.status === status);
        acc[status] = found ? found._count.id : 0;
        return acc;
      }, {} as Record<string, number>);
      
      // Format the priority counts
      const formattedPriorityCounts = Object.values(TicketPriority).reduce((acc, priority) => {
        const found = priorityCounts.find(p => p.priority === priority);
        acc[priority] = found ? found._count.id : 0;
        return acc;
      }, {} as Record<string, number>);
      
      return {
        statusCounts: formattedStatusCounts,
        priorityCounts: formattedPriorityCounts,
        averageResolutionTimeHours,
        totalTickets: await this.prisma.supportTicket.count({ where }),
        openTickets: formattedStatusCounts[TicketStatus.OPEN] || 0,
        inProgressTickets: formattedStatusCounts[TicketStatus.IN_PROGRESS] || 0,
        resolvedTickets: (formattedStatusCounts[TicketStatus.RESOLVED] || 0) + (formattedStatusCounts[TicketStatus.CLOSED] || 0),
      };
    } catch (error) {
      this.logger.error(`Error getting ticket statistics: ${error.message}`, error.stack);
      return {
        statusCounts: {},
        priorityCounts: {},
        averageResolutionTimeHours: 0,
        totalTickets: 0,
        openTickets: 0,
        inProgressTickets: 0,
        resolvedTickets: 0,
      };
    }
  }
} 