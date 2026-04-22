import { myTicketsResponseSchema } from '@jdm/shared/tickets';
import type { MyTicketsResponse } from '@jdm/shared/tickets';

import { authedRequest } from './client';

export const listMyTickets = (): Promise<MyTicketsResponse> =>
  authedRequest('/me/tickets', myTicketsResponseSchema);
