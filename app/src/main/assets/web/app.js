(function () {
  var P = window.Prayer, MIN = P.MIN, HR = P.HR, ORDER = P.ORDER;
  var FIVE = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  var A = window.Android || null; // the Android app; absent when the page is opened in a browser
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage');
  var TZO = { timeZone: 'Asia/Riyadh' };
  var fGFull = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', Object.assign({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, TZO));
  var fHFull = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', Object.assign({ day: 'numeric', month: 'long', year: 'numeric' }, TZO));
  var fHDay = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', Object.assign({ day: 'numeric', month: 'short' }, TZO));
  var fHMY = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', Object.assign({ month: 'long', year: 'numeric' }, TZO));
  var fGMY = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', Object.assign({ month: 'long', year: 'numeric' }, TZO));

  // ---------- settings (kept on the TV) ----------
  var KEY = 'prayertv-settings';
  var S = (function () {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
    return {
      offsets: Object.assign({ fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }, s.offsets),
      alerts: Object.assign({ fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true }, s.alerts),
      shortcuts: s.shortcuts || null,
      openOnBoot: s.openOnBoot !== false
    };
  })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  // ---------- fit the 1920×1080 design to the screen ----------
  // TV: remote control, app shortcuts, alert over other apps. Phone: touch, notification.
  var TV = A ? A.isTv() : !(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  stage.classList.add(TV ? 'tv' : 'phone');

  // ---------- fit any screen: landscape is 1080 units high, portrait 1080 units wide ----------
  function fit() {
    var w = innerWidth, h = innerHeight, portrait = h > w * 1.05, W, H, k;
    if (portrait) { W = 1080; k = w / W; H = h / k; }
    else {
      H = 1080; k = h / H; W = w / k;
      if (W < 1920) { W = 1920; k = w / W; H = Math.max(1080, h / k); } // squarer screens (4:3, 16:10): taller, same width
    }
    stage.classList.toggle('portrait', portrait);
    stage.style.width = W + 'px';
    stage.style.height = H + 'px';
    stage.style.transform = 'translate(' + (w - W * k) / 2 + 'px,' + (h - H * k) / 2 + 'px) scale(' + k + ')';
  }
  addEventListener('resize', fit);
  fit();

  // ---------- installed apps ----------
  var DEMO_APPS = [{ pkg: 'com.google.android.youtube.tv', label: 'YouTube', icon: '' }, { pkg: 'net.mbc.shahid', label: 'شاهد', icon: '' }, { pkg: 'com.netflix.ninja', label: 'Netflix', icon: '' }];
  var appsCache = null;
  function apps() {
    if (!appsCache) {
      try { appsCache = A ? JSON.parse(A.apps()) : DEMO_APPS; } catch (e) { appsCache = []; }
      appsCache.sort(function (a, b) { return a.label.localeCompare(b.label, 'ar'); });
    }
    return appsCache;
  }
  function findApp(pkg) { return apps().filter(function (a) { return a.pkg === pkg; })[0]; }
  function shortcutApps() {
    if (!S.shortcuts && apps().length) {
      // first run: YouTube and Shahid if installed
      S.shortcuts = [];
      [/youtube|يوتيوب/i, /shahid|شاهد/i].forEach(function (re) {
        var a = apps().filter(function (x) { return re.test(x.label) || re.test(x.pkg); })[0];
        if (a && S.shortcuts.indexOf(a.pkg) < 0) S.shortcuts.push(a.pkg);
      });
      save();
    }
    return (S.shortcuts || []).map(findApp).filter(Boolean);
  }
  var ICON_PLAY = '<svg viewBox="0 0 24 24" class="ic"><rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>';
  var ICON_ALL = '<svg viewBox="0 0 24 24" class="ic"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tileHtml(a) {
    return '<button class="tile f" data-pkg="' + esc(a.pkg) + '">' + (a.icon ? '<img src="' + a.icon + '" alt="">' : ICON_PLAY) + '<span>' + esc(a.label) + '</span></button>';
  }
  function renderShortcuts() {
    var box = $('shortcuts');
    if (!TV) { box.innerHTML = ''; return; }
    var idx = Array.prototype.indexOf.call(box.children, document.activeElement);
    box.innerHTML = shortcutApps().map(tileHtml).join('') +
      '<button class="tile f" data-go="apps">' + ICON_ALL + '<span>كل التطبيقات</span></button>';
    if (idx >= 0) (box.children[idx] || box.lastElementChild).focus();
  }

  // ---------- weather (Open-Meteo, every 30 minutes) ----------
  var CITIES = [{ lat: 24.7136, lon: 46.6753 }, { lat: 32.5556, lon: 35.85 }];
  var W_ICONS = {
    sun: '<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" class="ic"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    partly: '<svg viewBox="0 0 24 24" class="ic"><path d="M8 3.5v1.5M3.5 8H2M4.8 4.8l1 1M12.5 6.2A4 4 0 0 0 5 9.5"/><path d="M7.5 20h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.6 13 3.5 3.5 0 0 0 7.5 20z"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" class="ic"><path d="M6.5 19h11a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.6 11.5 3.75 3.75 0 0 0 6.5 19z"/></svg>',
    fog: '<svg viewBox="0 0 24 24" class="ic"><path d="M4 10h16M3 14h18M6 18h12"/></svg>',
    rain: '<svg viewBox="0 0 24 24" class="ic"><path d="M6.5 15h11a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.6 7.5 3.75 3.75 0 0 0 6.5 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></svg>',
    snow: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/></svg>',
    storm: '<svg viewBox="0 0 24 24" class="ic"><path d="M6.5 14h11a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.6 6.5 3.75 3.75 0 0 0 6.5 14z"/><path d="M12.5 15l-2 3.5h3l-2 3.5"/></svg>'
  };
  function weatherInfo(code, day) {
    if (code === 0) return [day ? 'sun' : 'moon', 'صافٍ'];
    if (code === 1) return [day ? 'sun' : 'moon', 'صافٍ غالبًا'];
    if (code === 2) return ['partly', 'غائم جزئيًا'];
    if (code === 3) return ['cloud', 'غائم'];
    if (code === 45 || code === 48) return ['fog', 'ضباب'];
    if (code >= 51 && code <= 57) return ['rain', 'رذاذ'];
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['rain', 'ماطر'];
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['snow', 'ثلج'];
    if (code >= 95) return ['storm', 'عاصفة رعدية'];
    return ['cloud', ''];
  }
  function showWeather(i, w) {
    var info = weatherInfo(w.code, w.day);
    $('w' + i + '-icon').innerHTML = W_ICONS[info[0]];
    $('w' + i + '-temp').textContent = w.t + '°';
    $('w' + i + '-desc').textContent = info[1];
  }
  function loadWeather() {
    CITIES.forEach(function (c, i) {
      fetch('https://api.open-meteo.com/v1/forecast?latitude=' + c.lat + '&longitude=' + c.lon + '&current=temperature_2m,weather_code,is_day&timezone=auto')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var w = { t: Math.round(j.current.temperature_2m), code: j.current.weather_code, day: j.current.is_day, at: Date.now() };
          try { localStorage.setItem('prayertv-w' + i, JSON.stringify(w)); } catch (e) {}
          showWeather(i, w);
        })
        .catch(function () {});
    });
  }
  CITIES.forEach(function (c, i) {
    try {
      var w = JSON.parse(localStorage.getItem('prayertv-w' + i));
      if (w && Date.now() - w.at < 6 * HR) showWeather(i, w);
    } catch (e) {}
  });

  // ---------- prayer alerts sent to Android (30 days ahead) ----------
  function minutesWord(n) { return n >= 3 && n <= 10 ? n + ' دقائق' : n + ' دقيقة'; }
  function alertTitle(k, T) { return k === 'dhuhr' && T.friday ? 'حان الآن وقت صلاة الجمعة' : 'حان الآن وقت صلاة ' + P.name(k); }
  function alertSub(k, T) {
    var s = (k === 'maghrib' && T.ramadan ? 'موعد الإفطار · ' : '') + 'الأذان ' + P.full(T.at[k]);
    if (T.iqamah[k]) s += ' · الإقامة ' + P.full(T.iqamah[k]) + ' (بعد ' + minutesWord(Math.round((T.iqamah[k] - T.at[k]) / MIN)) + ')';
    return s;
  }
  function sendSchedule() {
    if (!A) return;
    var t = Date.now(), r = P.ymd(t), ev = [];
    for (var i = 0; i < 30; i++) {
      var dd = P.addDays(r.y, r.m, r.d, i), T = P.dayTimes(dd.y, dd.m, dd.d, S.offsets);
      FIVE.forEach(function (k) {
        if (S.alerts[k] && T.at[k] > t) ev.push({ at: T.at[k], title: alertTitle(k, T), sub: alertSub(k, T) });
      });
    }
    try { A.schedule(JSON.stringify(ev)); } catch (e) {}
  }

  // banner inside the app (the Android side plays the chime)
  var alerted = {}, bannerTimer = null;
  function checkAlert(t, T) {
    FIVE.forEach(function (k) {
      var at = T.at[k];
      if (S.alerts[k] && t >= at && t < at + 15000 && !alerted[at]) {
        alerted[at] = true;
        if (T.iqamah[k]) return; // the full-screen iqamah countdown shows instead
        $('b-title').textContent = alertTitle(k, T);
        $('b-sub').textContent = alertSub(k, T);
        $('banner').classList.remove('hidden');
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(function () { $('banner').classList.add('hidden'); }, 15000);
      }
    });
  }

  // ---------- main screen ----------
  // cards: Imsak (10 minutes before Fajr) then the prayers
  var CARDS = ['imsak'].concat(ORDER), cards = {};
  CARDS.forEach(function (k) {
    var c = document.createElement('div');
    c.className = 'pc';
    c.innerHTML = '<div class="pc-head"><span class="pc-name"></span><span class="pc-badge hidden"></span></div>' +
      '<div class="pc-time"></div><div class="pc-iq"></div>';
    $('prayers').appendChild(c);
    cards[k] = c;
  });

  function nextRamadan(t, days, field) {
    for (var i = 0; i < days.length; i++) if (days[i].ramadan && days[i][field] > t) return days[i][field];
    return null;
  }

  function renderHome(t, today, tom) {
    var cur = null, iq = null, nextK = null;
    ORDER.forEach(function (k) {
      if (today.at[k] <= t) cur = k;
      if (today.iqamah[k] && today.at[k] <= t && t < today.iqamah[k]) iq = k;
      if (!nextK && today.at[k] > t) nextK = k;
    });
    var tomorrow = !nextK;
    if (!nextK) nextK = 'fajr';
    var nd = tomorrow ? tom : today, nextTs = nd.at[nextK];

    var label, name, cd, detail;
    if (iq) {
      label = 'متبقٍ على الإقامة';
      name = 'صلاة ' + P.name(iq, today.friday);
      cd = P.left(today.iqamah[iq] - t);
      detail = 'الأذان ' + P.full(today.at[iq]) + ' · الإقامة ' + P.full(today.iqamah[iq]);
    } else if (nextK === 'sunrise') {
      label = 'متبقٍ على الشروق';
      name = 'الشروق';
      cd = P.left(nextTs - t);
      detail = 'الشروق ' + P.full(nextTs);
    } else {
      label = nd.ramadan && nextK === 'maghrib' ? 'متبقٍ على الإفطار' : 'الصلاة القادمة';
      name = P.name(nextK, nd.friday);
      cd = P.left(nextTs - t);
      detail = 'الأذان ' + P.full(nextTs) + (nd.iqamah[nextK] ? ' · الإقامة ' + P.full(nd.iqamah[nextK]) : '');
    }
    $('next-label').textContent = label;
    $('next-name').textContent = name;
    $('countdown').textContent = cd;
    $('next-detail').textContent = detail;

    CARDS.forEach(function (k) {
      var day = tomorrow && (k === 'fajr' || k === 'imsak') ? tom : today;
      var isNow = k === cur, isNext = k === nextK && !isNow;
      var c = cards[k];
      c.className = 'pc' + (isNow ? ' now' : '') + (isNext ? ' next-p' : '');
      c.querySelector('.pc-name').textContent = k === 'imsak' ? 'الإمساك' : P.name(k, day.friday);
      var b = c.querySelector('.pc-badge');
      b.textContent = isNow ? 'الآن' : 'التالية';
      b.classList.toggle('hidden', !isNow && !isNext);
      c.querySelector('.pc-time').textContent = P.full(k === 'imsak' ? day.imsak : day.at[k]);
      c.querySelector('.pc-iq').textContent = k === 'imsak' ? 'قبل الفجر بـ 10 دقائق' :
        day.iqamah[k] ? 'الإقامة ' + P.full(day.iqamah[k]) : (k === 'dhuhr' && day.friday ? 'بعد الخطبة' : '');
    });

    // Ramadan: time left to iftar and to suhoor (imsak)
    var showR = today.ramadan || tom.ramadan;
    $('ramadan').classList.toggle('hidden', !showR);
    if (showR) {
      var days = [today, tom], ift = nextRamadan(t, days, 'maghribAt'), suh = nextRamadan(t, days, 'imsak');
      $('iftar-at').textContent = ift ? P.full(ift) : '—';
      $('iftar-left').textContent = ift ? P.leftHM(ift - t) : '—';
      $('suhoor-at').textContent = suh ? P.full(suh) : '—';
      $('suhoor-left').textContent = suh ? P.leftHM(suh - t) : '—';
    }
  }

  function renderDay(t, r, today) {
    $('g-date').textContent = fGFull.format(new Date(t));
    $('h-date').textContent = fHFull.format(new Date(t));
    $('friday-box').classList.toggle('hidden', !today.friday);
  }

  // ---------- a new reminder every 3 minutes: verse, hadith, verse, wisdom, hadith, useful note ----------
  var CYCLE = ['aya', 'hadith', 'aya', 'hikma', 'hadith', 'faida'], lastQ = -1;
  function reminder(n) {
    var round = Math.floor(n / CYCLE.length), kind = CYCLE[n % CYCLE.length];
    var before = CYCLE.slice(0, n % CYCLE.length).filter(function (x) { return x === kind; }).length;
    var per = CYCLE.filter(function (x) { return x === kind; }).length;
    var list = REMINDERS[kind];
    return list[(round * per + before) % list.length];
  }
  function showReminder(t) {
    var n = Math.floor(t / (3 * MIN));
    if (n === lastQ) return;
    var first = lastQ < 0;
    lastQ = n;
    var q = reminder(n), box = $('quote-box');
    function put() {
      $('quote-type').textContent = q.type;
      $('quote').textContent = q.quran ? '﴿' + q.text + '﴾' : q.text;
      $('quote').className = 'q-text' + (q.quran ? ' quran' : '');
      $('quote').style.fontSize = q.text.length > 110 ? (q.quran ? '32px' : '26px') : q.text.length > 60 ? (q.quran ? '36px' : '30px') : '';
      $('quote-src').textContent = q.src;
      box.classList.remove('fade');
    }
    if (first) put();
    else { box.classList.add('fade'); setTimeout(put, 600); }
  }

  // ---------- every second ----------
  var lastDay = '', night = null;
  function dayOf(y, m, d) {
    var T = P.dayTimes(y, m, d, S.offsets);
    T.maghribAt = T.at.maghrib;
    return T;
  }
  function tick() {
    var t = Date.now(), r = P.ymd(t);
    var today = dayOf(r.y, r.m, r.d), tm = P.addDays(r.y, r.m, r.d, 1), tom = dayOf(tm.y, tm.m, tm.d);
    var key = r.y + '-' + r.m + '-' + r.d;
    if (key !== lastDay) { lastDay = key; renderDay(t, r, today); sendSchedule(); }
    // dark from two hours after Isha until Fajr
    var n = t >= today.at.isha + 2 * HR || t < today.at.fajr;
    if (n !== night) { night = n; stage.classList.toggle('night', n); stage.classList.toggle('day', !n); }
    $('clock').textContent = P.full(t);
    showReminder(t);
    if (screen === 'home') renderHome(t, today, tom);
    if (screen === 'kahf') $('kahf-clock').textContent = P.full(t);
    checkAlert(t, today);
    checkIqamah(t, today);
  }

  // ---------- full-screen countdown from the adhan to the iqamah ----------
  var iqDismissed = {}, iqAt = 0, iqPrevFocus = null;
  function iqOpen() { return !$('iqamah').classList.contains('hidden'); }
  function checkIqamah(t, T) {
    var on = null;
    FIVE.forEach(function (k) { if (S.alerts[k] && T.iqamah[k] && t >= T.at[k] && t < T.iqamah[k]) on = k; });
    if (on && !iqDismissed[T.at[on]]) {
      if (!iqOpen()) {
        iqPrevFocus = document.activeElement;
        $('iqamah').classList.remove('hidden');
        $('iq-close').focus();
      }
      iqAt = T.at[on];
      var left = T.iqamah[on] - t;
      $('iq-label').textContent = 'متبقٍ على إقامة صلاة ' + P.name(on, T.friday);
      $('iq-cd').textContent = P.left(left);
      $('iq-cd').classList.toggle('soon', left <= 60000);
      $('iq-detail').textContent = 'الأذان ' + P.full(T.at[on]) + ' · الإقامة ' + P.full(T.iqamah[on]);
      $('iq-clock').textContent = P.full(t);
    } else if (iqOpen()) iqHide();
  }
  function iqHide() {
    $('iqamah').classList.add('hidden');
    if (iqPrevFocus && document.body.contains(iqPrevFocus) && iqPrevFocus.offsetParent !== null) iqPrevFocus.focus();
    else focusFirst();
  }
  function iqDismiss() { iqDismissed[iqAt] = true; iqHide(); }

  // ---------- calendar ----------
  var cal = {};
  function calOpen() {
    var r = P.ymd(Date.now());
    cal = { vy: r.y, vm: r.m, sy: r.y, sm: r.m, sd: r.d, ty: r.y, tm: r.m, td: r.d };
    calRender();
    var c = document.querySelector('#cal-grid .cell.sel');
    if (c) c.focus();
  }
  function calRender() {
    var first = new Date(Date.UTC(cal.vy, cal.vm - 1, 1)).getUTCDay();
    var days = new Date(Date.UTC(cal.vy, cal.vm, 0)).getUTCDate();
    var html = '';
    for (var b = 0; b < first; b++) html += '<div></div>';
    for (var d = 1; d <= days; d++) {
      var ts = P.noonOf(cal.vy, cal.vm, d);
      var cls = 'cell f' + (new Date(Date.UTC(cal.vy, cal.vm - 1, d)).getUTCDay() === 5 ? ' fri' : '') +
        (cal.vy === cal.ty && cal.vm === cal.tm && d === cal.td ? ' today' : '');
      html += '<button class="' + cls + '" data-d="' + d + '"><span class="cg">' + d + '</span><span class="ch">' + fHDay.format(new Date(ts)) + '</span></button>';
    }
    $('cal-grid').innerHTML = html;
    var rows = Math.ceil((first + days) / 7);
    $('cal-grid').style.gridTemplateRows = 'repeat(' + rows + ', minmax(0, 1fr))';
    $('cal-month').textContent = fGMY.format(new Date(P.noonOf(cal.vy, cal.vm, 1)));
    var h1 = fHMY.format(new Date(P.noonOf(cal.vy, cal.vm, 1))), h2 = fHMY.format(new Date(P.noonOf(cal.vy, cal.vm, days)));
    $('cal-hijri').textContent = h1 === h2 ? h1 : h1 + ' – ' + h2;
    calMark();
    calPanel();
  }
  function calMark() {
    Array.prototype.forEach.call(document.querySelectorAll('#cal-grid .cell'), function (c) {
      c.classList.toggle('sel', cal.vy === cal.sy && cal.vm === cal.sm && +c.dataset.d === cal.sd);
    });
  }
  function calPanel() {
    var T = P.dayTimes(cal.sy, cal.sm, cal.sd, S.offsets), ts = P.noonOf(cal.sy, cal.sm, cal.sd);
    $('cal-greg').textContent = fGFull.format(new Date(ts));
    $('cal-hdate').textContent = fHFull.format(new Date(ts));
    $('cal-is-today').classList.toggle('hidden', !(cal.sy === cal.ty && cal.sm === cal.tm && cal.sd === cal.td));
    $('cal-rows').innerHTML = ['imsak'].concat(ORDER).map(function (k) {
      var at = k === 'imsak' ? T.imsak : T.at[k], iq = k === 'imsak' ? null : T.iqamah[k];
      return '<div class="cal-tr"><span class="n">' + (k === 'imsak' ? 'الإمساك' : P.name(k, T.friday)) + '</span><span class="a">' + P.full(at) +
        '</span><span class="i">' + (iq ? P.full(iq) : '—') + '</span></div>';
    }).join('');
  }
  function calMonth(step) {
    cal.vm += step;
    if (cal.vm < 1) { cal.vm = 12; cal.vy--; }
    if (cal.vm > 12) { cal.vm = 1; cal.vy++; }
    calRender();
  }

  // ---------- Surah Al-Kahf (Mishary Alafasy, verse by verse from everyayah.com) ----------
  var kahf = { i: 0, playing: false };
  var audio = new Audio(), pre = new Audio();
  pre.preload = 'auto';
  function kSrc(i) {
    return 'https://everyayah.com/data/Alafasy_128kbps/' + (i === 0 ? '001001' : '018' + ('00' + i).slice(-3)) + '.mp3';
  }
  function arNum(n) { return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
  function kText(i) { return i === 0 ? BASMALA : (i >= 1 && i <= 110 ? KAHF[i - 1] + ' ﴿' + arNum(i) + '﴾' : ''); }
  function kRender() {
    var i = kahf.i, cur = kText(i);
    $('k-prev').textContent = i > 0 ? kText(i - 1) : '';
    $('k-cur').textContent = cur;
    $('k-next').textContent = kText(i + 1);
    $('k-cur').style.fontSize = cur.length > 330 ? '42px' : cur.length > 200 ? '52px' : cur.length > 110 ? '60px' : '70px';
    $('k-pos').textContent = i === 0 ? 'البسملة' : 'الآية ' + i + ' من 110';
    $('k-fill').style.width = (i / 110 * 100) + '%';
    $('k-ic-pause').classList.toggle('hidden', !kahf.playing);
    $('k-ic-play').classList.toggle('hidden', kahf.playing);
  }
  function kPlay(i) {
    kahf.i = i;
    kahf.playing = true;
    $('k-msg').textContent = '';
    audio.src = kSrc(i);
    audio.play().catch(function () {});
    if (i < 110) pre.src = kSrc(i + 1);
    kRender();
  }
  audio.addEventListener('ended', function () {
    if (kahf.i < 110) kPlay(kahf.i + 1);
    else { kahf.playing = false; $('k-msg').textContent = 'صدق الله العظيم'; kRender(); }
  });
  audio.addEventListener('error', function () {
    if (!audio.src) return;
    kahf.playing = false;
    $('k-msg').textContent = 'تعذّر التشغيل، تأكدي من اتصال الإنترنت';
    kRender();
  });
  function kToggle() {
    if (kahf.playing) { audio.pause(); kahf.playing = false; kRender(); }
    else if (audio.src && !audio.ended && audio.currentTime > 0) { audio.play().catch(function () {}); kahf.playing = true; kRender(); }
    else kPlay(kahf.i);
  }
  function kStop() { audio.pause(); kahf.playing = false; }

  // ---------- all apps ----------
  var appsMode = 'launch';
  function appsRender() {
    var list = apps();
    if (appsMode === 'pick') list = list.filter(function (a) { return (S.shortcuts || []).indexOf(a.pkg) < 0; });
    $('apps-title').textContent = appsMode === 'pick' ? 'اختاري تطبيقًا للاختصارات' : 'كل التطبيقات';
    $('apps-sub').textContent = list.length + ' تطبيق';
    $('apps-grid').innerHTML = list.map(tileHtml).join('');
  }

  // ---------- settings ----------
  function setRender() {
    var keep = document.activeElement && document.activeElement.dataset.k;
    var r = P.ymd(Date.now()), T = P.dayTimes(r.y, r.m, r.d, S.offsets);
    $('set-prayers').innerHTML = ORDER.map(function (k) {
      var off = S.offsets[k];
      return '<div class="srow"><span class="sname">' + P.name(k) + '</span><span class="stime">' + P.full(T.at[k]) + '</span>' +
        '<button class="sbtn f" data-k="m-' + k + '" aria-label="ناقص دقيقة">−</button>' +
        '<span class="soff">' + (off > 0 ? '+' : '') + off + '</span>' +
        '<button class="sbtn f" data-k="p-' + k + '" aria-label="زائد دقيقة">+</button>' +
        (k === 'sunrise' ? '<span class="sbtn al" style="visibility:hidden"></span>' :
          '<button class="sbtn al f' + (S.alerts[k] ? ' on' : '') + '" data-k="a-' + k + '">' + (S.alerts[k] ? 'التنبيه يعمل' : 'التنبيه متوقف') + '</button>') +
        '</div>';
    }).join('');
    var sc = shortcutApps();
    $('set-shortcuts').innerHTML = sc.length ? sc.map(function (a, i) {
      return '<div class="srow">' + (a.icon ? '<img src="' + a.icon + '" alt="">' : '') + '<span class="sname">' + esc(a.label) + '</span>' +
        '<button class="sbtn f" data-k="u-' + i + '" aria-label="إلى الأعلى">▲</button>' +
        '<button class="sbtn f" data-k="d-' + i + '" aria-label="إلى الأسفل">▼</button>' +
        '<button class="sbtn f" data-k="x-' + i + '">حذف</button></div>';
    }).join('') : '<div class="muted set-note">لا توجد اختصارات</div>';
    var overlay = !A || A.canOverlay();
    $('set-general').innerHTML =
      '<div class="srow"><span class="sname">فتح هذه الشاشة عند تشغيل التلفزيون</span><button class="sbtn f' + (S.openOnBoot ? ' on' : '') + '" data-k="boot">' + (S.openOnBoot ? 'يعمل' : 'متوقف') + '</button></div>' +
      '<div class="srow"><span class="sname">التنبيه فوق التطبيقات الأخرى (مثل يوتيوب)</span>' +
      (overlay ? '<span class="muted">مسموح</span>' : '<button class="sbtn f" data-k="overlay">السماح</button>') + '</div>';
    $('set-version').textContent = A ? 'الإصدار ' + A.version() : '';
    if (keep) {
      var el = document.querySelector('#settings [data-k="' + keep + '"]');
      if (el) el.focus();
    }
  }
  function setAction(k) {
    var p = k.split('-'), a = p[0], v = p[1];
    if (a === 'm' || a === 'p') { S.offsets[v] = Math.max(-30, Math.min(30, S.offsets[v] + (a === 'p' ? 1 : -1))); }
    else if (a === 'a') S.alerts[v] = !S.alerts[v];
    else if (a === 'u' || a === 'd') {
      var i = +v, j = a === 'u' ? i - 1 : i + 1, arr = S.shortcuts;
      if (j >= 0 && j < arr.length) { var x = arr[i]; arr[i] = arr[j]; arr[j] = x; }
    } else if (a === 'x') S.shortcuts.splice(+v, 1);
    else if (a === 'boot') { S.openOnBoot = !S.openOnBoot; if (A) A.setOpenOnBoot(S.openOnBoot); }
    else if (a === 'overlay') { if (A) A.openOverlaySettings(); return; }
    save();
    if (a === 'm' || a === 'p' || a === 'a') { sendSchedule(); lastDay = ''; }
    setRender();
    if (!document.activeElement || document.activeElement === document.body) {
      var f = document.querySelector('#settings .f'); if (f) f.focus();
    }
  }

  // ---------- screens ----------
  var screen = 'home', stack = [], lastFocus = {};
  function show(name) {
    if (document.activeElement && document.activeElement.classList.contains('f')) lastFocus[screen] = document.activeElement;
    Array.prototype.forEach.call(document.querySelectorAll('.screen'), function (s) { s.classList.toggle('hidden', s.id !== name); });
    screen = name;
    if (name === 'home') { renderShortcuts(); tick(); }
    if (name === 'calendar') { calOpen(); return; }
    if (name === 'kahf') { kPlay(0); $('kahf-clock').textContent = P.full(Date.now()); focusFirst($('k-play')); return; }
    if (name === 'apps') { appsRender(); focusFirst(document.querySelector('#apps-grid .f')); return; }
    if (name === 'settings') setRender();
    var lf = lastFocus[name];
    focusFirst(lf && document.body.contains(lf) && !lf.closest('.hidden') ? lf : null);
  }
  function focusFirst(el) {
    if (iqOpen()) el = $('iq-close');
    el = el || document.querySelector('#' + screen + (screen === 'home' ? ' #shortcuts .f' : ' .f'));
    if (el) el.focus();
  }
  function go(name) { stack.push(screen); show(name); }
  function back() {
    if (iqOpen()) { iqDismiss(); return true; }
    if (screen === 'home') return false;
    if (screen === 'kahf') kStop();
    var to = stack.pop() || 'home';
    if (screen === 'apps' && appsMode === 'pick') to = 'settings';
    appsMode = 'launch';
    show(to);
    return true;
  }

  // ---------- remote control: arrows move between the nearest items ----------
  function focusables() {
    return Array.prototype.filter.call(document.querySelectorAll(iqOpen() ? '#iqamah .f' : '#' + screen + ' .f'), function (e) { return e.offsetParent !== null; });
  }
  function move(dir) {
    var cur = document.activeElement, list = focusables();
    if (!list.length) return;
    if (list.indexOf(cur) < 0) { list[0].focus(); return; }
    var a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2, best = null, bs = Infinity;
    list.forEach(function (e) {
      if (e === cur) return;
      var b = e.getBoundingClientRect(), dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay, main, cross;
      if (dir === 'left' || dir === 'right') {
        main = dir === 'left' ? -dx : dx;
        cross = (b.top < a.bottom && b.bottom > a.top) ? 0 : Math.abs(dy);
      } else {
        main = dir === 'up' ? -dy : dy;
        cross = (b.left < a.right && b.right > a.left) ? 0 : Math.abs(dx);
      }
      if (main <= 4) return;
      var score = main + cross * 3;
      if (score < bs) { bs = score; best = e; }
    });
    if (best) {
      best.focus();
      if (best.scrollIntoView) best.scrollIntoView({ block: 'nearest' });
    }
  }
  document.addEventListener('keydown', function (e) {
    var k = e.key;
    var dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (dirs[k]) { e.preventDefault(); move(dirs[k]); return; }
    if (k === 'Enter' || k === ' ') {
      if (document.activeElement && document.activeElement.classList.contains('f')) { e.preventDefault(); document.activeElement.click(); }
      return;
    }
    if (k === 'Escape' || k === 'Backspace' || k === 'GoBack') { e.preventDefault(); back(); }
    if (k === 'MediaPlayPause' && screen === 'kahf') kToggle();
  });
  document.addEventListener('focusin', function (e) {
    var c = e.target;
    if (c.classList && c.classList.contains('cell')) { cal.sy = cal.vy; cal.sm = cal.vm; cal.sd = +c.dataset.d; calMark(); calPanel(); }
  });

  document.addEventListener('click', function (e) {
    var el = e.target.closest('button');
    if (!el) return;
    if (el.hasAttribute('data-go')) { if (el.dataset.go === 'apps') appsMode = 'launch'; go(el.dataset.go); return; }
    if (el.hasAttribute('data-back')) { back(); return; }
    if (el.dataset.pkg) {
      if (screen === 'apps' && appsMode === 'pick') {
        S.shortcuts = (S.shortcuts || []).concat([el.dataset.pkg]); save(); back(); return;
      }
      if (A) A.launch(el.dataset.pkg);
      return;
    }
    if (el.dataset.k) { setAction(el.dataset.k); return; }
    if (el.classList.contains('cell')) { el.focus(); return; }
    switch (el.id) {
      case 'iq-close': iqDismiss(); break;
      case 'cal-prev': calMonth(-1); break;
      case 'cal-next': calMonth(1); break;
      case 'cal-today': calOpen(); break;
      case 'k-play': kToggle(); break;
      case 'k-prev-btn': if (kahf.i > 0) kPlay(kahf.i - 1); break;
      case 'k-next-btn': if (kahf.i < 110) kPlay(kahf.i + 1); break;
      case 'set-add': appsMode = 'pick'; go('apps'); break;
    }
  });

  // called by Android
  window.App = {
    back: back,
    onResume: function () {
      appsCache = null;
      if (screen === 'home') renderShortcuts();
      if (screen === 'settings') setRender();
      sendSchedule();
    }
  };

  if (A && TV) { try { A.setOpenOnBoot(S.openOnBoot); } catch (e) {} }
  renderShortcuts();
  tick();
  setTimeout(function () { tick(); setInterval(tick, 1000); }, 1000 - Date.now() % 1000);
  loadWeather();
  setInterval(loadWeather, 30 * MIN);
  focusFirst();
})();
