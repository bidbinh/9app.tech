import { tx } from '../db.js';
import { AppError } from '../errors.js';
import { requirePerm } from '../auth.js';
import { audit } from '../audit.js';
import { rawResponse } from '../http.js';
import { searchListings } from '../listing-public.js';
import { AMENITIES, CANCEL_POLICIES, LIMITS } from '../listing-meta.js';
import { addPhoto, deletePhoto, reorderPhotos, readPhoto, loadFile } from '../photos.js';
import {
  listBuildingsFor, proposeBuilding, decideBuilding, createListing, addListingUnits, removeListingUnit, updateListing, deleteDraft, submitListing,
  approveListing, rejectListing, setSuspended, proposePriceChange, decidePriceChange, listListings, getListingFull, listUnassignedUnits, reviewQueue,
} from '../listings.js';

const actorOf = (ctx) => ({ role: ctx.member.role, memberId: ctx.member.id, ownerId: ctx.member.ownerId });

// Chủ phòng đăng/sửa tin của mình; quản lý làm được mọi việc và duyệt. Quyền theo hàng ở listings.js (tin của chủ khác trả 404).
export function listingRoutes(app) {
  const own = (ctx) => requirePerm(ctx, 'listing.own');
  const W = (method, path, perm, fn, action, opts = {}) => app.route(method, path, async (ctx) => {
    requirePerm(ctx, perm);
    return tx(async (c) => {
      const out = await fn(c, ctx);
      if (action) await audit(c, { orgId: ctx.member.orgId, actor: ctx.member.id, action, target: ctx.params.id ?? (out && out.id) ?? null, data: {} });
      return out;
    });
  }, opts);

  app.route('GET', '/api/listing-meta', async (ctx) => {
    own(ctx);
    return { amenities: AMENITIES.map(([code, label]) => ({ code, label })), cancelPolicies: Object.entries(CANCEL_POLICIES).map(([code, p]) => ({ code, label: p.label, text: p.text })), limits: LIMITS };
  });
  app.route('GET', '/api/my/buildings', async (ctx) => { own(ctx); return { buildings: await tx((c) => listBuildingsFor(c, { orgId: ctx.member.orgId, actor: actorOf(ctx) })) }; });
  W('POST', '/api/buildings/propose', 'building.propose', (c, ctx) => proposeBuilding(c, { orgId: ctx.member.orgId, actor: actorOf(ctx), ...ctx.body }), 'building.propose', { limit: 20 });

  app.route('GET', '/api/listings/unassigned-units', async (ctx) => {
    own(ctx);
    if (ctx.member.role !== 'chu') throw new AppError('forbidden', 'Chỉ chủ phòng có danh sách căn được gán', 403);
    return { units: await tx((c) => listUnassignedUnits(c, { orgId: ctx.member.orgId, actor: actorOf(ctx) })) };
  });
  app.route('GET', '/api/listings', async (ctx) => { own(ctx); return { listings: await tx((c) => listListings(c, { orgId: ctx.member.orgId, actor: actorOf(ctx), status: ctx.query.status ?? null })) }; });
  W('POST', '/api/listings', 'listing.own', (c, ctx) => createListing(c, { orgId: ctx.member.orgId, actor: actorOf(ctx), ...ctx.body }), 'listing.create', { limit: 30 });
  app.route('GET', '/api/listings/:id', async (ctx) => { own(ctx); return tx((c) => getListingFull(c, { orgId: ctx.member.orgId, actor: actorOf(ctx), listingId: ctx.params.id })); });
  W('PUT', '/api/listings/:id', 'listing.own', (c, ctx) => updateListing(c, { orgId: ctx.member.orgId, actor: actorOf(ctx), listingId: ctx.params.id, ...ctx.body }), 'listing.update');
  W('POST', '/api/listings/:id/delete', 'listing.own', (c, ctx) => deleteDraft(c, { orgId: ctx.member.orgId, actor: actorOf(ctx), listingId: ctx.params.id }), 'listing.delete');
  W('POST', '/api/listings/:id/units', 'listing.own', (c, ctx) => addListingUnits(c, { orgId: ctx.member.orgId, actor: actorOf(ctx), listingId: ctx.params.id, codes: ctx.body.codes ?? [], unitIds: ctx.body.unitIds ?? [], floor: ctx.body.floor }), 'listing.units.add');
  W('POST', '/api/listings/:id/units/:unitId/remove', 'listing.own', async (c, ctx) => { await removeListingUnit(c, { orgId: ctx.member.orgId, actor: actorOf(ctx), listingId: ctx.params.id, unitId: ctx.params.unitId }); return { ok: true }; }, 'listing.units.remove');
  W('POST', '/api/listings/:id/submit', 'listing.own', (c, ctx) => submitListing(c, { orgId: ctx.member.orgId, actor: actorOf(ctx), listingId: ctx.params.id }, { now: ctx.now }), 'listing.submit');
  W('POST', '/api/listings/:id/price-change', 'listing.own', (c, ctx) => proposePriceChange(c, { orgId: ctx.member.orgId, actor: actorOf(ctx), listingId: ctx.params.id, price: ctx.body.price, weekendPrice: ctx.body.weekendPrice }), 'listing.price.propose');

  // CTV/sale và nhân viên tìm phòng theo tin (cùng dữ liệu với khách, giá gói công khai); sale/CTV thấy thêm hoa hồng dự kiến.
  app.route('GET', '/api/search-listings', async (ctx) => {
    requirePerm(ctx, 'availability.search');
    const q = ctx.query;
    const ints = (v) => (v === undefined || v === '' ? [] : String(v).split(',').map((x) => (/^\d{1,2}$/.test(x.trim()) ? Number(x.trim()) : Number.NaN)));
    const adults = q.adults === undefined || q.adults === '' ? 1 : (/^\d{1,2}$/.test(String(q.adults)) ? Number(q.adults) : Number.NaN);
    const money = (v) => (v === undefined || v === '' ? null : (/^\d{1,9}$/.test(String(v)) ? Number(v) : Number.NaN));
    const min = money(q.minPrice); const max = money(q.maxPrice);
    if (Number.isNaN(min) || Number.isNaN(max)) throw new AppError('bad_input', 'Khoảng giá không hợp lệ');
    return tx(async (c) => {
      const r = await searchListings(c, { orgId: ctx.member.orgId, from: q.from, to: q.to, adults, childAges: ints(q.childAges), area: q.area ?? '', minPrice: min, maxPrice: max, sort: q.sort ?? 'recommended', page: Number(q.page) || 1 }, { now: ctx.now });
      if (ctx.member.role === 'ctv' || ctx.member.role === 'sale') {
        const [a] = await c.query('SELECT commission_pct FROM agents WHERE id = $1 AND org_id = $2', [ctx.member.agentId, ctx.member.orgId]);
        const pct = a ? a.commission_pct : 0;
        r.listings = r.listings.map((x) => (x.subtotal !== undefined ? { ...x, commission: Math.floor((x.subtotal * pct) / 100) } : x));
      }
      return r;
    });
  });

  // ---- Ảnh ----
  // Thân là byte ảnh thô (Content-Type: image/*), xác thực trước khi đọc, tối đa maxPhotoBytes.
  app.route('POST', '/api/listings/:id/photos', async (ctx) => {
    own(ctx);
    const ct = String(ctx.req.headers['content-type'] || '');
    if (!/^image\/(jpeg|png|webp)$/.test(ct)) throw new AppError('bad_photo', 'Chỉ nhận ảnh JPEG, PNG hoặc WebP', 415);
    return tx(async (c) => {
      await getListingFull(c, { orgId: ctx.member.orgId, actor: actorOf(ctx), listingId: ctx.params.id }); // kiểm quyền với tin
      const [st] = await c.query('SELECT status FROM listings WHERE id = $1', [ctx.params.id]);
      if (st.status === 'pending') throw new AppError('pending_review', 'Tin đang chờ duyệt, chưa sửa ảnh được', 409);
      return addPhoto(c, { orgId: ctx.member.orgId, listingId: ctx.params.id, buf: ctx.rawBuffer });
    });
  }, { binary: true, maxBytes: LIMITS.maxPhotoBytes + 1024, limit: 60 });
  W('POST', '/api/listings/:id/photos/:pid/delete', 'listing.own', async (c, ctx) => {
    await getListingFull(c, { orgId: ctx.member.orgId, actor: actorOf(ctx), listingId: ctx.params.id });
    const [st] = await c.query('SELECT status FROM listings WHERE id = $1', [ctx.params.id]);
    if (st.status === 'pending') throw new AppError('pending_review', 'Tin đang chờ duyệt, chưa sửa ảnh được', 409);
    await deletePhoto(c, { orgId: ctx.member.orgId, listingId: ctx.params.id, photoId: ctx.params.pid });
    return { ok: true };
  }, 'listing.photo.delete');
  W('POST', '/api/listings/:id/photos/order', 'listing.own', async (c, ctx) => {
    await getListingFull(c, { orgId: ctx.member.orgId, actor: actorOf(ctx), listingId: ctx.params.id });
    await reorderPhotos(c, { orgId: ctx.member.orgId, listingId: ctx.params.id, ids: ctx.body.ids });
    return { ok: true };
  }, null);

  // Xem ảnh khi đăng nhập: quản lý xem mọi ảnh; chủ chỉ ảnh của tin mình. (Ảnh công khai của tin đã duyệt ở /photos/:id, không cần đăng nhập.)
  app.route('GET', '/api/photos/:id', async (ctx) => {
    own(ctx);
    const p = await tx((c) => readPhoto(c, ctx.params.id));
    if (p.org_id !== ctx.member.orgId || (ctx.member.role !== 'quanly' && p.owner_id !== ctx.member.ownerId)) throw new AppError('not_found', 'Không tìm thấy ảnh', 404);
    return rawResponse(await loadFile(p), { contentType: p.mime, headers: { 'cache-control': 'private, max-age=300' } });
  });
  // Công khai: chỉ ảnh của tin ĐANG hiển thị (approved). Tin nháp/chờ duyệt/bị ngưng trả 404 như ảnh không tồn tại.
  app.route('GET', '/photos/:id', async (ctx) => {
    const p = await tx((c) => readPhoto(c, ctx.params.id));
    if (p.status !== 'approved') throw new AppError('not_found', 'Không tìm thấy ảnh', 404);
    return rawResponse(await loadFile(p), { contentType: p.mime, headers: { 'cache-control': 'public, max-age=86400, immutable' } });
  }, { auth: 'none', limit: 600 });

  // ---- Duyệt (quản lý) ----
  const R = (ctx) => requirePerm(ctx, 'listing.review');
  app.route('GET', '/api/review', async (ctx) => { R(ctx); return tx((c) => reviewQueue(c, { orgId: ctx.member.orgId })); });
  W('POST', '/api/listings/:id/approve', 'listing.review', (c, ctx) => approveListing(c, { orgId: ctx.member.orgId, listingId: ctx.params.id, by: ctx.member.id, ...ctx.body }, { now: ctx.now }), 'listing.approve');
  W('POST', '/api/listings/:id/reject', 'listing.review', (c, ctx) => rejectListing(c, { orgId: ctx.member.orgId, listingId: ctx.params.id, by: ctx.member.id, reason: ctx.body.reason }, { now: ctx.now }), 'listing.reject');
  W('POST', '/api/listings/:id/suspend', 'listing.review', (c, ctx) => setSuspended(c, { orgId: ctx.member.orgId, listingId: ctx.params.id, by: ctx.member.id, suspend: true, reason: ctx.body.reason }, { now: ctx.now }), 'listing.suspend');
  W('POST', '/api/listings/:id/unsuspend', 'listing.review', (c, ctx) => setSuspended(c, { orgId: ctx.member.orgId, listingId: ctx.params.id, by: ctx.member.id, suspend: false }, { now: ctx.now }), 'listing.unsuspend');
  W('POST', '/api/buildings/:id/approve', 'listing.review', (c, ctx) => decideBuilding(c, { orgId: ctx.member.orgId, buildingId: ctx.params.id, by: ctx.member.id, approve: true }), 'building.approve');
  W('POST', '/api/buildings/:id/reject', 'listing.review', (c, ctx) => decideBuilding(c, { orgId: ctx.member.orgId, buildingId: ctx.params.id, by: ctx.member.id, approve: false, reason: ctx.body.reason }), 'building.reject');
  W('POST', '/api/price-changes/:id/approve', 'listing.review', (c, ctx) => decidePriceChange(c, { orgId: ctx.member.orgId, changeId: ctx.params.id, by: ctx.member.id, approve: true }, { now: ctx.now }), 'price.approve');
  W('POST', '/api/price-changes/:id/reject', 'listing.review', (c, ctx) => decidePriceChange(c, { orgId: ctx.member.orgId, changeId: ctx.params.id, by: ctx.member.id, approve: false, reason: ctx.body.reason }, { now: ctx.now }), 'price.reject');
}

