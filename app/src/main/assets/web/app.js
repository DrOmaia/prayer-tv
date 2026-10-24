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
      openOnBoot: s.openOnBoot !== false,
      events: s.events || [], // own occasions: {name, y, m, d} (Gregorian)
      autoEv: Object.assign({ ramadan: true, fitr: true, adha: true }, s.autoEv),
      ishaMin: Object.assign({ normal: 90, ramadan: 120 }, s.ishaMin),
      famMsgs: s.famMsgs || [], // own family messages: {to, text}
      family: s.family || null // null: the default family (family.js)
    };
  })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  P.setIsha(S.ishaMin);

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

  // ---------- weather (Open-Meteo, every 30 minutes): now, today, next hours, next days ----------
  var CITIES = [{ name: 'الرياض', lat: 24.7136, lon: 46.6753 }, { name: 'إربد', lat: 32.5556, lon: 35.85 }];
  var DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function svg(body) { return '<svg viewBox="0 0 24 24" class="ic">' + body + '</svg>'; }
  var CLOUD = '<path d="M6.5 19h11a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.6 11.5 3.75 3.75 0 0 0 6.5 19z"/>';
  var W_ICONS = {
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: svg('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    partly: svg('<path class="sun" d="M8 3.5v1.5M3.5 8H2M4.8 4.8l1 1M12.5 6.2A4 4 0 0 0 5 9.5"/><path d="M7.5 20h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.6 13 3.5 3.5 0 0 0 7.5 20z"/>'),
    cloud: svg(CLOUD),
    fog: svg('<path d="M4 10h16M3 14h18M6 18h12"/>'),
    rain: svg('<path d="M6.5 15h11a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.6 7.5 3.75 3.75 0 0 0 6.5 15z"/><path class="drop" d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>'),
    snow: svg('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>'),
    storm: svg('<path d="M6.5 14h11a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.6 6.5 3.75 3.75 0 0 0 6.5 14z"/><path class="bolt" d="M12.5 15l-2 3.5h3l-2 3.5"/>'),
    // small icons for the details
    hum: svg('<path d="M12 3.5s-6 6.5-6 10.5a6 6 0 0 0 12 0c0-4-6-10.5-6-10.5z"/>'),
    umb: svg('<path d="M3 12a9 9 0 0 1 18 0zM12 12v6a2 2 0 0 0 4 0"/>'),
    wind: svg('<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>'),
    feel: svg('<path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z"/>')
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
  function wIcon(code, day, cls) { var k = weatherInfo(code, day)[0]; return '<span class="wi wi-' + k + ' ' + (cls || '') + '">' + W_ICONS[k] + '</span>'; }
  function hiLo(w) { return '<span dir="ltr">' + w.hi + '° / ' + w.lo + '°</span>'; }
  function stat(k, v) { return '<span class="ws ws-' + k + '">' + W_ICONS[k] + '<b>' + v + '</b></span>'; }
  var WX = [null, null];
  function showWeather(i, w) {
    WX[i] = w;
    var info = weatherInfo(w.code, w.day);
    $('w' + i + '-icon').innerHTML = wIcon(w.code, w.day);
    $('w' + i + '-temp').textContent = w.t + '°';
    $('w' + i + '-desc').innerHTML = info[1] + (w.hi != null ? ' · ' + hiLo(w) : '');
    $('w' + i + '-meta').innerHTML = w.hum != null ?
      stat('hum', w.hum + '%') + stat('umb', w.rain + '%') + stat('wind', w.wind + ' كم/س') + stat('feel', w.feels + '°') : '';
    if (screen === 'weather') weatherRender();
  }
  function parseWeather(j) {
    var c = j.current, h = j.hourly, d = j.daily;
    var start = Math.max(0, h.time.indexOf(c.time.slice(0, 13) + ':00'));
    var hours = [];
    for (var k = start; k < Math.min(h.time.length, start + 7); k++) {
      hours.push({ h: h.time[k].slice(11, 16), t: Math.round(h.temperature_2m[k]), code: h.weather_code[k], day: h.is_day[k], p: h.precipitation_probability[k] || 0 });
    }
    var days = d.time.slice(0, 6).map(function (x, k) {
      var p = x.split('-');
      return { name: k === 0 ? 'اليوم' : DAY_NAMES[new Date(Date.UTC(+p[0], p[1] - 1, +p[2])).getUTCDay()], max: Math.round(d.temperature_2m_max[k]),
        min: Math.round(d.temperature_2m_min[k]), code: d.weather_code[k], p: d.precipitation_probability_max[k] || 0 };
    });
    return { t: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), hum: Math.round(c.relative_humidity_2m),
      wind: Math.round(c.wind_speed_10m), code: c.weather_code, day: c.is_day, rain: hours.length ? hours[0].p : 0,
      hi: days[0].max, lo: days[0].min, hours: hours, days: days, at: Date.now() };
  }
  function loadWeather() {
    CITIES.forEach(function (c, i) {
      fetch('https://api.open-meteo.com/v1/forecast?latitude=' + c.lat + '&longitude=' + c.lon +
        '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day' +
        '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=6&timezone=auto')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var w = parseWeather(j);
          try { localStorage.setItem('prayertv-w' + i, JSON.stringify(w)); } catch (e) {}
          showWeather(i, w);
        })
        .catch(function () {});
    });
  }
  // the weather screen: both cities side by side
  function weatherRender() {
    $('wx-body').innerHTML = CITIES.map(function (c, i) {
      var w = WX[i];
      if (!w || !w.hours) return '<div class="card wx-col"><div class="wx-city">' + c.name + '</div><div class="muted wx-none">لا تتوفر بيانات الطقس الآن، تأكد من اتصال الإنترنت</div></div>';
      var info = weatherInfo(w.code, w.day);
      return '<div class="card wx-col">' +
        '<div class="wx-now">' + wIcon(w.code, w.day, 'big') + '<div><div class="wx-city">' + c.name + '</div><div class="wx-temp">' + w.t + '°</div>' +
        '<div class="muted wx-desc">' + info[1] + ' · المحسوسة ' + w.feels + '° · ' + hiLo(w) + '</div></div></div>' +
        '<div class="wx-stats">' + stat('hum', w.hum + '%') + stat('umb', w.rain + '%') + stat('wind', w.wind + ' كم/س') + '</div>' +
        '<div class="wx-hours">' + w.hours.map(function (x, k) {
          return '<div class="wx-h"><span class="muted">' + (k === 0 ? 'الآن' : x.h) + '</span>' + wIcon(x.code, x.day) + '<b>' + x.t + '°</b><span class="wx-p">' + x.p + '%</span></div>';
        }).join('') + '</div>' +
        '<div class="wx-days">' + w.days.map(function (x) {
          return '<div class="wx-d"><span class="wx-dn">' + x.name + '</span>' + wIcon(x.code, 1) + '<span class="wx-p">' + x.p + '%</span><b>' + x.max + '°</b><span class="muted">' + x.min + '°</span></div>';
        }).join('') + '</div></div>';
    }).join('');
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
    var inner = '<div class="pc-name"></div><div class="pc-time"></div><div class="pc-iq"></div>';
    c.innerHTML = '<div class="pc-in">' + inner + '</div><div class="pc-in pc-over" aria-hidden="true">' + inner + '</div>';
    $('prayers').appendChild(c);
    cards[k] = c;
  });

  function setAll(c, sel, text) { Array.prototype.forEach.call(c.querySelectorAll(sel), function (e) { if (e.textContent !== text) e.textContent = text; }); }
  function nextRamadan(t, days, field) {
    for (var i = 0; i < days.length; i++) if (days[i].ramadan && days[i][field] > t) return days[i][field];
    return null;
  }

  function renderHome(t, today, tom, yest) {
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

    // the dark fill passes gradually from the current time to the next one:
    // the current card keeps the part of the period that is left, the next card fills with the part that has passed
    var seq = [['isha', yest.at.isha], ['imsak', today.imsak]].concat(ORDER.map(function (k) { return [k, today.at[k]]; }), [['imsak', tom.imsak]]);
    var ci = 0;
    for (var i = 0; i < seq.length - 1; i++) if (seq[i][1] <= t) ci = i;
    var p = Math.min(1, Math.max(0, (t - seq[ci][1]) / (seq[ci + 1][1] - seq[ci][1])));
    var fill = {};
    fill[seq[ci][0]] = 1 - p;
    fill[seq[ci + 1][0]] = p;

    CARDS.forEach(function (k) {
      var day = tomorrow && (k === 'fajr' || k === 'imsak') ? tom : today;
      var c = cards[k];
      c.className = 'pc' + (k === nextK ? ' next-p' : '');
      // the gold part moves right to left: it leaves the current card from its right side and enters the next card on its right side
      var hide = (100 - (fill[k] || 0) * 100).toFixed(2) + '%';
      c.querySelector('.pc-over').style.clipPath = k === seq[ci][0] && fill[k] < 1 ? 'inset(0 ' + hide + ' 0 0)' : 'inset(0 0 0 ' + hide + ')';
      setAll(c, '.pc-name', k === 'imsak' ? 'الإمساك' : P.name(k, day.friday));
      setAll(c, '.pc-time', P.full(k === 'imsak' ? day.imsak : day.at[k]));
      setAll(c, '.pc-iq', k === 'imsak' ? 'قبل الفجر بـ 10 دقائق' :
        day.iqamah[k] ? 'الإقامة ' + P.full(day.iqamah[k]) : (k === 'dhuhr' && day.friday ? 'بعد الخطبة' : ''));
    });

    // Ramadan: time left to iftar and to suhoor (imsak)
    var showR = today.ramadan || tom.ramadan;
    $('ramadan').classList.toggle('hidden', !showR);
    $('ramadan').parentNode.classList.toggle('has-ramadan', showR);
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

  // ---------- every 3 minutes: a reminder (verse, hadith, wisdom, note) then a family message, in turn ----------
  var CYCLE = ['aya', 'hadith', 'aya', 'hikma', 'hadith', 'faida'], lastQ = '';
  // the family set in the settings (the default family until changed)
  function fam() { return S.family || FAMILY.DEFAULT; }
  function famOrder() {
    var ms = fam().members;
    return ms.filter(function (x) { return x.kind === 'son' || x.kind === 'daughter'; })
      .concat(ms.filter(function (x) { return x.kind === 'wife' || x.kind === 'husband'; }))
      .map(function (x) { return x.id; }).concat(['all']);
  }
  function member(id) {
    return fam().members.filter(function (x) { return x.id === id; })[0] || { id: 'all', name: 'العائلة', kind: 'all' };
  }
  function sign(x) {
    if (x.kind === 'wife') return 'زوجك';
    if (x.kind === 'husband') return 'زوجتك';
    return fam().parent === 'mother' ? 'ماما' : 'بابا';
  }
  // which message set suits this person: sons under 13 get the children's set
  function msgKind(x) {
    if (x.kind !== 'son') return x.kind;
    return x.y && P.ymd(Date.now()).y - x.y < 13 ? 'sonChild' : 'sonTeen';
  }
  function fill(t, x) {
    var names = fam().members.map(function (m) { return m.name; });
    var list = names.length > 1 ? names.slice(0, -1).join('، ') + ' و' + names[names.length - 1] : names.join('');
    return t.replace(/\{name\}/g, x ? x.name : '').replace(/\{names\}/g, list);
  }
  function reminder(n) {
    var round = Math.floor(n / CYCLE.length), kind = CYCLE[n % CYCLE.length];
    var before = CYCLE.slice(0, n % CYCLE.length).filter(function (x) { return x === kind; }).length;
    var per = CYCLE.filter(function (x) { return x === kind; }).length;
    var list = REMINDERS[kind];
    return list[(round * per + before) % list.length];
  }
  // family messages, one for each person in turn (own messages added to that person's list)
  function famPool() {
    var lists = {}, pool = [], max = 0, order = famOrder();
    order.forEach(function (id) {
      var x = member(id), base = FAMILY.messages[id === 'all' ? 'all' : msgKind(x)] || [];
      lists[id] = base.map(function (t) { return fill(t, x); })
        .concat(S.famMsgs.filter(function (m) { return m.to === id; }).map(function (m) { return m.text; }));
      max = Math.max(max, lists[id].length);
    });
    for (var i = 0; i < max; i++) order.forEach(function (id) { if (lists[id][i]) pool.push({ to: id, text: lists[id][i] }); });
    return pool;
  }
  function famMessage(n) {
    var pool = famPool(), m = pool[n % pool.length], who = member(m.to);
    return { type: m.to === 'all' ? 'رسالة إلى العائلة' : 'رسالة إلى ' + who.name, text: m.text, src: '— ' + sign(who), fam: true };
  }
  function spouse() { return fam().members.filter(function (x) { return x.kind === 'wife' || x.kind === 'husband'; })[0]; }
  // birthday or wedding anniversary today: its greeting stays all day
  function special(r) {
    var b = fam().members.filter(function (x) { return x.m === r.m && x.d === r.d; })[0];
    if (b) return { id: 'b-' + b.id, type: 'يوم ميلاد ' + b.name, text: fill(FAMILY.birthday[msgKind(b)], b), src: '— ' + sign(b), fam: true };
    var a = fam().anniversary, sp = spouse();
    if (a && sp && a.m === r.m && a.d === r.d) {
      return { id: 'anniv', type: 'ذكرى زواجنا', text: fill(FAMILY.anniversary[fam().parent === 'mother' ? 'mother' : 'father'], sp), src: '— ' + sign(sp), fam: true };
    }
    return null;
  }
  function showReminder(t) {
    var r = P.ymd(t), sp = special(r), n = Math.floor(t / (3 * MIN));
    var key = sp ? sp.id : String(n);
    if (key === lastQ) return;
    var first = lastQ === '';
    lastQ = key;
    var q = sp || (n % 2 ? famMessage(Math.floor(n / 2)) : reminder(Math.floor(n / 2))), box = $('quote-box');
    function put() {
      $('quote-type').textContent = q.type;
      $('quote').textContent = q.quran ? '﴿' + q.text + '﴾' : q.text;
      $('quote').className = 'q-text' + (q.quran ? ' quran' : '') + (q.fam ? ' fam' : '');
      $('quote').style.fontSize = q.text.length > 110 ? (q.quran ? '32px' : '26px') : q.text.length > 60 ? (q.quran ? '36px' : '30px') : '';
      $('quote-src').textContent = q.src;
      box.classList.toggle('special', !!sp);
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
    var ym = P.addDays(r.y, r.m, r.d, -1), yest = dayOf(ym.y, ym.m, ym.d);
    var key = r.y + '-' + r.m + '-' + r.d;
    if (key !== lastDay) { lastDay = key; renderDay(t, r, today); sendSchedule(); renderEvents(r); }
    // dark from two hours after Isha until Fajr
    var n = t >= today.at.isha + 2 * HR || t < today.at.fajr;
    if (n !== night) { night = n; stage.classList.toggle('night', n); stage.classList.toggle('day', !n); }
    $('clock').textContent = P.full(t);
    showReminder(t);
    if (screen === 'home') renderHome(t, today, tom, yest);
    if (screen === 'kahf') $('kahf-clock').textContent = P.full(t);
    checkAlert(t, today);
    checkIqamah(t, today);
  }

  // ---------- occasion countdowns (days left): own dates + Ramadan and the two Eids (Umm al-Qura) ----------
  var AUTO = [{ id: 'ramadan', name: 'دخول رمضان', m: 9, d: 1 }, { id: 'fitr', name: 'عيد الفطر', m: 10, d: 1 }, { id: 'adha', name: 'عيد الأضحى', m: 12, d: 10 }];
  var fHMD = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: 'Asia/Riyadh', month: 'numeric', day: 'numeric' });
  var autoCache = { key: '', list: [] };
  function autoEvents(r) {
    var key = r.y + '-' + r.m + '-' + r.d;
    if (autoCache.key === key) return autoCache.list;
    var found = {}, list = [];
    for (var i = 0; i < 400 && list.length < AUTO.length; i++) {
      var dd = P.addDays(r.y, r.m, r.d, i), h = {};
      fHMD.formatToParts(new Date(P.noonOf(dd.y, dd.m, dd.d))).forEach(function (x) { h[x.type] = +x.value; });
      AUTO.forEach(function (a) {
        if (!found[a.id] && h.month === a.m && h.day === a.d) { found[a.id] = 1; list.push({ auto: a.id, name: a.name, y: dd.y, m: dd.m, d: dd.d }); }
      });
    }
    // birthdays and the wedding anniversary, every year
    fam().members.map(function (x) { return { auto: 'b-' + x.id, name: 'ميلاد ' + x.name, m: x.m, d: x.d }; })
      .concat(fam().anniversary ? [{ auto: 'anniv', name: 'ذكرى الزواج', m: fam().anniversary.m, d: fam().anniversary.d }] : [])
      .forEach(function (x) {
        var y = r.y;
        if (daysTo({ y: y, m: x.m, d: x.d }, r) < 0) y++;
        list.push({ auto: x.auto, name: x.name, y: y, m: x.m, d: x.d });
      });
    autoCache = { key: key, list: list };
    return list;
  }
  function daysTo(e, r) { return Math.round((Date.UTC(e.y, e.m - 1, e.d) - Date.UTC(r.y, r.m - 1, r.d)) / 86400000); }
  function daysWord(n) { return n >= 3 && n <= 10 ? 'أيام' : 'يوم'; }
  function dmy(e) { return e.d + '/' + e.m + '/' + e.y; }
  function allEvents(r) {
    var own = S.events.filter(function (e) { return daysTo(e, r) >= 0; });
    var auto = autoEvents(r).filter(function (e) { return S.autoEv[e.auto] !== false; });
    return own.concat(auto).map(function (e) { return Object.assign({ left: daysTo(e, r) }, e); })
      .sort(function (a, b) { return a.left - b.left; });
  }
  function renderEvents(r) {
    var before = S.events.length;
    S.events = S.events.filter(function (e) { return daysTo(e, r) >= 0; }); // past dates disappear
    if (S.events.length !== before) save();
    $('events').innerHTML = allEvents(r).slice(0, 3).map(function (e) {
      return '<div class="ev"><span class="ev-n">' + (e.left === 0 ? 'اليوم' : e.left) + '</span><div class="ev-t"><b>' + esc(e.name) +
        '</b><span>' + (e.left === 0 ? '' : daysWord(e.left) + ' · ') + dmy(e) + '</span></div></div>';
    }).join('');
  }
  var evDraft = (function () { var r = P.ymd(Date.now()), x = P.addDays(r.y, r.m, r.d, 30); return { y: x.y, m: x.m, d: x.d }; })();

  // ---------- full-screen countdowns: adhan → iqamah, and in Ramadan the last 15 minutes before Maghrib ----------
  var iqDismissed = {}, iqAt = 0, iqPrevFocus = null;
  function iqOpen() { return !$('iqamah').classList.contains('hidden'); }
  function checkIqamah(t, T) {
    var on = null, key, label, target, detail;
    FIVE.forEach(function (k) { if (S.alerts[k] && T.iqamah[k] && t >= T.at[k] && t < T.iqamah[k]) on = k; });
    if (on) {
      key = 'iq' + T.at[on];
      label = 'متبقٍ على إقامة صلاة ' + P.name(on, T.friday);
      target = T.iqamah[on];
      detail = 'الأذان ' + P.full(T.at[on]) + ' · الإقامة ' + P.full(T.iqamah[on]);
    } else if (T.ramadan && t >= T.at.maghrib - 15 * MIN && t < T.at.maghrib) {
      key = 'if' + T.at.maghrib;
      label = 'متبقٍ على أذان المغرب · الإفطار';
      target = T.at.maghrib;
      detail = 'أذان المغرب ' + P.full(T.at.maghrib) + ' · اللهم تقبّل صيامنا';
    }
    if (key && !iqDismissed[key]) {
      if (!iqOpen()) {
        iqPrevFocus = document.activeElement;
        $('iqamah').classList.remove('hidden');
        $('iq-close').focus();
      }
      iqAt = key;
      var left = target - t;
      $('iq-label').textContent = label;
      $('iq-cd').textContent = P.left(left);
      $('iq-cd').classList.toggle('soon', left <= 60000);
      $('iq-detail').textContent = detail;
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
    $('k-msg').textContent = 'تعذّر التشغيل، تأكد من اتصال الإنترنت';
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
    $('apps-title').textContent = appsMode === 'pick' ? 'اختر تطبيقًا للاختصارات' : 'كل التطبيقات';
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
    $('set-isha').innerHTML = [['normal', 'العشاء بعد المغرب'], ['ramadan', 'العشاء بعد المغرب في رمضان']].map(function (x) {
      return '<div class="srow"><span class="sname">' + x[1] + '</span>' +
        '<button class="sbtn f" data-k="im-' + x[0] + '" aria-label="ناقص دقيقة">−</button>' +
        '<span class="soff">' + S.ishaMin[x[0]] + '</span>' +
        '<button class="sbtn f" data-k="ip-' + x[0] + '" aria-label="زائد دقيقة">+</button>' +
        '<span class="sbtn al muted" style="border:none;background:none">دقيقة</span></div>';
    }).join('');
    $('set-fam').innerHTML = S.famMsgs.map(function (m, i) {
      return '<div class="srow"><span class="sname">' + member(m.to).name + ': <span class="muted">' + esc(m.text) + '</span></span>' +
        '<button class="sbtn al f" data-k="fx-' + i + '">حذف</button></div>';
    }).join('');
    var F = fam();
    function steps(pre, o, fields) {
      return fields.map(function (f) {
        return '<span>' + f[1] + ' <button class="sbtn f" data-k="' + pre + '-' + f[0] + 'm" aria-label="ناقص">−</button><b>' + o[f[0]] +
          '</b><button class="sbtn f" data-k="' + pre + '-' + f[0] + 'p" aria-label="زائد">+</button></span>';
      }).join('');
    }
    $('set-family').innerHTML =
      '<div class="srow"><span class="sname">كاتب الرسائل</span><button class="sbtn al f on" data-k="fpar">' + (F.parent === 'mother' ? 'الأم' : 'الأب') + '</button></div>' +
      F.members.map(function (x, i) {
        return '<div class="srow"><span class="sname">' + esc(x.name) + ' <span class="muted">· ' + FAMILY.KINDS[x.kind] + ' · ' + x.d + '/' + x.m + (x.y ? '/' + x.y : '') + '</span></span>' +
          '<button class="sbtn al f" data-k="fmx-' + i + '">حذف</button></div>';
      }).join('') +
      '<div class="srow"><span class="sname">ذكرى الزواج</span>' +
      (F.anniversary ? '<span class="ev-date">' + steps('fan', F.anniversary, [['d', 'اليوم'], ['m', 'الشهر']]) + '</span>' : '') +
      '<button class="sbtn f' + (F.anniversary ? ' on' : '') + '" data-k="fan-on">' + (F.anniversary ? 'تظهر' : 'لا') + '</button></div>';
    $('fm-kind').textContent = 'الصلة: ' + FAMILY.KINDS[fmDraft.kind];
    $('fm-date').innerHTML = steps('fmd', fmDraft, [['d', 'اليوم'], ['m', 'الشهر'], ['y', 'السنة']]);
    if (famOrder().indexOf(famTo) < 0) famTo = famOrder()[0];
    $('fam-to').textContent = 'إلى: ' + member(famTo).name;
    $('set-events').innerHTML = autoEvents(r).map(function (e) {
      var on = S.autoEv[e.auto] !== false, n = daysTo(e, r);
      return '<div class="srow"><span class="sname">' + e.name + ' <span class="muted">· ' + dmy(e) + ' · ' + n + ' ' + daysWord(n) + '</span></span>' +
        '<button class="sbtn al f' + (on ? ' on' : '') + '" data-k="eva-' + e.auto + '">' + (on ? 'يظهر' : 'مخفي') + '</button></div>';
    }).join('') + S.events.map(function (e, i) {
      var n = daysTo(e, r);
      return '<div class="srow"><span class="sname">' + esc(e.name) + ' <span class="muted">· ' + dmy(e) + ' · ' + n + ' ' + daysWord(n) + '</span></span>' +
        '<button class="sbtn al f" data-k="evx-' + i + '">حذف</button></div>';
    }).join('');
    $('ev-date').innerHTML = [['d', 'اليوم'], ['m', 'الشهر'], ['y', 'السنة']].map(function (f) {
      return '<span>' + f[1] + ' <button class="sbtn f" data-k="evd-' + f[0] + 'm" aria-label="ناقص">−</button><b>' + evDraft[f[0]] +
        '</b><button class="sbtn f" data-k="evd-' + f[0] + 'p" aria-label="زائد">+</button></span>';
    }).join('');
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
    else if (a === 'eva') S.autoEv[v] = S.autoEv[v] === false;
    else if (a === 'fx') S.famMsgs.splice(+v, 1);
    else if (a === 'fpar' || a === 'fmx' || a === 'fan') {
      // the first change copies the default family into the settings
      if (!S.family) S.family = JSON.parse(JSON.stringify(FAMILY.DEFAULT));
      var F = S.family;
      if (a === 'fpar') F.parent = F.parent === 'mother' ? 'father' : 'mother';
      if (a === 'fmx') {
        var gone = F.members.splice(+v, 1)[0];
        S.famMsgs = S.famMsgs.filter(function (m) { return m.to !== gone.id; });
      }
      if (a === 'fan' && v === 'on') F.anniversary = F.anniversary ? null : { m: 1, d: 1 };
      else if (a === 'fan') {
        if (v[0] === 'd') F.anniversary.d = (F.anniversary.d + 30 + (v[1] === 'p' ? 1 : -1)) % 31 + 1;
        if (v[0] === 'm') F.anniversary.m = (F.anniversary.m + 11 + (v[1] === 'p' ? 1 : -1)) % 12 + 1;
      }
      autoCache.key = ''; lastQ = '';
    } else if (a === 'fmd') {
      var st = v[1] === 'p' ? 1 : -1;
      if (v[0] === 'd') fmDraft.d = (fmDraft.d + 30 + st) % 31 + 1;
      if (v[0] === 'm') fmDraft.m = (fmDraft.m + 11 + st) % 12 + 1;
      if (v[0] === 'y') fmDraft.y = Math.max(1930, Math.min(P.ymd(Date.now()).y, fmDraft.y + st));
    }
    else if (a === 'im' || a === 'ip') {
      S.ishaMin[v] = Math.max(60, Math.min(180, S.ishaMin[v] + (a === 'ip' ? 1 : -1)));
      P.setIsha(S.ishaMin);
    }
    else if (a === 'evx') S.events.splice(+v, 1);
    else if (a === 'evd') {
      var f = v[0], step = v[1] === 'p' ? 1 : -1, r0 = P.ymd(Date.now());
      if (f === 'd') evDraft.d += step;
      if (f === 'm') evDraft.m = (evDraft.m + 11 + step) % 12 + 1;
      if (f === 'y') evDraft.y = Math.max(r0.y, Math.min(r0.y + 10, evDraft.y + step));
      var dim = new Date(Date.UTC(evDraft.y, evDraft.m, 0)).getUTCDate();
      if (evDraft.d < 1) evDraft.d = dim;
      if (evDraft.d > dim) evDraft.d = f === 'd' ? 1 : dim;
    }
    save();
    if (a === 'eva' || a === 'evx' || a === 'fmx' || a === 'fan') renderEvents(P.ymd(Date.now()));
    if (a === 'm' || a === 'p' || a === 'a' || a === 'im' || a === 'ip') { sendSchedule(); lastDay = ''; }
    setRender();
    if (!document.activeElement || document.activeElement === document.body) {
      var f = document.querySelector('#settings .f'); if (f) f.focus();
    }
  }

  var famTo = '';
  var KIND_ORDER = ['son', 'daughter', 'wife', 'husband'];
  var fmDraft = { kind: 'son', y: 2015, m: 1, d: 1 };
  function addMember() {
    var name = $('fm-name').value.trim();
    if (!name) { $('fm-name').focus(); return; }
    if (!S.family) S.family = JSON.parse(JSON.stringify(FAMILY.DEFAULT));
    S.family.members.push({ id: 'm' + Date.now(), name: name, kind: fmDraft.kind, y: fmDraft.y, m: fmDraft.m, d: fmDraft.d });
    save();
    $('fm-name').value = '';
    autoCache.key = ''; lastQ = '';
    renderEvents(P.ymd(Date.now()));
    setRender();
  }
  function addFamMsg() {
    var text = $('fam-text').value.trim();
    if (!text) { $('fam-text').focus(); return; }
    S.famMsgs.push({ to: famTo, text: text });
    save();
    $('fam-text').value = '';
    setRender();
  }
  function addEvent() {
    var name = $('ev-name').value.trim(), r = P.ymd(Date.now());
    if (!name) { $('ev-name').focus(); return; }
    if (daysTo(evDraft, r) < 0) return;
    S.events.push({ name: name, y: evDraft.y, m: evDraft.m, d: evDraft.d });
    save();
    $('ev-name').value = '';
    renderEvents(r);
    setRender();
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
    if (name === 'weather') { weatherRender(); focusFirst(document.querySelector('#weather .f')); return; }
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
    // typing in a text box: keep the keys for the text, only up/down move between items
    var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (typing && k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'Escape' && k !== 'GoBack') return;
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
      case 'ev-add': addEvent(); break;
      case 'fam-to': famTo = famOrder()[(famOrder().indexOf(famTo) + 1) % famOrder().length]; setRender(); $('fam-to').focus(); break;
      case 'fam-add': addFamMsg(); break;
      case 'fm-kind': fmDraft.kind = KIND_ORDER[(KIND_ORDER.indexOf(fmDraft.kind) + 1) % KIND_ORDER.length]; setRender(); $('fm-kind').focus(); break;
      case 'fm-add': addMember(); break;
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
