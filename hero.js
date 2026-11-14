// Герой на canvas: слои LPC из sprites/, порядок по zPos из sheet_definitions.
// Полоса слоя: строка 0 – walk лицом вниз (9 кадров), 1 – slash (6), 2 – hurt (6), кадр 64x64.
// Слои удара большим оружием – отдельные полосы 6 кадров по 128 или 192 px с героем в центре.
(function () {
  "use strict";

  var F = 64;
  var VIEW = 96; // логический размер холста: кадр героя в центре, по краям место для замаха
  var OFF = (VIEW - F) / 2;
  var ROW = { walk: 0, slash: 1, hurt: 2 };
  var SPEED = { walk: 95, slash: 85, hurt: 120 };
  var LEN = { walk: 9, slash: 6, hurt: 6 };

  var manifest = null;
  var images = {};
  var canvas, ctx;
  var naryad = {};
  var nokaut = false;
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
    Object.keys(naryad).forEach(function (slot) {
      var id = naryad[slot];
      if (id && manifest.items[id]) list = list.concat(manifest.items[id]);
    });
    return list.sort(function (a, b) { return a.z - b.z; });
  }

  function current() {
    if (anim) return { name: anim.name, frame: anim.frame };
    if (nokaut) return { name: "hurt", frame: 5 };
    return { name: "walk", frame: 0 };
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
      ctx.drawImage(img, cur.frame * F, ROW[cur.name] * F, F, F, OFF, OFF, F, F);
    });
  }

  function tick() {
    var now = Date.now();
    if (anim) {
      if (now >= anim.until) {
        anim.frame += 1;
        anim.until = now + SPEED[anim.name];
        if (anim.frame >= LEN[anim.name]) {
          anim = null;
          scheduleStep();
        }
        draw();
      }
    } else if (!nokaut && now >= nextStep) {
      // изредка переступает: один проход walk и снова стоит
      play("walk");
    }
  }

  function scheduleStep() {
    nextStep = Date.now() + 3500 + Math.random() * 4000;
  }

  function play(name) {
    if (!LEN[name]) return;
    anim = { name: name, frame: name === "walk" ? 1 : 0, until: Date.now() + SPEED[name] };
    draw();
  }

  function preload(ids) {
    manifest.base.forEach(function (L) { load(fileOf(L)); });
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
    set: function (n, isNokaut, f) {
      if (f && manifest.forms[f]) {
        if (f !== forma) { forma = f; preload(Object.keys(manifest.items)); }
      }
      naryad = n || {};
      nokaut = !!isNokaut;
      if (nokaut && anim && anim.name !== "hurt") anim = null;
      draw();
    },
    play: play,
    icon: itemIcon,
  };
})();
