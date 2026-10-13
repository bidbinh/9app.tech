import * as addresses from '../addresses.js';

export function addressRoutes(app) {
  const U = { auth: 'user' };
  app.route('GET', '/v1/addresses', async (ctx) => ({ addresses: await addresses.list(ctx.user.id) }), U);
  app.route('POST', '/v1/addresses', async (ctx) => addresses.save(ctx.user.id, ctx.body || {}), U);
  app.route('PATCH', '/v1/addresses/:id', async (ctx) => addresses.update(ctx.user.id, ctx.params.id, ctx.body || {}), U);
  app.route('DELETE', '/v1/addresses/:id', async (ctx) => addresses.remove(ctx.user.id, ctx.params.id), U);
  app.route('POST', '/v1/addresses/:id/default', async (ctx) => addresses.setDefault(ctx.user.id, ctx.params.id), U);
}
