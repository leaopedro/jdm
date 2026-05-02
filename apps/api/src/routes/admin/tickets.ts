import { adminGrantTicketResponseSchema, adminGrantTicketSchema } from '@jdm/shared/admin';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../../plugins/auth.js';
import { sendTransactionalPush } from '../../services/push/transactional.js';
import {
  DuplicateTicketError,
  GrantInputError,
  grantCompTicket,
} from '../../services/tickets/grant.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const adminTicketRoutes: FastifyPluginAsync = async (app) => {
  app.post('/tickets/grant', async (request, reply) => {
    const { sub: actorId } = requireUser(request);
    const input = adminGrantTicketSchema.parse(request.body);

    try {
      const result = await grantCompTicket(
        {
          actorId,
          userId: input.userId,
          eventId: input.eventId,
          tierId: input.tierId,
          ...(input.extras !== undefined && { extras: input.extras }),
          ...(input.carId !== undefined && { carId: input.carId }),
          ...(input.licensePlate !== undefined && { licensePlate: input.licensePlate }),
          ...(input.note !== undefined && { note: input.note }),
        },
        app.env,
      );

      void sendTransactionalPush(
        {
          userId: input.userId,
          kind: 'ticket.confirmed',
          dedupeKey: result.ticketId,
          title: 'Ingresso confirmado',
          body: 'Seu ingresso foi emitido com sucesso.',
          data: { ticketId: result.ticketId },
        },
        { sender: app.push },
      ).catch((err: unknown) => {
        app.log.warn({ err }, 'grant: push notification failed');
      });

      return reply.status(201).send(adminGrantTicketResponseSchema.parse(result));
    } catch (err) {
      if (err instanceof DuplicateTicketError) {
        return reply.status(409).send({ error: 'DuplicateTicket', message: err.message });
      }
      if (err instanceof GrantInputError) {
        return reply.status(422).send({ error: 'InvalidInput', message: err.message });
      }
      throw err;
    }
  });
};
