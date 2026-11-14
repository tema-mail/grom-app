// Страница героя «Гром»: состояние из #s=<base64url JSON>, из window.gromState(obj) (приложение на маке)
// или демо. Действия – Telegram.WebApp.sendData или webkit.messageHandlers.grom. Формат – docs бота KONTRAKT.md.
(function () {
  "use strict";

  var SLOTY = { golova: "Голова", telo: "Тело", nogi: "Ноги", obuv: "Обувь", ruka: "Рука", shchit: "Щит", spina: "Спина" };
  var FORMA = { dryshch: "дрыщ", norma: "норма", atlet: "атлет" };
  var NAZV = {
    mayka: "Майка", rubashka: "Рубашка", shtany: "Штаны", botinki: "Ботинки", trusy: "Трусы",
    shlem_kozha: "Кожаный шлем", shlem_zhelezo: "Железный шлем", korona: "Корона",
    kurtka_kozha: "Кожаная куртка", kolchuga: "Кольчуга", laty: "Латы",
    kinzhal: "Кинжал", mech: "Меч", topor: "Топор",
    shchit_derevo: "Деревянный щит", shchit_zhelezo: "Железный щит", plashch: "Красный плащ",
    body: "Тело", head: "Голова", hair: "Волосы", shirt: "Рубашка", pants: "Штаны", shoes: "Обувь",
  };
  var DEMO = {
    v: 1, ts: "2026-11-15T10:20:00+07:00",
    uroven: 2, xp: 120, xp_next: 300,
    hp: 82, hp_max: 100, monety: 430, seriya: 4, vyhodnoy: false,
    naryad: { golova: "shlem_kozha", telo: "mayka", nogi: "shtany", obuv: null, ruka: "kinzhal", shchit: null, spina: null },
    forma: "dryshch", trenirovok: 3, do_formy: 3,
    inventar: ["shlem_kozha", "mayka", "shtany", "kinzhal"],
    magazin: [
      { id: "mayka", nazv: "Майка", slot: "telo", cena: 30, tip: "shmot" },
      { id: "rubashka", nazv: "Рубашка", slot: "telo", cena: 60, tip: "shmot" },
      { id: "shtany", nazv: "Штаны", slot: "nogi", cena: 40, tip: "shmot" },
      { id: "botinki", nazv: "Ботинки", slot: "obuv", cena: 50, tip: "shmot" },
      { id: "shlem_kozha", nazv: "Кожаный шлем", slot: "golova", cena: 60, tip: "shmot" },
      { id: "shlem_zhelezo", nazv: "Железный шлем", slot: "golova", cena: 150, tip: "shmot" },
      { id: "korona", nazv: "Корона", slot: "golova", cena: 500, tip: "shmot" },
      { id: "kurtka_kozha", nazv: "Кожаная куртка", slot: "telo", cena: 100, tip: "shmot" },
      { id: "kolchuga", nazv: "Кольчуга", slot: "telo", cena: 250, tip: "shmot" },
      { id: "laty", nazv: "Латы", slot: "telo", cena: 600, tip: "shmot" },
      { id: "kinzhal", nazv: "Кинжал", slot: "ruka", cena: 80, tip: "shmot" },
      { id: "mech", nazv: "Меч", slot: "ruka", cena: 200, tip: "shmot" },
      { id: "topor", nazv: "Топор", slot: "ruka", cena: 300, tip: "shmot" },
      { id: "shchit_derevo", nazv: "Деревянный щит", slot: "shchit", cena: 120, tip: "shmot" },
      { id: "shchit_zhelezo", nazv: "Железный щит", slot: "shchit", cena: 300, tip: "shmot" },
      { id: "plashch", nazv: "Красный плащ", slot: "spina", cena: 150, tip: "shmot" },
      { id: "n1", nazv: "Кофе в любимом месте", cena: 80, tip: "nagrada" },
      { id: "n2", nazv: "Вечер кино без дел", cena: 250, tip: "nagrada" },
    ],
    chellendzhi: [
      { id: "zal", nazv: "Зал 3 из 3", est: 1, nado: 3, nagrada: 150, srok: "2026-11-20" },
      { id: "son", nazv: "Сон до 23:30 пять дней", est: 3, nado: 5, nagrada: 120, srok: "2026-11-21" },
    ],
    boss: { nazv: "Жир", hp: 2600, hp_max: 3000, srok: "2026-12-16" },
    segodnya: { zakryt: false, sobytiya: [
      { t: "08:05", tekst: "Подъём вовремя +20" },
      { t: "10:20", tekst: "Зелёная задача +50" },
    ] },
    replika: "Принято. +50. Вот так и надо.",
    nokaut: false,
  };

  var tg = window.Telegram && window.Telegram.WebApp;
  var inTg = !!(tg && (tg.initData || (tg.platform && tg.platform !== "unknown")));
  var macHandler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.grom;
  var manifest = null;
  var state = null;
  var shown = null; // прошлое показанное состояние (hp, monety) для анимаций
  var tab = "shmot";
  var pendingState = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : (d || 0); }
  function pct(a, b) { b = num(b); return b > 0 ? Math.max(0, Math.min(100, num(a) / b * 100)) : 0; }
  function data(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
    return m ? m[3] + "." + m[2] : "";
  }

  // ---------- хранилище (может не работать: приватный режим, заблокированные данные) ----------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* без памяти – тоже работаем */ } }

  // ---------- тема ----------
  function temaBtn() {
    var b = $("tema-btn");
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    b.textContent = dark ? "☀" : "☾";
    b.title = dark ? "Светлая тема" : "Тёмная тема";
    b.setAttribute("aria-label", b.title);
  }
  function temaInit() {
    var root = document.documentElement;
    if (inTg) {
      root.classList.add("tg");
      applyTgTheme();
      if (tg.onEvent) tg.onEvent("themeChanged", applyTgTheme);
      return;
    }
    temaBtn();
    $("tema-btn").addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      lsSet("tema", next);
      temaBtn();
    });
  }
  function applyTgTheme() {
    var p = tg.themeParams || {};
    var root = document.documentElement;
    root.setAttribute("data-theme", tg.colorScheme === "dark" ? "dark" : "light");
    var map = {
      "--bg": p.secondary_bg_color || p.bg_color,
      "--card": p.section_bg_color || p.bg_color,
      "--text": p.text_color,
      "--muted": p.hint_color,
      "--accent": p.button_color,
      "--accent-text": p.button_text_color,
      "--line": p.section_separator_color,
      "--soft": p.secondary_bg_color,
      "--stage": p.secondary_bg_color,
    };
    Object.keys(map).forEach(function (k) {
      if (map[k]) root.style.setProperty(k, map[k]); else root.style.removeProperty(k);
    });
  }

  // ---------- откуда состояние ----------
  function fromHash() {
    var m = /[#&]s=([A-Za-z0-9_\-]+=*)/.exec(location.hash || "");
    if (!m) return null;
    try {
      var b64 = m[1].replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
      while (b64.length % 4) b64 += "=";
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder("utf-8").decode(bytes));
    } catch (e) {
      toast("Не удалось прочитать состояние из ссылки.");
      return null;
    }
  }

  function readPrev() {
    try { return JSON.parse(lsGet("grom_prev") || "null"); } catch (e) { return null; }
  }

  function apply(s, demo) {
    if (!s || typeof s !== "object") return;
    if (!manifest) { pendingState = { s: s, demo: demo }; return; }
    state = s;
    $("demo").hidden = !demo;
    var prev = shown || (demo ? null : readPrev());
    var ev = lastEvent(s);
    var now = { hp: num(s.hp), monety: num(s.monety), forma: s.forma || "", ev: ev ? (ev.t || "") + " " + (ev.tekst || "") : "" };
    render();
    if (demo) {
      setTimeout(function () { window.GromHero.fight("cherepaha"); }, 900);
    } else if (prev) {
      if (prev.forma && now.forma && prev.forma !== now.forma && FORMA[now.forma]) formaUp(now.forma);
      else if (now.hp < num(prev.hp)) window.GromHero.play("hurt");
      else if (!s.nokaut && now.ev !== prev.ev && /День закрыт|Челлендж.*выполнен/i.test(now.ev)) window.GromHero.fight("kapitan");
      else if (now.monety > num(prev.monety) && !s.nokaut) {
        if (/Зелёная задача/i.test(now.ev)) window.GromHero.fight("cherepaha");
        else window.GromHero.play("slash");
      }
    }
    shown = now;
    if (!demo) lsSet("grom_prev", JSON.stringify(now));
  }

  function lastEvent(s) {
    var list = s.segodnya && Array.isArray(s.segodnya.sobytiya) ? s.segodnya.sobytiya : [];
    return list.length ? list[list.length - 1] : null;
  }

  // смена формы тела: плашка над героем и победный замах
  function formaUp(f) {
    var b = $("forma-up");
    b.textContent = "Форма: " + FORMA[f] + "!";
    b.hidden = false;
    window.GromHero.play("slash");
    setTimeout(function () { window.GromHero.play("walk"); }, 700);
    setTimeout(function () { b.hidden = true; }, 5000);
  }

  // ---------- отрисовка ----------
  function render() {
    var s = state;
    window.GromHero.set(s.naryad || {}, !!s.nokaut, s.forma, !!s.vyhodnoy);
    $("otdyh").hidden = !s.vyhodnoy || !!s.nokaut;
    $("forma").textContent = FORMA[s.forma] || "–";
    var trn = "тренировок: " + num(s.trenirovok);
    if (s.do_formy === null) trn += " · последняя форма";
    else if (s.do_formy !== undefined) trn += " · до следующей формы: " + num(s.do_formy);
    $("trenirovki").textContent = s.trenirovok === undefined ? "" : trn;
    $("nokaut").hidden = !s.nokaut;
    $("uroven").textContent = num(s.uroven, 1);
    $("hp-bar").style.width = pct(s.hp, s.hp_max) + "%";
    $("hp-txt").textContent = num(s.hp) + " / " + num(s.hp_max);
    $("xp-bar").style.width = pct(s.xp, s.xp_next) + "%";
    $("xp-txt").textContent = num(s.xp) + " / " + num(s.xp_next);
    $("monety").textContent = num(s.monety);
    $("seriya").textContent = num(s.seriya);
    $("vyhodnoy").hidden = !s.vyhodnoy;
    var ts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(s.ts || "");
    $("ts").textContent = ts ? "на " + ts[3] + "." + ts[2] + " " + ts[4] : "";
    $("replika").textContent = s.replika || "Гром пока молчит.";
    renderSegodnya(s.segodnya || {});
    renderChellendzhi(s.chellendzhi || []);
    renderBoss(s.boss);
    renderShop();
  }

  function renderSegodnya(sg) {
    $("den-zakryt").hidden = !sg.zakryt;
    var ul = $("sobytiya");
    ul.textContent = "";
    var list = Array.isArray(sg.sobytiya) ? sg.sobytiya : [];
    if (!list.length) { ul.appendChild(el("li", "muted", "Пока пусто.")); return; }
    list.forEach(function (ev) {
      var li = el("li");
      li.appendChild(el("span", "t", ev.t || ""));
      li.appendChild(el("span", "", ev.tekst || ""));
      ul.appendChild(li);
    });
  }

  function renderChellendzhi(list) {
    var box = $("chellendzhi");
    box.textContent = "";
    if (!list.length) { box.appendChild(el("p", "muted", "Челленджей нет.")); return; }
    list.forEach(function (c) {
      var wrap = el("div");
      var head = el("div", "ch-head");
      head.appendChild(el("span", "", c.nazv || c.id));
      head.appendChild(el("span", "num", num(c.est) + " / " + num(c.nado)));
      wrap.appendChild(head);
      var bar = el("div", "bar ch");
      var i = el("i");
      i.style.width = pct(c.est, c.nado) + "%";
      bar.appendChild(i);
      wrap.appendChild(bar);
      var meta = [];
      if (c.nagrada) meta.push("награда " + num(c.nagrada) + " монет");
      if (c.srok) meta.push("до " + data(c.srok));
      if (meta.length) wrap.appendChild(el("div", "ch-meta", meta.join(" · ")));
      box.appendChild(wrap);
    });
  }

  function renderBoss(b) {
    var box = $("boss");
    box.textContent = "";
    if (!b) { box.appendChild(el("p", "muted", "Босса нет.")); return; }
    box.appendChild(el("div", "boss-name", b.nazv || "Босс"));
    var row = el("div", "bar-row");
    row.appendChild(el("span", "lbl", "Здоровье"));
    var bar = el("div", "bar boss");
    var i = el("i");
    i.style.width = pct(b.hp, b.hp_max) + "%";
    bar.appendChild(i);
    row.appendChild(bar);
    row.appendChild(el("span", "num", num(b.hp) + " / " + num(b.hp_max)));
    box.appendChild(row);
    if (b.srok) box.appendChild(el("div", "ch-meta", "Срок – до " + data(b.srok)));
  }

  function renderShop() {
    var s = state;
    var box = $("shop");
    box.textContent = "";
    var inv = Array.isArray(s.inventar) ? s.inventar : [];
    var nar = s.naryad || {};
    var list = (Array.isArray(s.magazin) ? s.magazin : []).filter(function (it) {
      return (it.tip || "shmot") === tab;
    });
    if (!list.length) {
      box.appendChild(el("p", "muted", tab === "shmot" ? "Шмота в магазине нет." : "Наград пока нет."));
      return;
    }
    list.forEach(function (it) {
      var shmot = tab === "shmot";
      var row = el("div", shmot ? "item" : "item no-icon");
      if (shmot) {
        var cv = el("canvas");
        cv.width = 48; cv.height = 64;
        cv.setAttribute("aria-hidden", "true");
        row.appendChild(cv);
        window.GromHero.icon(it.id, cv);
      }
      var info = el("div");
      info.appendChild(el("div", "nm", it.nazv || NAZV[it.id] || it.id));
      var sub = el("div", "sub");
      var owned = shmot && inv.indexOf(it.id) >= 0;
      var worn = owned && it.slot && nar[it.slot] === it.id;
      if (shmot && it.slot) sub.appendChild(document.createTextNode((SLOTY[it.slot] || it.slot) + " · "));
      if (owned) sub.appendChild(el("span", "own", worn ? "надето" : "куплено"));
      else sub.appendChild(document.createTextNode(num(it.cena) + " монет"));
      info.appendChild(sub);
      row.appendChild(info);
      row.appendChild(actionButton(it, owned, worn));
      box.appendChild(row);
    });
  }

  function actionButton(it, owned, worn) {
    var b = el("button", "btn");
    b.type = "button";
    if (worn) {
      b.textContent = "Снять";
      b.className = "btn ghost";
      b.onclick = function () { send({ a: "snyat", slot: it.slot }); };
      return b;
    }
    if (owned) {
      b.textContent = "Надеть";
      b.onclick = function () { send({ a: "nadet", id: it.id }); };
      return b;
    }
    var cena = num(it.cena);
    b.textContent = "Купить";
    if (num(state.monety) < cena) {
      b.disabled = true;
      b.title = "Не хватает " + (cena - num(state.monety)) + " монет";
      return b;
    }
    // покупка – в два нажатия, чтобы не потратить монеты случайно
    var armed = false;
    var reset = null;
    b.onclick = function () {
      if (!armed) {
        armed = true;
        b.textContent = "Точно? −" + cena;
        b.classList.add("sure");
        reset = setTimeout(function () { armed = false; b.textContent = "Купить"; b.classList.remove("sure"); }, 4000);
        return;
      }
      clearTimeout(reset);
      send({ a: "kupit", id: it.id });
    };
    return b;
  }

  // ---------- действия ----------
  function send(obj) {
    var s = JSON.stringify(obj);
    if (new TextEncoder().encode(s).length > 200) { toast("Слишком длинное действие."); return; }
    if (inTg && tg.sendData) {
      try { tg.sendData(s); return; } catch (e) { toast("Telegram не принял действие: откройте героя кнопкой внизу чата с ботом."); return; }
    }
    if (macHandler) {
      try {
        macHandler.postMessage(s);
        toast("Отправлено. Гром ответит через несколько секунд.");
      } catch (e) { toast("Приложение не приняло действие."); }
      return;
    }
    $("action-hint").hidden = false;
    toast("Действия работают в Telegram и в приложении на маке.");
  }

  var toastTimer = null;
  function toast(text) {
    var t = $("toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4500);
  }

  // ---------- авторы ----------
  function renderCredits() {
    var box = $("credits");
    box.textContent = "";
    (manifest.credits || []).forEach(function (c) {
      var d = el("div", "credit");
      d.appendChild(el("b", "", (NAZV[c.item] || c.item) + " – " + c.name));
      d.appendChild(el("div", "muted", c.file));
      d.appendChild(el("div", "", "Авторы: " + c.authors.join(", ")));
      d.appendChild(el("div", "", "Лицензии: " + c.licenses.join(", ")));
      (c.urls || []).forEach(function (u) {
        var a = el("a", "", u);
        a.href = u; a.target = "_blank"; a.rel = "noopener";
        var line = el("div");
        line.appendChild(a);
        d.appendChild(line);
      });
      box.appendChild(d);
    });
  }

  // ---------- вход для приложения на маке ----------
  window.gromState = function (obj) {
    if (typeof obj === "string") { try { obj = JSON.parse(obj); } catch (e) { return false; } }
    $("offline").hidden = true;
    apply(obj, false);
    return true;
  };
  window.gromToast = function (text) { toast(String(text || "")); };
  window.gromSvyaz = function (ok) {
    $("offline").hidden = !!ok;
    if (!ok && !state) apply(DEMO, true);
  };

  // ---------- старт ----------
  temaInit();
  if (inTg) { try { tg.ready(); tg.expand(); } catch (e) { /* старый клиент */ } }
  if (!inTg && !macHandler) $("action-hint").hidden = false;

  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
    t.addEventListener("click", function () {
      tab = t.getAttribute("data-tab");
      Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (x) {
        x.classList.toggle("active", x === t);
      });
      if (state) renderShop();
    });
  });

  $("boy-btn").addEventListener("click", function () {
    window.GromHero.fight(Math.random() < 0.5 ? "cherepaha" : "kapitan");
  });

  window.addEventListener("hashchange", function () {
    var s = fromHash();
    if (s) apply(s, false);
  });

  fetch("sprites/manifest.json").then(function (r) { return r.json(); }).then(function (m) {
    manifest = m;
    window.GromHero.init($("hero"), m);
    renderCredits();
    if (pendingState) { var p = pendingState; pendingState = null; apply(p.s, p.demo); return; }
    if (state) return;
    var s = fromHash();
    if (s) apply(s, false);
    else if (!macHandler) apply(DEMO, true);
    else setTimeout(function () { if (!state) apply(DEMO, true); }, 6000); // приложение пришлёт состояние само
  }).catch(function () {
    toast("Не загрузились спрайты героя. Обновите страницу.");
  });
})();
