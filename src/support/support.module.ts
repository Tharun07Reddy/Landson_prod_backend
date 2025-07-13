import { Module } from '@nestjs/common';
import { SupportTicketService } from './support-ticket.service';
import { SupportTicketController } from './support-ticket.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    SupportTicketController,
    KnowledgeBaseController,
    ChatController
  ],
  providers: [
    SupportTicketService,
    KnowledgeBaseService,
    ChatService
  ],
  exports: [
    SupportTicketService,
    KnowledgeBaseService,
    ChatService
  ],
})
export class SupportModule {} 