/* 9id: proof-of-work nhẹ (hashcash) trước khi xin mã OTP. Tìm counter sao cho SHA-256(challenge + ":" + counter) có đủ bit 0 ở đầu.
   Tự cài SHA-256 để chạy đồng bộ theo từng đợt (không chặn giao diện), dùng lại trạng thái của phần tiền tố cố định. */
(function () {
  'use strict';
  var N = window.N = window.N || {};
  var K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  var W = new Uint32Array(64);
  function compress(st, blk, off) {
    var i, a, b, c, d, e, f, g, h, t1, t2;
    for (i = 0; i < 16; i++) W[i] = (blk[off + 4 * i] << 24) | (blk[off + 4 * i + 1] << 16) | (blk[off + 4 * i + 2] << 8) | blk[off + 4 * i + 3];
    for (i = 16; i < 64; i++) {
      var x = W[i - 15], y = W[i - 2];
      var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    a = st[0]; b = st[1]; c = st[2]; d = st[3]; e = st[4]; f = st[5]; g = st[6]; h = st[7];
    for (i = 0; i < 64; i++) {
      t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    st[0] = (st[0] + a) | 0; st[1] = (st[1] + b) | 0; st[2] = (st[2] + c) | 0; st[3] = (st[3] + d) | 0;
    st[4] = (st[4] + e) | 0; st[5] = (st[5] + f) | 0; st[6] = (st[6] + g) | 0; st[7] = (st[7] + h) | 0;
  }
  var IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  function ascii(s) { var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }
  // số bit 0 ở đầu của 8 từ trạng thái cuối (chỉ cần từ đầu tiên và vài từ tiếp theo)
  function zeroBits(st) {
    var n = 0;
    for (var i = 0; i < 8; i++) { if (st[i] === 0) { n += 32; continue; } n += Math.clz32(st[i]); break; }
    return n;
  }
  // N.sha256hex dùng để tự kiểm
  N.sha256hex = function (str) {
    var m = ascii(str), st = new Uint32Array(IV), len = m.length, total = ((len + 9 + 63) >> 6) << 6, buf = new Uint8Array(total), i;
    buf.set(m); buf[len] = 0x80;
    var bits = len * 8; buf[total - 4] = (bits >>> 24) & 255; buf[total - 3] = (bits >>> 16) & 255; buf[total - 2] = (bits >>> 8) & 255; buf[total - 1] = bits & 255;
    for (i = 0; i < total; i += 64) compress(st, buf, i);
    return Array.prototype.map.call(st, function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  };

  // Giải: trả Promise<counter>. Chạy theo đợt ~25ms để giao diện không đứng.
  N.solvePow = function (challenge, bits) {
    var prefix = ascii(challenge + ':');
    var full = prefix.length >> 6, rest = prefix.subarray(full << 6);
    var mid = new Uint32Array(IV), i;
    for (i = 0; i < full; i++) compress(mid, prefix, i << 6);
    var st = new Uint32Array(8), blk = new Uint8Array(128);
    var counter = 0;
    function hashOnce(c) {
      var digits = String(c), len = rest.length + digits.length, total = len + 9 <= 64 ? 64 : 128, k;
      blk.fill(0, 0, total);
      blk.set(rest, 0);
      for (k = 0; k < digits.length; k++) blk[rest.length + k] = digits.charCodeAt(k);
      blk[len] = 0x80;
      var bitsLen = (full * 64 + len) * 8;
      blk[total - 4] = (bitsLen >>> 24) & 255; blk[total - 3] = (bitsLen >>> 16) & 255; blk[total - 2] = (bitsLen >>> 8) & 255; blk[total - 1] = bitsLen & 255;
      st.set(mid);
      compress(st, blk, 0);
      if (total === 128) compress(st, blk, 64);
      return zeroBits(st) >= bits;
    }
    return new Promise(function (resolve) {
      function step() {
        var end = Date.now() + 25;
        while (Date.now() < end) {
          for (var n = 0; n < 500; n++, counter++) if (hashOnce(counter)) { resolve(counter); return; }
        }
        setTimeout(step, 0);
      }
      step();
    });
  };

  // Lấy thử thách và giải: trả { challenge, counter }
  N.getPow = function () {
    return N.get('api/otp/challenge').then(function (ch) { return N.solvePow(ch.challenge, ch.bits).then(function (c) { return { challenge: ch.challenge, counter: c }; }); });
  };
})();
