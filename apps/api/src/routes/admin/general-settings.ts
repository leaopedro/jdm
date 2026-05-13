import { prisma } from '@jdm/db';
import {
  GENERAL_SETTINGS_SINGLETON_ID,
  generalSettingsUpdateSchema,
} from '@jdm/shared/general-settings';
import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../../plugins/auth.js';
import { recordAudit } from '../../services/admin-audit.js';
import { ensureGeneralSettings } from '../../services/general-settings.js';

import { serializeAdminGeneralSettings } from './serializers.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const adminGeneralSettingsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/general/settings', async () => {
    const settings = await ensureGeneralSettings();
    return serializeAdminGeneralSettings(settings);
  });

  app.put('/general/settings', async (request) => {
    const { sub } = requireUser(request);
    const input = generalSettingsUpdateSchema.parse(request.body);

    await ensureGeneralSettings();

    const data: Prisma.GeneralSettingsUpdateInput = {};
    const capacity = input.capacityDisplay ?? {};
    const touched: string[] = [];

    if (capacity.events) {
      if (capacity.events.mode !== undefined) {
        data.eventCapacityMode = capacity.events.mode;
        touched.push('capacityDisplay.events.mode');
      }
      if (capacity.events.thresholdPercent !== undefined) {
        data.eventCapacityThresholdPercent = capacity.events.thresholdPercent;
        touched.push('capacityDisplay.events.thresholdPercent');
      }
    }
    if (capacity.tickets) {
      if (capacity.tickets.mode !== undefined) {
        data.ticketCapacityMode = capacity.tickets.mode;
        touched.push('capacityDisplay.tickets.mode');
      }
      if (capacity.tickets.thresholdPercent !== undefined) {
        data.ticketCapacityThresholdPercent = capacity.tickets.thresholdPercent;
        touched.push('capacityDisplay.tickets.thresholdPercent');
      }
    }
    if (capacity.extras) {
      if (capacity.extras.mode !== undefined) {
        data.extraCapacityMode = capacity.extras.mode;
        touched.push('capacityDisplay.extras.mode');
      }
      if (capacity.extras.thresholdPercent !== undefined) {
        data.extraCapacityThresholdPercent = capacity.extras.thresholdPercent;
        touched.push('capacityDisplay.extras.thresholdPercent');
      }
    }
    if (capacity.products) {
      if (capacity.products.mode !== undefined) {
        data.productCapacityMode = capacity.products.mode;
        touched.push('capacityDisplay.products.mode');
      }
      if (capacity.products.thresholdPercent !== undefined) {
        data.productCapacityThresholdPercent = capacity.products.thresholdPercent;
        touched.push('capacityDisplay.products.thresholdPercent');
      }
    }

    const updated = await prisma.generalSettings.update({
      where: { id: GENERAL_SETTINGS_SINGLETON_ID },
      data,
    });

    await recordAudit({
      actorId: sub,
      action: 'general_settings.update',
      entityType: 'general_settings',
      entityId: updated.id,
      metadata: { fields: touched },
    });

    return serializeAdminGeneralSettings(updated);
  });
};
