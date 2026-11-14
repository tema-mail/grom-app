// Герой на canvas: слои LPC из sprites/, порядок по zPos из sheet_definitions.
// Полоса слоя: строка 0 – walk лицом вниз (9 кадров), 1 – slash (6), 2 – hurt (6), 5 – sit (3), кадр 64x64.
// Лёжа герой не показывается нигде (Артём 15.11): нокаут – на колене и тяжело дышит,
// выходной – сидит вальяжно в солнцезащитных очках и чуть покачивается.
// Слои удара большим оружием – отдельные полосы 6 кадров по 128 или 192 px с героем в центре.
(function () {
  "use strict";

  var F = 64;
  var VIEW = 96; // логический размер холста: кадр героя в центре, по краям место для замаха
  var OFF = (VIEW - F) / 2;
  var ROW = { walk: 0, slash: 1, hurt: 2, sit: 5 };
  var SPEED = { walk: 95, slash: 85, hurt: 120 };
  // кадры по порядку; hurt – вздрогнул, присел на колено и поднялся, без падения (кадры 3–5 не берём)
  var SEQ = { walk: [1, 2, 3, 4, 5, 6, 7, 8], slash: [0, 1, 2, 3, 4, 5], hurt: [0, 1, 2, 2, 2, 1, 0] };
  var BREATH = 700; // нокаут: кадры 1 и 2 hurt по очереди – тяжело дышит на колене
  var SWAY = 900;   // выходной: покачивание на 1 px

  var manifest = null;
  var images = {};
  var canvas, ctx;
  var naryad = {};
  var nokaut = false;
  var otdyh = false; // выходной
  var phase = -1;
  var forma = "dryshch"; // форма тела из state.json: dryshch | norma | atlet – у каждого слоя файл под своё тело

  function fileOf(L, f) { return L.f[f || forma] || L.f.norma; }
  var anim = null; // {name, frame, until}
  var timer = null;
  var nextStep = 0;

  function load(name) {
    if (images[name]) return images[name];
    var img = new Image();
    img.decoding = "async";
    img.src = "sprites/" + name + ".webp";
    img.onload = draw;
    images[name] = img;
    return img;
  }

  function layers() {
    var list = manifest.base.slice();
    if (otdyh && manifest.extra && manifest.extra.ochki) list = list.concat(manifest.extra.ochki);
    Object.keys(naryad).forEach(function (slot) {
      var id = naryad[slot];
      if (id && manifest.items[id]) list = list.concat(manifest.items[id]);
    });
    return list.sort(function (a, b) { return a.z - b.z; });
  }

  function current() {
    if (anim) return { name: anim.name, frame: SEQ[anim.name][anim.i], dy: 0 };
    var t = Math.floor(Date.now() / (nokaut ? BREATH : SWAY)) % 2;
    if (nokaut) return { name: "hurt", frame: 1 + t, dy: 0 };
    if (otdyh) return { name: "sit", frame: 0, dy: t };
    return { name: "walk", frame: 0, dy: 0 };
  }

  function draw() {
    if (!ctx || !manifest) return;
    ctx.clearRect(0, 0, VIEW, VIEW);
    var cur = current();
    layers().forEach(function (L) {
      var img = load(fileOf(L));
      if (!img.complete || !img.naturalWidth) return;
      if (L.slash) {
        if (cur.name !== "slash") return;
        var s = L.slash;
        var d = OFF + F / 2 - s / 2;
        ctx.drawImage(img, cur.frame * s, 0, s, s, d, d, s, s);
        return;
      }
      if (L.anims.indexOf(cur.name) < 0) return;
      ctx.drawImage(img, cur.frame * F, ROW[cur.name] * F, F, F, OFF, OFF + cur.dy, F, F);
    });
  }

  function tick() {
    var now = Date.now();
    if (anim) {
      if (now >= anim.until) {
        anim.i += 1;
        anim.until = now + SPEED[anim.name];
        if (anim.i >= SEQ[anim.name].length) {
          anim = null;
          scheduleStep();
        }
        draw();
      }
    } else if (nokaut || otdyh) {
      var p = Math.floor(now / (nokaut ? BREATH : SWAY)) % 2;
      if (p !== phase) { phase = p; draw(); }
    } else if (now >= nextStep) {
      // изредка переступает: один проход walk и снова стоит
      play("walk");
    }
  }

  function scheduleStep() {
    nextStep = Date.now() + 3500 + Math.random() * 4000;
  }

  function play(name) {
    if (!SEQ[name]) return;
    anim = { name: name, i: 0, until: Date.now() + SPEED[name] };
    draw();
  }

  function preload(ids) {
    manifest.base.forEach(function (L) { load(fileOf(L)); });
    ((manifest.extra || {}).ochki || []).forEach(function (L) { load(fileOf(L)); });
    ids.forEach(function (id) {
      (manifest.items[id] || []).forEach(function (L) { load(fileOf(L)); });
    });
  }

  // Маленькая картинка предмета для магазина: кадр 0 walk, только слои предмета.
  function itemIcon(id, target) {
    if (!manifest || !manifest.items[id]) return;
    var c = target.getContext("2d");
    c.imageSmoothingEnabled = false;
    var ls = manifest.items[id].filter(function (L) { return !L.slash && L.anims.indexOf("walk") >= 0; });
    var pending = ls.length;
    function paint() {
      // слои предмета на кадр 64x64, затем обрезка по видимым пикселям и целое увеличение в иконку
      var tmp = document.createElement("canvas");
      tmp.width = F; tmp.height = F;
      var t = tmp.getContext("2d");
      ls.slice().sort(function (a, b) { return a.z - b.z; }).forEach(function (L) {
        var img = images[fileOf(L, "norma")];
        if (img && img.complete && img.naturalWidth) t.drawImage(img, 0, 0, F, F, 0, 0, F, F);
      });
      var px = t.getImageData(0, 0, F, F).data;
      var x0 = F, y0 = F, x1 = -1, y1 = -1;
      for (var y = 0; y < F; y++) {
        for (var x = 0; x < F; x++) {
          if (px[(y * F + x) * 4 + 3] > 0) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      c.clearRect(0, 0, target.width, target.height);
      if (x1 < 0) return;
      var w = x1 - x0 + 1, h = y1 - y0 + 1;
      var k = Math.max(1, Math.floor(Math.min((target.width - 4) / w, (target.height - 4) / h)));
      c.drawImage(tmp, x0, y0, w, h, Math.floor((target.width - w * k) / 2), Math.floor((target.height - h * k) / 2), w * k, h * k);
    }
    ls.forEach(function (L) {
      var img = load(fileOf(L, "norma"));
      if (img.complete) { pending -= 1; } else {
        img.addEventListener("load", function () { pending -= 1; if (pending <= 0) paint(); });
      }
    });
    if (pending <= 0) paint();
  }

  window.GromHero = {
    init: function (el, m) {
      manifest = m;
      canvas = el;
      canvas.width = VIEW;
      canvas.height = VIEW;
      ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      preload(Object.keys(m.items));
      scheduleStep();
      if (!timer) timer = setInterval(tick, 30);
      draw();
    },
    set: function (n, isNokaut, f, isOtdyh) {
      otdyh = !!isOtdyh;
      if (f && manifest.forms[f]) {
        if (f !== forma) { forma = f; preload(Object.keys(manifest.items)); }
      }
      naryad = n || {};
      nokaut = !!isNokaut;
      if ((nokaut || otdyh) && anim && anim.name === "walk") anim = null;
      draw();
    },
    play: play,
    icon: itemIcon,
  };
})();
