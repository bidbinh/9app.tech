/* Phân tích hash của địa chỉ (hàm thuần, chịu được chuỗi mã hóa sai như "%"). */
(function (root) {
  'use strict';
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function parseHash(hash) {
    var raw = String(hash || '#/').replace(/^#\/?/, '');
    var q = {}, i = raw.indexOf('?');
    if (i >= 0) {
      raw.slice(i + 1).split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); q[dec(p[0])] = dec(p.slice(1).join('=')); });
      raw = raw.slice(0, i);
    }
    var parts = raw.split('/').filter(Boolean).map(dec);
    return { section: parts[0] || 'home', parts: parts.slice(1), query: q };
  }
  var api = { parseHash: parseHash };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else (root.E9 = root.E9 || {}).route = api;
})(typeof self !== 'undefined' ? self : globalThis);
