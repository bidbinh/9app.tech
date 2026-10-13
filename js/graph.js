// Life Graph — IndexedDB, fallback localStorage. Classic JS.

var Graph = (function () {
  var SCHEMA = 1;
  var LS_KEY = '9app.graph.v1';
  var IDB_NAME = '9app-life';
  var IDB_STORE = 'graph';
  var STORES = [
    'meta', 'people', 'properties', 'rooms', 'assets', 'vehicles', 'documents',
    'transactions', 'obligations', 'appointments', 'medications', 'providers',
    'requests', 'bookings', 'maintenance', 'lifeEvents', 'notifications', 'appUsage', 'dismissals', 'audit'
  ];
  var memory = {};
  var ready = false;
  var persistTimer = 0;
  var usingIdb = false;
  var idb = null;

  function now() { return Date.now(); }

  function uid(prefix) {
    return (prefix || 'id') + '-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function empty() {
    var data = {};
    for (var i = 0; i < STORES.length; i++) data[STORES[i]] = [];
    data.meta.push({
      id: 'meta',
      schema: SCHEMA,
      userId: 'local',
      householdId: 'hh-local',
      createdAt: now(),
      updatedAt: now()
    });
    return data;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function list(store) {
    if (!memory[store]) memory[store] = [];
    return memory[store];
  }

  function writeAudit(action, store, recId) {
    list('audit').push({
      id: uid('audit'),
      action: action,
      store: store,
      recId: recId || '',
      at: now()
    });
    if (list('audit').length > 400) list('audit').splice(0, list('audit').length - 400);
  }

  function persistNow() {
    var payload = JSON.stringify(memory);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, payload);
    } catch (e) {}
    if (usingIdb && idb) {
      try {
        var tx = idb.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put({ id: 'root', data: memory, schema: SCHEMA });
      } catch (e2) {}
    }
  }

  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 40);
  }

  function migrate(data) {
    var from = 0;
    if (data.meta && data.meta[0] && data.meta[0].schema) from = data.meta[0].schema;
    for (var i = 0; i < STORES.length; i++) {
      if (!data[STORES[i]]) data[STORES[i]] = [];
    }
    if (from < SCHEMA && data.meta && data.meta[0]) data.meta[0].schema = SCHEMA;
    return data;
  }

  function put(store, rec) {
    rec = rec || {};
    rec.id = rec.id || uid(store.replace(/s$/, ''));
    rec.createdAt = rec.createdAt || now();
    rec.updatedAt = now();
    rec.userId = rec.userId || 'local';
    rec.householdId = rec.householdId || 'hh-local';
    var rows = list(store);
    var found = -1;
    for (var i = 0; i < rows.length; i++) if (rows[i].id === rec.id) { found = i; break; }
    if (found >= 0) rows[found] = rec;
    else rows.push(rec);
    writeAudit('put', store, rec.id);
    persist();
    return rec;
  }

  function get(store, id) {
    var rows = list(store);
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }

  function query(store, pred) {
    var rows = list(store);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (!pred || pred(rows[i])) out.push(rows[i]);
    }
    return out;
  }

  function remove(store, id) {
    var rows = list(store);
    var next = [];
    var found = false;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) found = true;
      else next.push(rows[i]);
    }
    memory[store] = next;
    if (found) writeAudit('remove', store, id);
    persist();
    return found;
  }

  function event(type, payload) {
    return put('lifeEvents', {
      type: type,
      payload: payload || {},
      at: now()
    });
  }

  function recordUse(appId) {
    var rec = get('appUsage', appId);
    var count = rec && rec.count ? rec.count : 0;
    return put('appUsage', {
      id: appId,
      appId: appId,
      count: count + 1,
      lastUsed: now(),
      createdAt: rec && rec.createdAt ? rec.createdAt : now()
    });
  }

  function usageOf(appId) {
    return get('appUsage', appId) || { id: appId, appId: appId, count: 0, lastUsed: 0 };
  }

  function dismissed(key) {
    return !!get('dismissals', key);
  }

  function dismiss(key, until) {
    return put('dismissals', { id: key, until: until || 0 });
  }

  function loadJson(raw) {
    if (!raw) return empty();
    try {
      var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!data || typeof data !== 'object') return empty();
      return migrate(data);
    } catch (e) {
      return empty();
    }
  }

  function bootFromLocal() {
    var raw = '';
    try { raw = typeof localStorage !== 'undefined' ? (localStorage.getItem(LS_KEY) || '') : ''; } catch (e) {}
    memory = loadJson(raw);
    ready = true;
  }

  function open(cb) {
    bootFromLocal();
    var done = function () {
      ready = true;
      if (cb) cb(Graph);
    };
    if (typeof indexedDB === 'undefined') {
      done();
      return;
    }
    try {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () {
        idb = req.result;
        usingIdb = true;
        var tx = idb.transaction(IDB_STORE, 'readonly');
        var getReq = tx.objectStore(IDB_STORE).get('root');
        getReq.onsuccess = function () {
          if (getReq.result && getReq.result.data) memory = migrate(getReq.result.data);
          persistNow();
          done();
        };
        getReq.onerror = function () { done(); };
      };
      req.onerror = function () { done(); };
    } catch (e) {
      done();
    }
  }

  function resetForTest(data) {
    memory = data ? migrate(data) : empty();
    ready = true;
    persistNow();
  }

  return {
    SCHEMA: SCHEMA,
    STORES: STORES,
    uid: uid,
    now: now,
    open: open,
    put: put,
    get: get,
    query: query,
    remove: remove,
    event: event,
    recordUse: recordUse,
    usageOf: usageOf,
    dismissed: dismissed,
    dismiss: dismiss,
    persistNow: persistNow,
    resetForTest: resetForTest,
    all: function () { return memory; },
    clone: clone,
    ready: function () { return ready; }
  };
})();
