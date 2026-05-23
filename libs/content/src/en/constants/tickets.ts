// Ticket status values referenced by both the UI and backend logic.

import type { TicketStatus } from '../../types';

export const ticketStatuses = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'ESCALATED',
] as const satisfies readonly TicketStatus[];

export const ticketStatusLabels: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  ESCALATED: 'Escalated',
};

export const ticketStatusDescriptions: Record<TicketStatus, string> = {
  OPEN: 'The ticket has been created and is waiting for review.',
  IN_PROGRESS: 'The ticket is actively being investigated or worked on.',
  RESOLVED: 'The issue has been resolved, but the ticket may still be reviewed.',
  CLOSED: 'The ticket is complete and no further action is expected.',
  ESCALATED: 'The ticket requires higher-priority review or additional support.',
};

export function isTicketStatus(value: string): value is TicketStatus {
  return ticketStatuses.includes(value as TicketStatus);
}

export function getTicketStatusLabel(status: TicketStatus): string {
  return ticketStatusLabels[status];
}

export function getTicketStatusDescription(status: TicketStatus): string {
  return ticketStatusDescriptions[status];
}