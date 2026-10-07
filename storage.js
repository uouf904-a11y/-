/* تخزين دائم + نسخة احتياطية تلقائية من localStorage إلى IndexedDB */
(function () {
  'use strict';
  var DB = 'athar-backup', STORE = 'kv', RK = 'restored-once';
  var ls = window.localStorage;
  var proto = Storage.prototype;
  var origSet = proto.setItem, origRemove = proto.removeItem, origClear = proto.clear;
  var timer = null, ready = false;

  function openDB() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function tx(db, mode, fn) {
    return new Promise(function (res, rej) {
      var t = db.transaction(STORE, mode), s = t.objectStore(STORE), out = fn(s);
      t.oncomplete = function () { res(out && out.result); };
      t.onerror = t.onabort = function () { rej(t.error); };
    });
  }
  function snapshot() {
    var o = {};
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); o[k] = ls.getItem(k); }
    return o;
  }
  function backup() {
    return openDB().then(function (db) {
      return tx(db, 'readwrite', function (s) { s.put({ t: Date.now(), data: snapshot() }, 'snapshot'); });
    }).catch(function () {});
  }
  function schedule() {
    if (!ready) return;
    clearTimeout(timer); timer = setTimeout(backup, 400);
  }

  // mirror every change automatically (set / remove / clear)
  proto.setItem = function () { var r = origSet.apply(this, arguments); if (this === ls) schedule(); return r; };
  proto.removeItem = function () { var r = origRemove.apply(this, arguments); if (this === ls) schedule(); return r; };
  proto.clear = function () { var r = origClear.apply(this, arguments); if (this === ls) schedule(); return r; };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') backup(); });
  window.addEventListener('pagehide', backup);

  // ask the browser not to evict our data
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  } catch (e) {}

  // restore if localStorage was wiped but the IndexedDB copy survived
  openDB().then(function (db) {
    return tx(db, 'readonly', function (s) { return s.get('snapshot'); });
  }).then(function (rec) {
    var empty = ls.length === 0;
    if (empty && rec && rec.data && Object.keys(rec.data).length) {
      Object.keys(rec.data).forEach(function (k) { origSet.call(ls, k, rec.data[k]); });
      // the app already read an empty store at startup → reload once to pick up restored data
      var done = false;
      try { done = sessionStorage.getItem(RK) === '1'; sessionStorage.setItem(RK, '1'); } catch (e) {}
      ready = true;
      if (!done) { location.reload(); return; }
    }
    ready = true;
    if (!empty) backup();
  }).catch(function () { ready = true; });
})();
