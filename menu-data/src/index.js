// Điểm vào của thư viện (không phụ thuộc, chạy Node 20 + trình duyệt).
// Trong Node, nạp dữ liệu bằng: import { loadData } from './load-node.js'; setData(loadData());
export { setData, getData, seasonOfMonth, personWeight, profileServings, analyzeProfile, SEASON_LABEL } from './common.js';
export { planWeek, swapDish, dishIdsOfPlan } from './planner.js';
export { shoppingFromPlan, mergeExtraItems, roundForShopping, toBase, fmtQty, AISLE_LABEL } from './shopping.js';
export { normalizeItem, normalizeList, splitList } from './normalize.js';
