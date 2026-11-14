import {
  calendarBoardQuerySchema,
  calendarBoardSchema,
  calendarEventListQuerySchema,
  calendarEventPageSchema,
  calendarEventParamsSchema,
  calendarEventSchema,
  calendarExportSchema,
  createCalendarEventRequestSchema,
  createTimetableSlotRequestSchema,
  familyParamsSchema,
  formatEtag,
  timetableListQuerySchema,
  timetableSlotPageSchema,
  timetableSlotParamsSchema,
  timetableSlotSchema,
  updateCalendarEventRequestSchema,
  updateTimetableSlotRequestSchema,
} from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  idempotencyHeaders,
  ifMatchHeaders,
  instantCursor,
  problemResponses,
  requireIfMatch,
} from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import type { CalendarService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

/**
 * Family calendar routes: board of schedules and deadlines, event CRUD, weekly timetable and
 * downloadable calendar-file export. No plan feature gate.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Calendar service.
 */
export const calendarRoutes: FastifyPluginAsyncZod<{ calendar: CalendarService }> = async (
  app,
  { calendar },
) => {
  const family = '/api/v1/families/:familyId';
  const boardPath = `${family}/calendar`;
  const exportPath = `${family}/calendar/export`;
  const eventsPath = `${family}/calendar/events`;
  const eventPath = `${eventsPath}/:eventId`;
  const timetablePath = `${family}/calendar/timetable`;
  const slotPath = `${timetablePath}/:slotId`;

  app.get(
    boardPath,
    {
      config: { access: 'family', permission: 'calendar.read' },
      schema: {
        tags: ['calendar'],
        operationId: 'calendar.board',
        summary: 'Family calendar board of schedules and deadlines',
        params: familyParamsSchema,
        querystring: calendarBoardQuerySchema,
        response: { 200: calendarBoardSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      calendar.board(tenantOf(request), {
        from: request.query.from,
        to: request.query.to,
        houseId: request.query.houseId,
      }),
  );

  app.get(
    exportPath,
    {
      config: { access: 'family', permission: 'calendar.read' },
      schema: {
        tags: ['calendar'],
        operationId: 'calendar.export',
        summary: 'Downloadable family calendar file',
        params: familyParamsSchema,
        querystring: calendarBoardQuerySchema,
        response: { 200: calendarExportSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      calendar.export(tenantOf(request), {
        from: request.query.from,
        to: request.query.to,
        houseId: request.query.houseId,
      }),
  );

  app.get(
    eventsPath,
    {
      config: { access: 'family', permission: 'calendar.read' },
      schema: {
        tags: ['calendar'],
        operationId: 'calendar.listEvents',
        summary: 'List stored family calendar events',
        params: familyParamsSchema,
        querystring: calendarEventListQuerySchema,
        response: { 200: calendarEventPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      calendar.listEvents(tenantOf(request), {
        from: request.query.from,
        to: request.query.to,
        houseId: request.query.houseId,
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    eventsPath,
    {
      config: { access: 'family', permission: 'calendar.write', idempotent: true },
      schema: {
        tags: ['calendar'],
        operationId: 'calendar.createEvent',
        summary: 'Create a family calendar event',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createCalendarEventRequestSchema,
        response: { 201: calendarEventSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const created = await calendar.createEvent(tenantOf(request), request.body);
      void reply.header('etag', formatEtag(created.version));
      return reply.code(201).send(created);
    },
  );

  app.patch(
    eventPath,
    {
      config: { access: 'family', permission: 'calendar.write' },
      schema: {
        tags: ['calendar'],
        operationId: 'calendar.updateEvent',
        summary: 'Update a family calendar event',
        params: calendarEventParamsSchema,
        headers: ifMatchHeaders,
        body: updateCalendarEventRequestSchema,
        response: { 200: calendarEventSchema, ...problemResponses(400, 401, 403, 404, 409, 428, 422) },
      },
    },
    async (request, reply) => {
      const updated = await calendar.updateEvent(
        tenantOf(request),
        request.params.eventId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(updated.version));
      return updated;
    },
  );

  app.delete(
    eventPath,
    {
      config: { access: 'family', permission: 'calendar.write' },
      schema: {
        tags: ['calendar'],
        operationId: 'calendar.deleteEvent',
        summary: 'Delete a family calendar event',
        params: calendarEventParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await calendar.deleteEvent(tenantOf(request), request.params.eventId, requireIfMatch(request));
      void reply.status(204);
    },
  );

  app.get(
    timetablePath,
    {
      config: { access: 'family', permission: 'calendar.read' },
      schema: {
        tags: ['calendar'],
        operationId: 'calendar.listTimetable',
        summary: 'List weekly timetable slots',
        params: familyParamsSchema,
        querystring: timetableListQuerySchema,
        response: { 200: timetableSlotPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      calendar.listTimetable(tenantOf(request), {
        residentId: request.query.residentId,
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    timetablePath,
    {
      config: { access: 'family', permission: 'calendar.write', idempotent: true },
      schema: {
        tags: ['calendar'],
        operationId: 'calendar.createTimetableSlot',
        summary: 'Create a weekly timetable slot',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createTimetableSlotRequestSchema,
        response: { 201: timetableSlotSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const created = await calendar.createTimetableSlot(tenantOf(request), request.body);
      void reply.header('etag', formatEtag(created.version));
      return reply.code(201).send(created);
    },
  );

  app.patch(
    slotPath,
    {
      config: { access: 'family', permission: 'calendar.write' },
      schema: {
        tags: ['calendar'],
        operationId: 'calendar.updateTimetableSlot',
        summary: 'Update a weekly timetable slot',
        params: timetableSlotParamsSchema,
        headers: ifMatchHeaders,
        body: updateTimetableSlotRequestSchema,
        response: { 200: timetableSlotSchema, ...problemResponses(400, 401, 403, 404, 409, 428, 422) },
      },
    },
    async (request, reply) => {
      const updated = await calendar.updateTimetableSlot(
        tenantOf(request),
        request.params.slotId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(updated.version));
      return updated;
    },
  );

  app.delete(
    slotPath,
    {
      config: { access: 'family', permission: 'calendar.write' },
      schema: {
        tags: ['calendar'],
        operationId: 'calendar.deleteTimetableSlot',
        summary: 'Delete a weekly timetable slot',
        params: timetableSlotParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await calendar.deleteTimetableSlot(tenantOf(request), request.params.slotId, requireIfMatch(request));
      void reply.status(204);
    },
  );
};
