(function () {
  var P = window.Prayer, MIN = P.MIN, HR = P.HR, ORDER = P.ORDER;
  var FIVE = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  var A = window.Android || null; // the Android app; absent when the page is opened in a browser
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage');
  // dates in the chosen city's time zone (made again when the city changes)
  var fGFull, fHFull, fHDay, fHMY, fGMY, fHMD;
  function makeFormats() {
    var TZO = { timeZone: P.zone() };
    fGFull = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', Object.assign({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, TZO));
    fHFull = hijriShift(new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', Object.assign({ day: 'numeric', month: 'long', year: 'numeric' }, TZO)));
    fHDay = hijriShift(new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', Object.assign({ day: 'numeric', month: 'short' }, TZO)));
    fHMY = hijriShift(new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', Object.assign({ month: 'long', year: 'numeric' }, TZO)));
    fGMY = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', Object.assign({ month: 'long', year: 'numeric' }, TZO));
    fHMD = hijriShift(new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', Object.assign({ year: 'numeric', month: 'numeric', day: 'numeric' }, TZO)));
  }
  // Hijri dates follow the ±days adjustment of the settings
  function hijriShift(f) {
    function d(x) { return new Date(+x + S.hijriAdj * 86400000); }
    return { format: function (x) { return f.format(d(x)); }, formatToParts: function (x) { return f.formatToParts(d(x)); } };
  }

  // ---------- settings (kept on the TV) ----------
  var KEY = 'prayertv-settings';
  var S = (function () {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
    return {
      offsets: Object.assign({ fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }, s.offsets),
      // sunrise: a silent note on the phone; friday: an hour before Jumu'ah; weather: dust, rain, heat, cold (phone)
      alerts: Object.assign({ fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true, sunrise: true, friday: true, weather: true, kaaba: true }, s.alerts),
      shortcuts: s.shortcuts || null,
      openOnBoot: s.openOnBoot !== false,
      events: s.events || [], // own occasions: {name, y, m, d} (Gregorian)
      autoEv: Object.assign({ ramadan: true, fitr: true, adha: true }, s.autoEv),
      ishaMin: Object.assign({ normal: 90, ramadan: 120 }, s.ishaMin),
      // minutes from adhan to iqamah (Ministry circular: 10, Fajr 20; in Ramadan Fajr and Isha 10)
      iqMin: {
        normal: Object.assign({ fajr: 20, dhuhr: 10, asr: 10, maghrib: 10, isha: 10 }, s.iqMin && s.iqMin.normal),
        ramadan: Object.assign({ fajr: 10, dhuhr: 10, asr: 10, maghrib: 10, isha: 10 }, s.iqMin && s.iqMin.ramadan)
      },
      famMsgs: s.famMsgs || [], // own family messages: {to, text}
      family: s.family || null, // null: the default family (family.js)
      showFact: s.showFact !== false,
      keepOn: !!s.keepOn,
      hijriAdj: s.hijriAdj || 0, // days added to the Umm al-Qura Hijri date (−2 … +2)
      fontSize: s.fontSize || 'normal', // phone text size
      zoom: s.zoom || 0, // phone: the size set by pinching (0 = from fontSize)
      // the timer widgets: text size and the lines they show
      timerWg: Object.assign({ font: 'm', name: true, hijri: false, anniv: true, ms: false, dua: true }, s.timerWg),
      reciter: s.reciter || 'alafasy',
      gpsAsked: !!s.gpsAsked, // the phone's location permission was asked once
      // timers since / until a date: {id, name, y, m, d, h, mi (-1 = no time), unit, color, showDate}
      timers: (s.timers && s.timers.map(function (x) { return x.rip === undefined ? Object.assign({ rip: x.id === 't1' ? 'm' : '' }, x) : x; })) || [
        { id: 't1', name: 'وفاة الوالد أبي أسامة', y: 2023, m: 4, d: 18, h: -1, mi: 0, unit: 'months', color: 'white', showDate: false, rip: 'm' },
        { id: 't2', name: 'أمية', y: 1984, m: 3, d: 6, h: 12, mi: 0, unit: 'timer', color: 'navy', showDate: true },
        { id: 't3', name: 'الزواج', y: 2010, m: 6, d: 11, h: -1, mi: 0, unit: 'timer', color: 'white', showDate: true },
        { id: 't4', name: 'العودة للدوام', y: 2027, m: 8, d: 20, h: -1, mi: 0, unit: 'days', color: 'white', showDate: false },
        { id: 't5', name: 'رند', y: 1988, m: 5, d: 11, h: -1, mi: 0, unit: 'timer', color: 'pink', showDate: true },
        { id: 't6', name: 'حسان', y: 2011, m: 7, d: 26, h: 13, mi: 0, unit: 'timer', color: 'navy', showDate: true },
        { id: 't7', name: 'سلمى', y: 2014, m: 3, d: 20, h: 14, mi: 0, unit: 'timer', color: 'pink', showDate: true },
        { id: 't8', name: 'عبود', y: 2016, m: 2, d: 2, h: 11, mi: 0, unit: 'minutes', color: 'navy', showDate: true },
        { id: 't9', name: 'إجازة الصيف', y: 2027, m: 5, d: 18, h: 14, mi: 0, unit: 'timer', color: 'white', showDate: true }
      ],
      // phone home-screen widgets: background ('time' colour of the time of day · 'dark'), transparency 0–100,
      // text size, accent colour and the parts shown on «مواقيت اليوم»
      widget: Object.assign({ bg: 'time', clear: 0, font: 'm', accent: 'gold', city: true, prog: true, line: true, date: true }, s.widget),
      wstyle: s.wstyle || null, // each widget's own look: {prayer, ring, strip, month, convert}
      nightDim: s.nightDim !== false, // the TV dims at night
      evCard: s.evCard || {}, // occasion → its card letter ('a' 'b' 'c'; '' = its own card); unset = the default
      // the city of the prayer times: 'auto' (found from the internet connection) or chosen by search
      loc: s.loc || { mode: 'city', name: 'الرياض', country: 'السعودية', lat: 24.7136, lon: 46.6753, tz: 'Asia/Riyadh', cc: 'SA' },
      qLast: s.qLast || null, // the last verse heard: {s: surah, i: verse}
      // alert sound: 'tone' (soft tone), 'adhan' (full, Masjid an-Nabawi), 'short' (the opening takbir), 'none'
      theme: s.theme || 'auto', // 'auto' (dark at night) · 'light' · 'dark'
      // each prayer its own sound (older settings had one for all and one for Fajr)
      sound: (function (o) {
        o = o || {}; var n = o.normal || 'tone';
        return { fajr: o.fajr || 'none', dhuhr: o.dhuhr || n, asr: o.asr || n, maghrib: o.maghrib || n, isha: o.isha || n };
      })(s.sound)
    };
  })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} syncSoon(); }
  if (!S.wstyle) { S.wstyle = {}; ['prayer', 'ring', 'strip', 'month', 'convert'].forEach(function (k) { S.wstyle[k] = Object.assign({}, S.widget); }); }
  // a family saved before these were added (the default family): add the writer, interests and the departed
  (function () {
    var F = S.family, D = FAMILY.DEFAULT;
    if (!F || F.v2) return;
    if (F.members.some(function (x) { return x.id === 'rund'; })) {
      D.members.forEach(function (d) {
        var x = F.members.filter(function (m) { return m.id === d.id; })[0];
        if (!x && d.kind === 'self') F.members.push(JSON.parse(JSON.stringify(d)));
        if (x && d.likes) x.likes = d.likes;
      });
      if (!F.departed) F.departed = JSON.parse(JSON.stringify(D.departed));
    }
    F.v2 = true;
    save();
  })();
  P.setLocation(S.loc);
  P.setHijriAdj(S.hijriAdj);
  makeFormats();
  P.setIsha(S.ishaMin);
  P.setIqamah(S.iqMin);

  // ---------- fit the 1920×1080 design to the screen ----------
  // TV: remote control, app shortcuts, alert over other apps. Phone: touch, notification.
  var TV = A ? A.isTv() : !(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  stage.classList.add(TV ? 'tv' : 'phone');
  // shown as the TV screensaver: the main screen only, nothing to press
  var DREAM = location.search.indexOf('dream') >= 0;
  if (DREAM) stage.classList.add('dream');

  // ---------- fit any screen: landscape is 1080 units high, portrait 1080 units wide ----------
  var FONT_SCALE = { small: .9, normal: 1, large: 1.15, xlarge: 1.3 };
  function zoomOf() { return S.zoom || FONT_SCALE[S.fontSize] || 1; }
  function fit() {
    var w = innerWidth, h = innerHeight, portrait = h > w * 1.05, W, H, k;
    // phone: the font-size setting makes the page narrower in design units, so everything is bigger
    if (portrait) { W = Math.round(1080 / zoomOf()); k = w / W; H = h / k; }
    else {
      H = 1080; k = h / H; W = w / k;
      if (W < 1920) { W = 1920; k = w / W; H = Math.max(1080, h / k); } // squarer screens (4:3, 16:10): taller, same width
    }
    stage.classList.toggle('portrait', portrait);
    var fact = $('fact'), want = portrait ? $('home') : document.querySelector('#home .next');
    if (fact && want && fact.parentNode !== want) {
      if (portrait) $('home').insertBefore(fact, $('city2').nextSibling); else want.appendChild(fact);
    }
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
  // the first city follows the prayer-times city; Irbid stays
  var CITIES = [{ name: S.loc.name, lat: S.loc.lat, lon: S.loc.lon }, { name: 'إربد', lat: 32.5556, lon: 35.85 }];
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
  var WX = [null, null], DUST = [0, 0], wxAt = 0;
  // alerts inside the weather card: dust in the air now (µg/m³) and extreme heat
  function wAlert(i, w) {
    if (DUST[i] >= 1000) return 'عاصفة غبارية';
    if (DUST[i] >= 400) return 'غبار';
    if (Math.max(w.t, w.hi || 0) >= 45) return 'حرارة شديدة';
    return '';
  }
  // a smooth colour scale: blue (cold) → teal → green (mild) → amber → orange → red (40° and above)
  var T_STOPS = [[5, [59, 130, 246]], [15, [27, 160, 180]], [24, [52, 168, 90]], [30, [218, 160, 28]], [36, [232, 110, 40]], [41, [214, 48, 48]]];
  function tempColor(t) {
    if (t <= T_STOPS[0][0]) return 'rgb(' + T_STOPS[0][1] + ')';
    for (var k = 1; k < T_STOPS.length; k++) {
      var a = T_STOPS[k - 1], b = T_STOPS[k];
      if (t <= b[0]) {
        var f = (t - a[0]) / (b[0] - a[0]);
        return 'rgb(' + a[1].map(function (v, j) { return Math.round(v + (b[1][j] - v) * f); }) + ')';
      }
    }
    return 'rgb(' + T_STOPS[T_STOPS.length - 1][1] + ')';
  }
  // the big temperature: its colour follows the heat, softened toward the text colour so it stays calm
  function tempPaint() {
    if (!WX[0]) return;
    var c = tempColor(WX[0].t).match(/\d+/g).map(Number), ink = night ? [244, 239, 230] : [42, 36, 24], f = .35;
    $('wbig-temp').style.color = 'rgb(' + c.map(function (v, j) { return Math.round(v + (ink[j] - v) * f); }) + ')';
  }
  function showWeather(i, w) {
    WX[i] = w;
    $('w' + i + '-icon').innerHTML = wIcon(w.code, w.day);
    $('w' + i + '-temp').textContent = w.t + '°';
    // the city's temperature in large figures on the top bar, coloured by how hot it is
    var al = wAlert(i, w);
    if (i === 0) {
      $('wbig-icon').innerHTML = wIcon(w.code, w.day); $('wbig-temp').textContent = w.t + '°'; tempPaint();
      $('wb-c0').innerHTML = '<b>' + esc(CITIES[0].name) + '</b>' + (w.hi != null ? ' <span class="muted"><span class="ltr">' + w.hi + '° / ' + w.lo + '°</span></span>' : '') +
        (w.hum != null ? '<span class="muted">· رطوبة <span class="ltr">' + w.hum + '%</span></span>' : '') +
        (al ? '<span class="w-al">⚠ ' + al + '</span>' : '');
      $('wbig').classList.toggle('w-alert', !!al);
    } else $('wb-c1').innerHTML = wIcon(w.code, w.day) + '<b>' + CITIES[1].name + '</b> <span class="ltr">' + w.t + '°</span>' +
      (w.hum != null ? '<span class="muted">· رطوبة <span class="ltr">' + w.hum + '%</span></span>' : '') + (al ? '<span class="w-al">⚠ ' + al + '</span>' : '');
    $('w' + i + '-btn').classList.toggle('w-alert', !!al);
    $('w' + i + '-hl').innerHTML = (al ? '<span class="w-al">⚠ ' + al + '</span>' : '') + (w.hi != null ? hiLo(w) : '') +
      (w.hum != null ? stat('hum', w.hum + '%') + stat('umb', w.rain + '%') : '');
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
    wxAt = Date.now();
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
      // dust in the air now (Open-Meteo air quality, µg/m³)
      fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + c.lat + '&longitude=' + c.lon + '&current=dust')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          DUST[i] = (j.current && j.current.dust) || 0;
          if (WX[i]) showWeather(i, WX[i]);
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
      if (w && Date.now() - w.at < 2 * HR) showWeather(i, w);
    } catch (e) {}
  });

  // ---------- prayer alerts sent to Android (30 days ahead) ----------
  // Arabic number–noun agreement
  function minutesWord(n) { return n === 1 ? 'دقيقة واحدة' : n === 2 ? 'دقيقتين' : n >= 3 && n <= 10 ? n + ' دقائق' : n + ' دقيقة'; }
  function countWord(n, one, two, few, many) { return n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? n + ' ' + few : n + ' ' + many; }
  function alertTitle(k, T) { return k === 'dhuhr' && T.friday ? 'حان الآن وقت صلاة الجمعة' : 'حان الآن وقت صلاة ' + P.name(k); }
  function alertSub(k, T) {
    var s = (k === 'maghrib' && T.ramadan ? 'موعد الإفطار · ' : '') + 'الأذان ' + P.full(T.at[k]);
    if (T.iqamah[k]) s += ' · الإقامة ' + P.full(T.iqamah[k]) + ' (بعد ' + minutesWord(Math.round((T.iqamah[k] - T.at[k]) / MIN)) + ')';
    return s;
  }
  // the phone's notification, like «صلاتك»: «الفجر (04:38)» over «الرياض | وقت صلاة الفجر · الإقامة 04:58»
  function phoneTitle(k, T) { return (k === 'dhuhr' && T.friday ? 'الجمعة' : P.name(k)) + ' (' + P.full(T.at[k]) + ')'; }
  function phoneSub(k, T) {
    var what = k === 'sunrise' ? 'وقت الشروق' : k === 'dhuhr' && T.friday ? 'وقت صلاة الجمعة' : 'وقت صلاة ' + P.name(k);
    return S.loc.name + ' | ' + what + (k === 'maghrib' && T.ramadan ? ' · موعد الإفطار' : '') + (T.iqamah[k] ? ' · الإقامة ' + P.full(T.iqamah[k]) : '');
  }
  function sendSchedule() {
    if (!A) return;
    var t = Date.now(), r = P.ymd(t), ev = [];
    for (var i = 0; i < 60; i++) {
      var dd = P.addDays(r.y, r.m, r.d, i), T = P.dayTimes(dd.y, dd.m, dd.d, S.offsets);
      FIVE.forEach(function (k) {
        if (S.alerts[k] && T.at[k] > t) ev.push(TV ? { at: T.at[k], title: alertTitle(k, T), sub: alertSub(k, T), snd: S.sound[k] } :
          { at: T.at[k], title: phoneTitle(k, T), sub: phoneSub(k, T), snd: S.sound[k] });
      });
      // the phone: a silent note at sunrise (the end of Fajr's time)
      if (!TV && S.alerts.sunrise && T.at.sunrise > t) ev.push({ at: T.at.sunrise, title: phoneTitle('sunrise', T), sub: phoneSub('sunrise', T), snd: 'none' });
      // the phone: an hour before Jumu'ah
      if (!TV && S.alerts.friday && T.friday && T.at.dhuhr - HR > t) ev.push({ at: T.at.dhuhr - HR, title: 'بعد ساعة: صلاة الجمعة ' + P.full(T.at.dhuhr),
        sub: 'اغتسل وبكّر، واقرأ سورة الكهف، وأكثر من الصلاة على النبي ﷺ', snd: 'tone' });
    }
    if (S.alerts.kaaba) [r.y, r.y + 1].forEach(function (y) {
      P.kaabaSun(y).forEach(function (at) {
        var sub = 'استقبل الشمس واجعل ظلّك خلفك: هذا اتجاه القبلة بالضبط';
        if (at - 5 * MIN > t) ev.push({ at: at - 5 * MIN, title: 'بعد 5 دقائق (' + P.full(at) + ') تتعامد الشمس على الكعبة', sub: sub, snd: 'tone' });
        if (at > t) ev.push({ at: at, title: 'الآن تتعامد الشمس على الكعبة', sub: sub, snd: 'tone' });
      });
    });
    ev.sort(function (a, b) { return a.at - b.at; });
    try { A.schedule(JSON.stringify(ev)); } catch (e) {}
    // the phone checks the weather of both cities in the background and notifies of dust, rain, heat or cold
    try { if (!TV && A.weatherWatch) A.weatherWatch(JSON.stringify(S.alerts.weather ? CITIES : [])); } catch (e) {}
    sendWidget();
  }

  // home-screen widgets (phone): times of the coming days and the nearest occasions
  function sendWidget() {
    if (!A || !A.widgetData) return;
    // from yesterday (the time passed since its Isha); each day with its dates, moon and a short supplication
    var r = P.ymd(Date.now()), days = [];
    // one line on the widget: only the short supplications (with their source)
    var short = ADHKAR.dua.filter(function (x) { return ((x.q ? quranText(x.q) : '«' + x.x + '»') + x.s).replace(/[\u064B-\u0652\u0670\u06D6-\u06ED]/g, '').length <= 54; });
    for (var i = -1; i < 10; i++) {
      var dd = P.addDays(r.y, r.m, r.d, i), T = P.dayTimes(dd.y, dd.m, dd.d, S.offsets), noon = new Date(P.noonOf(dd.y, dd.m, dd.d)), h = {};
      fHMD.formatToParts(noon).forEach(function (x) { h[x.type] = +x.value; });
      var du = short[Math.floor(+noon / 86400000) % short.length];
      days.push({
        names: ORDER.map(function (k) { return P.name(k, T.friday); }), at: ORDER.map(function (k) { return T.at[k]; }),
        // the Hijri month's number beside its name: «16 جمادى الأولى (5) 1448 هـ»
        ram: !!T.ramadan, hijri: h.day + ' ' + H_MONTHS[h.month - 1] + ' (' + h.month + ') ' + h.year + ' هـ', hday: h.day, greg: fGFull.format(noon).replace('،', ''),
        dua: (du.q ? quranText(du.q) : '«' + du.x + '»') + ' · ' + du.s
      });
    }
    var events = allEvents(r).slice(0, 30).map(function (e) { return { name: e.name, at: P.noonOf(e.y, e.m, e.d), date: fd(e.d, e.m, e.y) }; });
    var months = [];
    try { months = widgetMonths(r); } catch (e) {}
    try { A.widgetData(JSON.stringify({ days: days, events: events, tz: P.zone(), city: S.loc.name, style: S.widget, styles: S.wstyle, months: months,
      timerWg: { font: S.timerWg.font, name: S.timerWg.name },
      timers: S.timers.map(function (x) {
        var W = S.timerWg;
        return { id: x.id, name: x.name, at: tAt(x), unit: x.unit, color: T_COLORS[x.color] || '#1E2A78', ink: tInk(x.color),
          date: x.showDate ? fd(x.d, x.m, x.y) + (x.h >= 0 ? ' · ' + pad2(x.h) + ':' + pad2(x.mi) : '') : '',
          dua: W.dua && x.rip ? '«' + RIP[x.rip][0] + '» ' + RIP[x.rip][1] : '' };
      }) })); } catch (e) {}
  }

  // the Hijri month widget: this Hijri month and the next two, each day with its Gregorian date, season,
  // white day, Monday / Thursday and occasion
  function hOf(y, m, d) {
    var h = {};
    fHMD.formatToParts(new Date(P.noonOf(y, m, d))).forEach(function (x) { h[x.type] = +x.value; });
    return { y: h.year, m: h.month, d: h.day };
  }
  function widgetMonths(r) {
    var evs = {}, out = [];
    allEvents(r).forEach(function (e) { evs[e.y + '-' + e.m + '-' + e.d] = e.name; });
    var h0 = hOf(r.y, r.m, r.d), dd = P.addDays(r.y, r.m, r.d, 1 - h0.d);
    for (var n = 0; n < 3; n++) {
      var hm = hOf(dd.y, dd.m, dd.d), x = dd, last = dd, cells = [], seasons = [], seen = {}, white = false, events = false;
      for (var i = 0; i < 31; i++) {
        var hx = hOf(x.y, x.m, x.d);
        if (hx.m !== hm.m) break;
        var ts = P.noonOf(x.y, x.m, x.d), sn = seasonOfDay(ts), dow = new Date(Date.UTC(x.y, x.m - 1, x.d)).getUTCDay();
        var k = sn ? sn[0] : hx.d >= 13 && hx.d <= 15 ? 'white' : '', ev = evs[x.y + '-' + x.m + '-' + x.d] || '';
        if (sn && !seen[sn[1]]) { seen[sn[1]] = 1; seasons.push(sn); }
        if (k === 'white') white = true;
        if (ev) events = true;
        cells.push({ h: hx.d, g: x.d, ts: ts, k: k, mt: !sn && (dow === 1 || dow === 4), ev: ev });
        last = x;
        x = P.addDays(x.y, x.m, x.d, 1);
      }
      var sub = dd.m === last.m ? G_MONTHS[dd.m - 1] + ' ' + dd.y : dd.y === last.y ? G_MONTHS[dd.m - 1] + ' – ' + G_MONTHS[last.m - 1] + ' ' + dd.y :
        G_MONTHS[dd.m - 1] + ' ' + dd.y + ' – ' + G_MONTHS[last.m - 1] + ' ' + last.y;
      out.push({ title: H_MONTHS[hm.m - 1] + ' ' + hm.y + ' هـ', sub: sub, first: new Date(Date.UTC(dd.y, dd.m - 1, dd.d)).getUTCDay(),
        cells: cells, seasons: seasons, white: white, events: events });
      dd = x;
    }
    return out;
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
    c.innerHTML = '<div class="pc-in">' + inner + '</div><div class="pc-bar"></div>';
    $('prayers').appendChild(c);
    cards[k] = c;
  });

  // the next prayer's countdown in words, so it is not read as a clock time: «بعد 9 ساعات» «و16 دقيقة»
  function unitWord(n, one, two, few, many) { return n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? n + ' ' + few : n + ' ' + many; }
  function putWords(el, ms) {
    var sec = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60, main, sub = '';
    var H = function (n) { return unitWord(n, 'ساعة', 'ساعتين', 'ساعات', 'ساعة'); };
    var M = function (n) { return unitWord(n, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'); };
    var X = function (n) { return unitWord(n, 'ثانية', 'ثانيتين', 'ثوانٍ', 'ثانية'); };
    if (h) { main = H(h); if (m) sub = 'و' + M(m); }
    else if (m) { main = M(m); if (x) sub = 'و' + X(x); }
    else main = X(x);
    var html = '<span class="cd-pre">بعد</span><span class="cd-main">' + main + '</span><span class="cd-sub">' + sub + '</span>';
    if (el.dataset.v === html) return;
    el.dataset.v = html;
    el.dir = 'rtl';
    el.classList.add('words');
    el.innerHTML = html;
  }
  // countdowns: each digit in a box of the same width, so the numbers do not shift as they change
  function putDigits(el, text) {
    if (el.dataset.v === text) return;
    el.dataset.v = text;
    el.innerHTML = text.split('').map(function (ch) {
      return /\d/.test(ch) ? '<span class="dg">' + ch + '</span>' : ch === ':' ? '<span class="cl">:</span>' : ch;
    }).join('');
  }
  // «هل تعلم؟»: a new one every 10 minutes (can be hidden in the settings)
  var lastFact = -1;
  // the «هل تعلم؟» box: adhkar at their times; on Friday, in the ten days of Dhul-Hijjah and on Eid
  // the season's texts in turn with «هل تعلم؟»; otherwise «هل تعلم؟» (a new one every 10 minutes)
  var ADHKAR_HEAD = { after: 'أذكار بعد الصلاة', morning: 'أذكار الصباح', evening: 'أذكار المساء', sleep: 'أذكار النوم' };
  function adhkarNow(t, today, yest) {
    var w = null;
    FIVE.forEach(function (k) {
      var base = today.iqamah[k] || today.at[k] + 45 * MIN, st = base + 10 * MIN; // Friday prayer: after the khutbah
      if (t >= st && t < st + 15 * MIN) w = { kind: 'after', start: st };
    });
    if (w) return w;
    var fj = (today.iqamah.fajr || today.at.fajr) + 25 * MIN, as = (today.iqamah.asr || today.at.asr) + 25 * MIN;
    if (t >= fj && t < today.at.sunrise + HR) return { kind: 'morning', start: fj };
    if (t >= as && t < today.at.maghrib) return { kind: 'evening', start: as };
    var sl = [today.at.isha + 2 * HR, yest.at.isha + 2 * HR].filter(function (s) { return t >= s && t < s + HR; })[0];
    return sl ? { kind: 'sleep', start: sl } : null;
  }
  // a Qur'an passage from mushaf.js: [surah] or [surah, first, last]
  function quranText(q) {
    var v = QURAN[q[0] - 1][1], a = q.length > 1 ? q[1] : 1, b = q[2] || (q.length > 1 ? q[1] : v.length), out = [];
    for (var i = a; i <= b; i++) out.push(v[i - 1] + ' ﴿' + arNum(i) + '﴾');
    return out.join(' ');
  }
  var season = {};
  function seasonList() {
    if (season.eid) return ADHKAR.eid;
    if (season.arafah) return ADHKAR.arafah.concat(ADHKAR.hajj);
    if (season.hajj) return ADHKAR.hajj;
    if (season.friday) return fridayMorning ? ADHKAR.fridayMorning.concat(ADHKAR.friday) : ADHKAR.friday;
    return null;
  }
  var lastFact = '', fridayMorning = false;
  function showFact(t, today, yest) {
    var card = document.querySelector('#home .next'), w = adhkarNow(t, today, yest), item, head = 'هل تعلم؟', key;
    card.classList.toggle('no-fact', !S.showFact && !w);
    if (!S.showFact && !w) return;
    if (w) {
      var list = ADHKAR[w.kind], i = Math.floor((t - w.start) / 30000) % list.length;
      item = list[i]; head = ADHKAR_HEAD[w.kind]; key = w.kind + i;
    } else {
      // a new one every 3 minutes; each day starts at a different place so they don't come at the same hours
      var slot = Math.floor(t / (3 * MIN)), sl = seasonList();
      if (sl && slot % 2 === 0) { item = sl[(slot / 2) % sl.length]; head = 'فضل هذه الأيام'; key = 's' + slot; }
      else {
        // stepping 67 places at a time mixes the sections (67 shares no factor with the list length)
        var fi = ((slot + Math.floor(t / 86400000) * 61) * 67) % FACTS.length;
        item = FACTS[fi]; key = 'f' + fi;
        if (item.k === 'myth') head = 'تصحيح خطأ شائع';
      }
    }
    if (key === lastFact) return;
    var first = !lastFact, box = $('fact');
    lastFact = key;
    function put() {
      var x = item.q ? quranText(item.q) : item.x.replace(/\(([^()]+) (\d+)\)/g, '($1 $2)');
      $('fact-h').textContent = head;
      $('fact-t').textContent = item.t || '';
      $('fact-t').classList.toggle('hidden', !item.t);
      $('fact-x').textContent = x;
      $('fact-x').classList.toggle('quran', !!item.q);
      // adhkar are read from afar: as big as the box allows
      var dh = head !== 'هل تعلم؟' && head !== 'تصحيح خطأ شائع' && head !== 'فضل هذه الأيام';
      $('fact').classList.toggle('dhikr', dh);
      var fs = dh ? (x.length > 600 ? 24 : x.length > 420 ? 27 : x.length > 250 ? 31 : x.length > 120 ? 36 : 42) : (x.length > 450 ? 19 : x.length > 250 ? 21 : 0);
      // the phone shows the box full width: bigger text
      $('fact-x').style.fontSize = fs ? Math.round(fs * (stage.classList.contains('portrait') ? 1.5 : 1)) + 'px' : '';
      $('fact-s').textContent = item.s;
      box.classList.remove('fade');
    }
    if (first) put(); else { box.classList.add('fade'); setTimeout(put, 600); }
  }
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

    var label, name, cd, cdMs, detail;
    if (iq) {
      label = 'متبقٍّ على الإقامة';
      name = 'صلاة ' + P.name(iq, today.friday);
      cd = P.left(today.iqamah[iq] - t); cdMs = today.iqamah[iq] - t;
      detail = 'الأذان ' + P.full(today.at[iq]) + ' · الإقامة ' + P.full(today.iqamah[iq]);
    } else if (nextK === 'sunrise') {
      label = 'متبقٍّ على الشروق';
      name = 'الشروق';
      cd = P.left(nextTs - t); cdMs = nextTs - t;
      detail = 'الشروق ' + P.full(nextTs);
    } else {
      label = nd.ramadan && nextK === 'maghrib' ? 'متبقٍّ على الإفطار' : 'الصلاة القادمة';
      name = P.name(nextK, nd.friday);
      cd = P.left(nextTs - t); cdMs = nextTs - t;
      detail = 'الأذان ' + P.full(nextTs) + (nd.iqamah[nextK] ? ' · الإقامة ' + P.full(nd.iqamah[nextK]) : '');
    }
    $('next-label').textContent = label;
    $('next-name').textContent = name;
    putWords($('countdown'), cdMs);
    $('next-detail').textContent = detail;

    // a thin gold bar under the next time fills up from the previous time until it comes
    var seq = [['isha', yest.at.isha], ['imsak', today.imsak]].concat(ORDER.map(function (k) { return [k, today.at[k]]; }), [['imsak', tom.imsak]]);
    var ci = 0;
    for (var i = 0; i < seq.length - 1; i++) if (seq[i][1] <= t) ci = i;
    var p = Math.min(1, Math.max(0, (t - seq[ci][1]) / (seq[ci + 1][1] - seq[ci][1])));

    CARDS.forEach(function (k) {
      var day = tomorrow && (k === 'fajr' || k === 'imsak') ? tom : today;
      var c = cards[k];
      c.className = 'pc' + (k === nextK ? ' next-p' : '') + (k === seq[ci][0] && k !== 'imsak' ? ' pc-now' : '');
      c.querySelector('.pc-bar').style.width = k === seq[ci + 1][0] ? (p * 100).toFixed(2) + '%' : '0';
      setAll(c, '.pc-name', k === 'imsak' ? 'الإمساك' : P.name(k, day.friday));
      setAll(c, '.pc-time', P.full(k === 'imsak' ? day.imsak : day.at[k]));
      // every day until Maghrib the Imsak card shows the time left to Maghrib (the end of the fast)
      // Duha under sunrise; under Isha after its iqamah, the start of the last third of the night (Maghrib → Fajr)
      if (k === 'sunrise') { setAll(c, '.pc-iq', 'الضحى ' + P.full(day.at.sunrise + 15 * MIN)); return; }
      if (k === 'isha' && (t >= (today.iqamah.isha || today.at.isha) || t < today.at.fajr)) {
        var m0 = t < today.at.fajr ? yest.at.maghrib : today.at.maghrib, f0 = t < today.at.fajr ? today.at.fajr : tom.at.fajr;
        setAll(c, '.pc-iq', 'ثلث الليل ' + P.full(m0 + (f0 - m0) * 2 / 3)); return;
      }
      // Imsak: in turn every 5 seconds, the time left to the next Maghrib, the length of the fast (Fajr → Maghrib)
      // and the shortest fast of this Hijri year with its date
      var alt = Math.floor(t / 5000) % 3, fd = t < today.at.maghrib ? today : tom, sh = alt === 2 && shortestFast(P.ymd(t));
      var fastLen = 'مدة الصيام ' + P.leftHM(fd.at.maghrib - fd.at.fajr);
      setAll(c, '.pc-iq', k === 'imsak' ? (sh ? 'أقصر صيام ' + sh.d + ' ' + G_MONTHS[sh.m - 1] + ' · ' + P.leftHM(sh.len) :
        alt === 1 ? fastLen : (fd.ramadan ? 'متبقٍّ للإفطار ' : 'متبقٍّ للمغرب ') + P.leftHM(fd.at.maghrib - t)) :
        day.iqamah[k] ? 'الإقامة ' + P.full(day.iqamah[k]) : (k === 'dhuhr' && day.friday ? 'بعد الخطبة' : ''));
      Array.prototype.forEach.call(c.querySelectorAll('.pc-iq'), function (e) { e.classList.toggle('pc-iq-s', k === 'imsak' && !!sh); });
    });

    // Ramadan: time left to iftar and to suhoor (imsak)
    // Ramadan: one card at a time, never repeating the next-prayer card:
    // time to iftar during the fast (until the next prayer is Maghrib itself), time to suhoor from Isha until Imsak
    var showIftar = today.ramadan && t >= today.at.fajr && t < today.at.maghrib && nextK !== 'maghrib';
    var night = t >= today.at.isha || t < today.imsak;
    var suhDay = t < today.imsak ? today : tom;
    var showSuhoor = night && suhDay.ramadan;
    var showR = showIftar || showSuhoor;
    $('ramadan').classList.toggle('hidden', !showR);
    $('ramadan').parentNode.classList.toggle('has-ramadan', showR);
    $('iftar-card').classList.toggle('hidden', !showIftar);
    $('suhoor-card').classList.toggle('hidden', !showSuhoor);
    if (showIftar) { $('iftar-at').textContent = P.full(today.at.maghrib); putDigits($('iftar-left'), P.leftHM(today.at.maghrib - t)); }
    if (showSuhoor) { $('suhoor-at').textContent = P.full(suhDay.imsak); putDigits($('suhoor-left'), P.leftHM(suhDay.imsak - t)); }
  }

  // a second city (Irbid): its five prayer times in a small line under the cards, its own method and time zone
  var CITY2 = { name: 'إربد', lat: 32.5556, lon: 35.85, tz: 'Asia/Amman', cc: 'JO' };
  function renderCity2(r) {
    var line = P.withLocation(CITY2, function () {
      var n = P.ymd(Date.now()), T = P.dayTimes(n.y, n.m, n.d);
      return FIVE.map(function (k) { return '<span><b>' + P.name(k, T.friday) + '</b> ' + P.full(T.at[k]) + '</span>'; }).join('');
    });
    $('city2').innerHTML = '<span class="gold">' + CITY2.name + '</span>' + line;
  }
  function renderDay(t, r, today) {
    renderCity2(r);
    $('g-date').textContent = fGFull.format(new Date(t));
    $('h-date').textContent = fHFull.format(new Date(t));
    $('friday-box').classList.toggle('hidden', !today.friday);
    // the seasons: Ramadan, the ten days of Dhul-Hijjah (and Arafah), the two Eids, Friday
    var h = {};
    fHMD.formatToParts(new Date(P.noonOf(r.y, r.m, r.d))).forEach(function (x) { h[x.type] = +x.value; });
    $('moon').innerHTML = moonSvg(h.day);
    season = { ramadan: h.month === 9, hajj: h.month === 12 && h.day <= 9, arafah: h.month === 12 && (h.day === 8 || h.day === 9),
      eid: (h.month === 10 && h.day <= 3) || (h.month === 12 && h.day >= 10 && h.day <= 13), friday: today.friday };
    ['ramadan', 'hajj', 'eid', 'friday'].forEach(function (k) { stage.classList.toggle('s-' + k, !!season[k]); });
    var sp = special(r);
    stage.classList.toggle('s-bday', !!sp && !season.ramadan && !season.eid && !season.hajj);
    $('bday').textContent = sp ? '✦ ' + sp.type + ' ✦' : '';
    $('bday').classList.toggle('hidden', !sp);
    var badge = season.eid ? 'عيدكم مبارك' : season.arafah && h.day === 9 ? 'يوم عرفة' : season.hajj ? 'عشر ذي الحجة' : season.ramadan ? 'رمضان كريم' : today.friday ? 'جمعة مباركة' : '';
    $('season-badge').textContent = badge;
    $('season-badge').classList.toggle('hidden', !badge);
    lastFact = '';
  }

  // the moon's age in days now (from the new moon of 6 Jan 2000 18:14 UTC; a lunation is 29.53 days)
  function moonAge(t) { var a = ((t - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.530589; return a < 0 ? a + 29.530589 : a; }
  // the moon on this Hijri day (lit on the right while waxing, on the left while waning)
  function moonSvg(day) {
    var p = Math.min(.999, day / 29.53), rx = Math.abs(Math.cos(2 * Math.PI * p)) * 9, wax = p < .5;
    var outer = wax ? 1 : 0, inner = wax ? (p < .25 ? 0 : 1) : (p > .75 ? 1 : 0);
    return '<svg viewBox="0 0 24 24" class="moon-ic"><circle cx="12" cy="12" r="9" class="moon-dark"/>' +
      '<path class="moon-lit" d="M12 3A9 9 0 0 ' + outer + ' 12 21A' + rx.toFixed(2) + ' 9 0 0 ' + inner + ' 12 3Z"/></svg>';
  }

  var H_MONTHS = ['محرّم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
  var G_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  // the shortest fast (Fajr → Maghrib) of the current Hijri year; worked out once a day
  var shortCache = {};
  function shortestFast(r) {
    var key = [r.y, r.m, r.d, S.loc.lat, S.loc.lon, S.hijriAdj, JSON.stringify(S.offsets)].join('|');
    if (shortCache.key === key) return shortCache.v;
    function hYear(dd) { var y = 0; fHMD.formatToParts(new Date(P.noonOf(dd.y, dd.m, dd.d))).forEach(function (x) { if (x.type === 'year') y = +x.value; }); return y; }
    var y0 = hYear(r), best = null;
    for (var i = -360; i <= 360; i++) {
      var dd = P.addDays(r.y, r.m, r.d, i);
      if (hYear(dd) !== y0) continue;
      var T = P.dayTimes(dd.y, dd.m, dd.d, S.offsets), len = T.at.maghrib - T.at.fajr;
      if (!best || len < best.len) best = { len: len, d: dd.d, m: dd.m };
    }
    shortCache = { key: key, v: best };
    return best;
  }

  // ---------- Ramadan imsakiya: every day of the (current or coming) Ramadan ----------
  // the year shown: null = this year's Ramadan (or the next one); otherwise a Hijri year chosen on the wheel
  var imYear = null, imTimer = null;
  function imCurrentStart() {
    var r = P.ymd(Date.now()), start = null;
    // the first Ramadan that has not ended yet (this year's while it lasts, then the next one)
    for (var i = -30; i < 400 && !start; i++) {
      var d = P.addDays(r.y, r.m, r.d, i), e = P.addDays(d.y, d.m, d.d, 29);
      if (P.isRamadan(d.y, d.m, d.d) && (i >= 0 || P.isRamadan(e.y, e.m, e.d) || Date.UTC(e.y, e.m - 1, e.d) >= Date.UTC(r.y, r.m - 1, r.d))) start = d;
      if (start && i < 0) { var e2 = P.addDays(start.y, start.m, start.d, 30); if (Date.UTC(e2.y, e2.m - 1, e2.d) <= Date.UTC(r.y, r.m - 1, r.d)) start = null; }
    }
    return start;
  }
  function imDefaultYear() { var s0 = imCurrentStart(); return s0 ? hOf(s0.y, s0.m, s0.d).y : hOf(P.ymd(Date.now()).y, P.ymd(Date.now()).m, P.ymd(Date.now()).d).y; }
  // the wheel of Hijri years (with the Gregorian year of that Ramadan) beside the title
  function imWheel() {
    var box = $('im-years'), y0 = imYear || imDefaultYear(), now = imDefaultYear();
    if (!box.dataset.built) {
      var html = '<div class="cv-pad"></div>';
      for (var y = CV_H[0]; y <= CV_H[1]; y++) { var g = hToG(y, 9, 1); html += '<div class="cv-it" data-v="' + y + '">' + y + ' هـ' + (g ? ' · ' + g.y : '') + '</div>'; }
      box.innerHTML = '<div class="cv-wrap"><div id="im-wheel" class="cv-wheel f" tabindex="0" data-wf="imy" aria-label="السنة">' + html + '<div class="cv-pad"></div></div></div>';
      box.dataset.built = '1';
      var w = $('im-wheel');
      w.addEventListener('scroll', function () {
        imMark(); clearTimeout(imTimer);
        imTimer = setTimeout(function () {
          var y = CV_H[0] + Math.round(w.scrollTop / imH());
          y = Math.max(CV_H[0], Math.min(CV_H[1], y));
          if (y !== (imYear || imDefaultYear())) { imYear = y === imDefaultYear() ? null : y; imsakRender(true); }
        }, 160);
      }, { passive: true });
    }
    var wh = $('im-wheel'); wh.scrollTop = (y0 - CV_H[0]) * imH(); imMark();
    $('im-now').classList.toggle('hidden', !imYear || imYear === now);
  }
  function imH() { var it = document.querySelector('#im-wheel .cv-it'); return it ? it.offsetHeight : 1; }
  function imMark() {
    var w = $('im-wheel'), i = Math.round(w.scrollTop / imH());
    Array.prototype.forEach.call(w.querySelectorAll('.cv-it'), function (it, k) { it.classList.toggle('sel', k === i); });
  }
  function imKey(dir) {
    var y = Math.max(CV_H[0], Math.min(CV_H[1], (imYear || imDefaultYear()) + dir));
    imYear = y === imDefaultYear() ? null : y;
    imsakRender();
  }
  function imsakRender(fromWheel) {
    var r = P.ymd(Date.now()), start = imYear ? hToG(imYear, 9, 1) : imCurrentStart(), days = [];
    for (var j = 0; start && j < 31; j++) {
      var dd = P.addDays(start.y, start.m, start.d, j);
      if (!P.isRamadan(dd.y, dd.m, dd.d)) break;
      days.push(dd);
    }
    if (!days.length) { $('imsak-body').innerHTML = ''; return; }
    $('imsak-title').textContent = 'إمساكية ' + fHMY.format(new Date(P.noonOf(days[0].y, days[0].m, days[0].d)));
    $('imsak-sub').textContent = S.loc.name + ' · ' + P.method().name;
    var head = '<div class="im-tr im-th"><span>رمضان</span><span>اليوم</span><span>الإمساك</span><span>الفجر</span><span>المغرب</span><span>مدة الصيام</span></div>';
    var rows = days.map(function (dd, k) {
      var T = P.dayTimes(dd.y, dd.m, dd.d, S.offsets), wd = DAY_NAMES[new Date(Date.UTC(dd.y, dd.m - 1, dd.d)).getUTCDay()];
      var today = dd.y === r.y && dd.m === r.m && dd.d === r.d;
      // in Ramadan: the days already fasted change colour, today is outlined
      var past = Date.UTC(dd.y, dd.m - 1, dd.d) < Date.UTC(r.y, r.m - 1, r.d);
      return '<div class="im-tr' + (today ? ' im-today' : past ? ' im-past' : '') + '"><span class="gold">' + (k + 1) + '</span><span>' + wd + ' ' + fd(dd.d, dd.m) + '</span><span>' +
        P.full(T.imsak) + '</span><span>' + P.full(T.at.fajr) + '</span><span><b>' + P.full(T.at.maghrib) + '</b></span><span>' + P.leftHM(T.at.maghrib - T.at.fajr) + '</span></div>';
    });
    var half = Math.ceil(rows.length / 2);
    $('imsak-body').innerHTML = '<div class="im-col">' + head + rows.slice(0, half).join('') + '</div><div class="im-col">' + head + rows.slice(half).join('') + '</div>';
    if (!fromWheel) imWheel(); else $('im-now').classList.toggle('hidden', !imYear);
  }

  // ---------- the month's prayer times (the month shown in the calendar), today marked ----------
  function monthRender() {
    var r = P.ymd(Date.now()), y = cal.vy || r.y, m = cal.vm || r.m, n = new Date(Date.UTC(y, m, 0)).getUTCDate(), rows = [];
    $('month-title').textContent = 'مواقيت ' + fGMY.format(new Date(P.noonOf(y, m, 1)));
    $('month-sub').textContent = S.loc.name + ' · ' + P.method().name;
    var head = '<div class="mt-tr mt-th"><span>اليوم</span><span>هجري</span>' + ORDER.map(function (k) { return '<span>' + P.name(k) + '</span>'; }).join('') + '</div>';
    for (var d = 1; d <= n; d++) {
      var T = P.dayTimes(y, m, d, S.offsets), dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(), today = y === r.y && m === r.m && d === r.d;
      rows.push('<div class="mt-tr' + (today ? ' im-today' : '') + (dow === 5 ? ' mt-fri' : '') + '"><span>' + DAY_NAMES[dow] + ' ' + d + '</span><span class="muted">' +
        hOf(y, m, d).d + '</span>' + ORDER.map(function (k) { return '<span>' + P.full(T.at[k]) + '</span>'; }).join('') + '</div>');
    }
    var half = Math.ceil(rows.length / 2);
    $('month-body').innerHTML = '<div class="im-col">' + head + rows.slice(0, half).join('') + '</div><div class="im-col">' + head + rows.slice(half).join('') + '</div>';
  }

  // ---------- night care: the screen dims from two hours after Isha until Fajr, and the page moves a few pixels
  // every 3 minutes so nothing stays on the same spot (the remote wakes it for 2 minutes) ----------
  var lastKeyAt = 0, lastShift = -1;
  function nightCare(t, today) {
    var dim = TV && S.nightDim && Date.now() - lastKeyAt > 2 * MIN && (t >= today.at.isha + 2 * HR || t < today.at.fajr) && !iqOpen();
    $('dim').classList.toggle('on', !!dim);
    if (!TV) return;
    var s = Math.floor(t / (3 * MIN)) % 5;
    if (s !== lastShift) {
      lastShift = s;
      var o = [[0, 0], [5, 3], [-4, 5], [5, -4], [-4, -3]][s];
      $('home').style.transform = 'translate(' + o[0] + 'px,' + o[1] + 'px)';
    }
  }

  // ---------- every 3 minutes: a reminder (verse, hadith, wisdom, note) then a family message, in turn ----------
  var CYCLE = ['aya', 'hadith', 'asma', 'aya', 'dua', 'hikma', 'hadith', 'faida'], lastQ = '';
  // the family set in the settings (the default family until changed)
  function fam() { return S.family || FAMILY.DEFAULT; }
  function famOrder() {
    var ms = fam().members;
    return ms.filter(function (x) { return x.kind === 'son' || x.kind === 'daughter'; })
      .concat(ms.filter(function (x) { return x.kind === 'wife' || x.kind === 'husband'; }))
      .map(function (x) { return x.id; }).concat(['all'])
      .concat((fam().departed || []).map(function (x) { return 'd-' + x.id; }));
  }
  function member(id) {
    var d = (fam().departed || []).filter(function (x) { return 'd-' + x.id === id; })[0];
    if (d) return { id: id, name: d.name, kind: 'departed', dep: d };
    return fam().members.filter(function (x) { return x.id === id; })[0] || { id: 'all', name: 'العائلة', kind: 'all' };
  }
  function sign(x) {
    if (x.kind === 'wife') return 'زوجك';
    if (x.kind === 'husband') return 'زوجتك';
    if (x.kind === 'all') return 'مع المحبة';
    if (x.kind === 'self') return fam().parent === 'mother' ? 'زوجك وأولادك' : 'زوجتك وأولادك';
    if (x.kind === 'departed') return 'اللهم آمين';
    return fam().parent === 'mother' ? 'ماما' : 'بابا';
  }
  // which message set suits this person: sons under 13 get the children's set
  function msgKind(x) {
    if (x.kind === 'self') return fam().parent === 'mother' ? 'selfMother' : 'self';
    if (x.kind === 'departed') return x.dep.kind;
    if (x.kind !== 'son') return x.kind;
    return x.y && P.ymd(Date.now()).y - x.y < 13 ? 'sonChild' : 'sonTeen';
  }
  function fill(t, x) {
    var names = fam().members.filter(function (m) { return m.kind !== 'self'; }).map(function (m) { return m.name; });
    var list = names.length > 1 ? names.slice(0, -1).join('، ') + ' و' + names[names.length - 1] : names.join('');
    var d = x && x.dep, sp = spouse();
    return t.replace(/\{name\}/g, x ? x.name : '').replace(/\{names\}/g, list)
      .replace(/\{acc\}/g, d ? d.acc || d.name : '').replace(/\{gen\}/g, d ? d.gen || d.name : '').replace(/\{spouse\}/g, sp ? sp.name : '');
  }
  function reminder(n) {
    var round = Math.floor(n / CYCLE.length), kind = CYCLE[n % CYCLE.length];
    var before = CYCLE.slice(0, n % CYCLE.length).filter(function (x) { return x === kind; }).length;
    var per = CYCLE.filter(function (x) { return x === kind; }).length;
    // a name of Allah: one each day
    if (kind === 'asma') {
      var day = Math.floor((n * 3 * MIN) / 86400000), nm = ASMA[day % ASMA.length];
      return { type: 'من أسماء الله الحسنى', text: nm[0] + ': ' + nm[1], src: '﴿وَلِلَّهِ ٱلۡأَسۡمَآءُ ٱلۡحُسۡنَىٰ فَٱدۡعُوهُ بِهَا﴾ الأعراف 180' };
    }
    // a supplication: one each day
    if (kind === 'dua') {
      var dd = ADHKAR.dua[Math.floor((n * 3 * MIN) / 86400000) % ADHKAR.dua.length];
      return { type: 'دعاء اليوم', text: dd.q ? quranText(dd.q) : '«' + dd.x + '»', src: dd.s, quran: !!dd.q };
    }
    var list = REMINDERS[kind];
    return list[(round * per + before) % list.length];
  }
  // family messages, one for each person in turn (own messages added to that person's list)
  function famPool() {
    var lists = {}, pool = [], max = 0, order = famOrder();
    order.forEach(function (id) {
      var x = member(id), base = FAMILY.messages[id === 'all' ? 'all' : msgKind(x)] || [];
      // a child who loves football: every other message is a football one
      if (x.likes === 'football') base = mix(base, FAMILY.messages.football);
      lists[id] = base.map(function (t) { return fill(t, x); })
        .concat(S.famMsgs.filter(function (m) { return m.to === id; }).map(function (m) { return m.text; }));
      max = Math.max(max, lists[id].length);
    });
    for (var i = 0; i < max; i++) order.forEach(function (id) { if (lists[id][i]) pool.push({ to: id, text: lists[id][i] }); });
    return pool;
  }
  function mix(a, b) {
    var out = [];
    for (var i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); }
    return out;
  }
  // on the Eid days the family messages become Eid greetings, to each one by name
  function eidMessage(n) {
    var ms = fam().members.filter(function (x) { return x.kind !== 'self'; }), x = ms[n % (ms.length + 1)];
    if (!x) return { type: 'عيدكم مبارك', text: 'عيدكم مبارك، وكل عام وأنتم بخير، تقبّل الله منا ومنكم', src: '— مع المحبة', fam: true };
    var she = x.kind === 'wife' || x.kind === 'daughter';
    return { type: 'عيدك مبارك يا ' + x.name, text: she ? 'عيدكِ مبارك يا ' + x.name + '، وكل عام وأنتِ بخير، تقبّل الله منا ومنكِ' :
      'عيدك مبارك يا ' + x.name + '، وكل عام وأنت بخير، تقبّل الله منا ومنك', src: '— ' + sign(x), fam: true };
  }
  function famMessage(n) {
    if (season.eid) return eidMessage(n);
    var pool = famPool(), m = pool[n % pool.length], who = member(m.to);
    var type = m.to === 'all' ? 'رسالة إلى العائلة' : who.kind === 'departed' ?
      (who.dep.kind === 'father' ? 'دعاء لوالدي رحمه الله' : 'دعاء ل' + who.name + ' رحمها الله') :
      'رسالة إلى ' + who.name;
    return { type: type, text: m.text, src: '— ' + sign(who), fam: true };
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
      $('quote').style.fontSize = q.text.length > 150 ? (q.quran ? '27px' : '24px') : q.text.length > 80 ? (q.quran ? '32px' : '26px') : q.text.length > 50 ? (q.quran ? '36px' : '30px') : '';
      $('quote-src').textContent = q.src;
      box.classList.toggle('special', !!sp);
      box.classList.remove('fade');
    }
    if (first) put();
    else { box.classList.add('fade'); setTimeout(put, 600); }
  }

  // ---------- every second ----------
  var lastDay = '', night = null, skyKey = null;
  function dayOf(y, m, d) {
    var T = P.dayTimes(y, m, d, S.offsets);
    T.maghribAt = T.at.maghrib;
    return T;
  }
  function tick() {
    var t = Date.now(), r = P.ymd(t);
    tTick();
    var today = dayOf(r.y, r.m, r.d), tm = P.addDays(r.y, r.m, r.d, 1), tom = dayOf(tm.y, tm.m, tm.d);
    var ym = P.addDays(r.y, r.m, r.d, -1), yest = dayOf(ym.y, ym.m, ym.d);
    var key = r.y + '-' + r.m + '-' + r.d;
    if (key !== lastDay) { lastDay = key; renderDay(t, r, today); sendSchedule(); renderEvents(r); }
    // dark from two hours after Isha until Fajr
    var n = S.theme === 'dark' || (S.theme === 'auto' && (t >= today.at.isha + 2 * HR || t < today.at.fajr));
    if (n !== night) { night = n; stage.classList.toggle('night', n); stage.classList.toggle('day', !n); tempPaint(); }
    // the TV: tonight's real moon in the sky over the mosque, from Maghrib until Fajr (redrawn every 10 minutes)
    var sky = t >= today.at.maghrib || t < today.at.fajr, mk = sky ? Math.floor(t / (10 * MIN)) : -1;
    if (mk !== skyKey) { skyKey = mk; stage.classList.toggle('sky-on', sky); if (sky) $('sky-moon').innerHTML = moonSvg(moonAge(t)); }
    // the remote's focus ring hides after 10 seconds without a key
    stage.classList.toggle('idle', TV && Date.now() - lastKeyAt > 10000);
    $('clock').textContent = P.full(t);
    showReminder(t);
    fridayMorning = today.friday && t >= today.at.sunrise && t < today.at.dhuhr;
    if (today.friday) $('fr-left').textContent = t < today.at.dhuhr ? 'متبقٍّ على الجمعة ' + P.leftHM(today.at.dhuhr - t) : '';
    showFact(t, today, yest);
    if (screen === 'home') renderHome(t, today, tom, yest);
    nightCare(t, today);
    if (screen === 'kahf') $('kahf-clock').textContent = P.full(t);
    checkAlert(t, today);
    checkIqamah(t, today);
  }

  // ---------- occasion countdowns (days left): own dates + Ramadan and the two Eids (Umm al-Qura) ----------
  var AUTO = [{ id: 'ramadan', name: 'دخول رمضان', m: 9, d: 1 }, { id: 'fitr', name: 'عيد الفطر', m: 10, d: 1 }, { id: 'adha', name: 'عيد الأضحى', m: 12, d: 10 }];
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
  // days left, in words: اليوم · غدًا · بعد غد · 5 أيام · 107 يومًا
  function daysText(n) { return n === 0 ? 'اليوم' : n === 1 ? 'غدًا' : n === 2 ? 'بعد غد' : countWord(n, '', '', 'أيام', 'يومًا'); }
  // dates as numbers read from the right: day, then month, then year (the marks keep the order in Arabic text)
  function fd(d, m, y) { var R = '\u200F'; return d + R + '/' + m + (y ? R + '/' + y : ''); }
  function dmy(e) { return fd(e.d, e.m, e.y); }
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
    sendWidget();
    // occasions with the same card letter (أ ب ج) share one card and take turns; card أ comes first, then the nearest
    var all = allEvents(r), groups = {}, cards = [];
    all.forEach(function (e) {
      var g = cardOf(e);
      if (!g) cards.push({ g: '', list: [e] });
      else if (groups[g]) groups[g].list.push(e);
      else cards.push(groups[g] = { g: g, list: [e] });
    });
    cards.sort(function (x, y) { return (x.g === 'a' ? -1 : 0) - (y.g === 'a' ? -1 : 0) || x.list[0].left - y.list[0].left; });
    // the TV: the timers sent from the phone take turns in the birthdays card (ب), or in a card of their own
    var tl = TV ? S.timers.map(function (x) { return { timer: x }; }) : [];
    if (tl.length) { if (groups.b) groups.b.list = groups.b.list.concat(tl); else cards.push({ g: 't', list: tl }); }
    evCards = cards;
    $('events').innerHTML = cards.slice(0, 6).map(function (c, n) {
      return '<div class="ev' + (c.list.length > 1 ? ' ev-turn' : '') + '" id="evc-' + n + '">' + evInner(c.list[(evTurn[c.g] || 0) % c.list.length]) + '</div>';
    }).join('');
  }
  // the card of an occasion: chosen in the settings, or by default Ramadan and the Eids أ, birthdays and the anniversary ب
  var SEASON = { ramadan: 1, fitr: 1, adha: 1 }, CARD_LETTERS = ['', 'a', 'b', 'c'], CARD_NAMES = { '': 'منفردة', a: 'أ', b: 'ب', c: 'ج' };
  var evCards = [], evTurn = {};
  function evKey(e) { return e.auto || 'o:' + e.name + ':' + e.y + '-' + e.m + '-' + e.d; }
  function cardOf(e) {
    var k = evKey(e);
    if (S.evCard[k] != null) return S.evCard[k];
    return SEASON[e.auto] ? 'a' : e.auto && (e.auto.indexOf('b-') === 0 || e.auto === 'anniv') ? 'b' : '';
  }
  function evInner(e) {
    if (e.timer) {
      // a timer (from the phone): its first number large, the rest small; «منذ / حتى» and its name
      var x = e.timer, pt = tParts(x, Date.now()), past = tAt(x) <= Date.now(), first = pt[0];
      return '<span class="ev-n">' + (first[0] >= 10000 ? tNum(first[0]) : first[0]) + '</span><div class="ev-t"><b>' + (past ? 'منذ ' : 'حتى ') + esc(x.name) +
        '</b><span>' + first[1] + (pt[1] ? ' و' + pt[1][0] + ' ' + pt[1][1] : '') + '</span></div>';
    }
    var big = e.left <= 2 ? daysText(e.left) : e.left;
    return '<span class="ev-n">' + big + '</span><div class="ev-t"><b>' + esc(e.name) +
      '</b><span>' + (e.left <= 2 ? '' : (e.left <= 10 ? 'أيام' : 'يومًا') + ' · ') + dmy(e) + '</span></div>';
  }
  setInterval(function () {
    evCards.slice(0, 6).forEach(function (c, n) {
      var box = $('evc-' + n);
      if (!box || c.list.length < 2) return;
      box.classList.add('fade');
      setTimeout(function () { evTurn[c.g] = (evTurn[c.g] || 0) + 1; box.innerHTML = evInner(c.list[evTurn[c.g] % c.list.length]); box.classList.remove('fade'); }, 400);
    });
  }, 10000);
  var evDraft = (function () { var r = P.ymd(Date.now()), x = P.addDays(r.y, r.m, r.d, 30); return { y: x.y, m: x.m, d: x.d }; })();

  // ---------- full-screen countdowns: adhan → iqamah, and in Ramadan the last 15 minutes before Maghrib ----------
  var iqDismissed = {}, iqAt = 0, iqPrevFocus = null;
  function iqOpen() { return !$('iqamah').classList.contains('hidden'); }
  function checkIqamah(t, T) {
    var on = null, key, label, target, detail;
    FIVE.forEach(function (k) { if (S.alerts[k] && T.iqamah[k] && t >= T.at[k] && t < T.iqamah[k]) on = k; });
    if (on) {
      key = 'iq' + T.at[on];
      label = 'متبقٍّ على إقامة صلاة ' + P.name(on, T.friday);
      target = T.iqamah[on];
      detail = 'الأذان ' + P.full(T.at[on]) + ' · الإقامة ' + P.full(T.iqamah[on]);
    } else if (T.ramadan && t >= T.at.maghrib - 15 * MIN && t < T.at.maghrib) {
      key = 'if' + T.at.maghrib;
      label = 'متبقٍّ على أذان المغرب · الإفطار';
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
      putDigits($('iq-cd'), P.left(left));
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
  // the season of a day in the calendar: [class, name]
  function seasonOfDay(ts) {
    var h = {};
    fHMD.formatToParts(new Date(ts)).forEach(function (x) { h[x.type] = +x.value; });
    if (h.month === 9) return ['ram', 'رمضان'];
    if (h.month === 10 && h.day <= 3) return ['eid', 'عيد الفطر'];
    if (h.month === 12 && h.day === 9) return ['arafah', 'يوم عرفة'];
    if (h.month === 12 && h.day <= 8) return ['hajj', 'عشر ذي الحجة'];
    if (h.month === 12 && h.day <= 13) return ['eid', h.day === 10 ? 'عيد الأضحى' : 'أيام التشريق'];
    if (h.month === 1 && h.day === 10) return ['ashura', 'عاشوراء'];
    return null;
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
      var hd = fHDay.format(new Date(ts)), sn = seasonOfDay(ts);
      if (sn) cls += ' c-' + sn[0];
      html += '<button class="' + cls + '" data-d="' + d + '"><span class="cg">' + d + '</span><span class="ch">' + hd + '</span><span class="chd">' + hd.split(' ')[0] + '</span></button>';
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
    var atToday = cal.vy === cal.ty && cal.vm === cal.tm && cal.sy === cal.ty && cal.sm === cal.tm && cal.sd === cal.td;
    $('cal-today').classList.toggle('hidden', atToday);
  }
  function calPanel() {
    var T = P.dayTimes(cal.sy, cal.sm, cal.sd, S.offsets), ts = P.noonOf(cal.sy, cal.sm, cal.sd);
    $('cal-greg').textContent = fGFull.format(new Date(ts));
    var sn = seasonOfDay(ts);
    $('cal-hdate').textContent = fHFull.format(new Date(ts)) + (sn ? ' · ' + sn[1] : '');
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
    // the new month shows a chosen day: today in this month, else the 1st
    cal.sy = cal.vy; cal.sm = cal.vm; cal.sd = cal.vy === cal.ty && cal.vm === cal.tm ? cal.td : 1;
    calRender();
  }

  // ---------- the Qur'an: any surah, verse by verse (Mishary Alafasy from everyayah.com), the verses on screen ----------
  var kahf = { s: 18, i: 0, playing: false };
  var audio = new Audio(), pre = new Audio();
  pre.preload = 'auto';
  function pad3(n) { return ('00' + n).slice(-3); }
  function kCount() { return QURAN[kahf.s - 1][1].length; }
  // the Basmala comes first, except in Al-Fatiha (its first verse) and At-Tawbah
  function kFirst() { return kahf.s === 1 || kahf.s === 9 ? 1 : 0; }
  // reciters (everyayah.com folders; a second folder is tried if the first does not play)
  var RECITERS = [
    { id: 'alafasy', name: 'مشاري العفاسي', dirs: ['Alafasy_128kbps', 'Alafasy_64kbps'] },
    { id: 'sudais', name: 'عبد الرحمن السديس', dirs: ['Abdurrahmaan_As-Sudais_192kbps', 'Abdurrahmaan_As-Sudais_64kbps'] },
    { id: 'shuraym', name: 'سعود الشريم', dirs: ['Saood_ash-Shuraym_128kbps', 'Saood_ash-Shuraym_64kbps'] },
    { id: 'muaiqly', name: 'ماهر المعيقلي', dirs: ['MaherAlMuaiqly128kbps', 'Maher_AlMuaiqly_64kbps'] },
    { id: 'dossary', name: 'ياسر الدوسري', dirs: ['Yasser_Ad-Dussary_128kbps'] }
  ];
  var dirTry = 0;
  function reciter() { return RECITERS.filter(function (r) { return r.id === S.reciter; })[0] || RECITERS[0]; }
  function kSrc(i) {
    var dirs = reciter().dirs;
    return 'https://everyayah.com/data/' + dirs[Math.min(dirTry, dirs.length - 1)] + '/' + (i === 0 ? '001001' : pad3(kahf.s) + pad3(i)) + '.mp3';
  }
  function arNum(n) { return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
  function kText(i) { var v = QURAN[kahf.s - 1][1]; return i === 0 ? BASMALA : (i >= 1 && i <= v.length ? v[i - 1] + ' ﴿' + arNum(i) + '﴾' : ''); }
  function kRender() {
    var i = kahf.i, cur = kText(i), n = kCount();
    $('k-title').textContent = 'سورة ' + QURAN[kahf.s - 1][0];
    $('k-sub').textContent = 'بصوت الشيخ ' + reciter().name;
    $('k-prev').textContent = i > kFirst() ? kText(i - 1) : '';
    $('k-cur').textContent = cur;
    $('k-next').textContent = kText(i + 1);
    $('k-cur').style.fontSize = cur.length > 900 ? '28px' : cur.length > 600 ? '34px' : cur.length > 330 ? '42px' : cur.length > 200 ? '52px' : cur.length > 110 ? '60px' : '70px';
    $('k-pos').textContent = i === 0 ? 'البسملة' : 'الآية ' + i + ' من ' + n;
    $('k-fill').style.width = (i / n * 100) + '%';
    $('k-ic-pause').classList.toggle('hidden', !kahf.playing);
    $('k-ic-play').classList.toggle('hidden', kahf.playing);
  }
  function kPlay(i) {
    kahf.i = i;
    kahf.playing = true;
    $('k-msg').textContent = '';
    audio.src = kSrc(i);
    audio.play().catch(function () {});
    if (i < kCount()) pre.src = kSrc(i + 1);
    if (i > 0) { S.qLast = { s: kahf.s, i: i }; save(); }
    kRender();
  }
  function kNext() { if (kahf.i < kCount()) kPlay(kahf.i + 1); }
  function kPrev() { if (kahf.i > kFirst()) kPlay(kahf.i - 1); }
  audio.addEventListener('ended', function () {
    if (kahf.i < kCount()) kPlay(kahf.i + 1);
    else { kahf.playing = false; $('k-msg').textContent = 'انتهت السورة'; kRender(); }
  });
  audio.addEventListener('error', function () {
    if (!audio.src) return;
    if (dirTry < reciter().dirs.length - 1) { dirTry++; kPlay(kahf.i); return; }
    kahf.playing = false;
    $('k-msg').textContent = 'تعذّر التشغيل، تأكد من اتصال الإنترنت';
    kRender();
  });
  function kToggle() {
    if (kahf.playing) { audio.pause(); kahf.playing = false; kRender(); }
    else if (audio.src && !audio.ended && audio.currentTime > 0) { audio.play().catch(function () {}); kahf.playing = true; kRender(); }
    else kPlay(kahf.i);
  }
  // the list of the 114 surahs, and «continue» from the last verse heard
  function quranRender() {
    var L = S.qLast;
    $('q-resume').innerHTML = L && QURAN[L.s - 1] ? '<button class="gold-btn f" data-go="kahf" data-sura="' + L.s + '" data-from="' + L.i + '">' +
      'متابعة سورة ' + QURAN[L.s - 1][0] + ' · الآية ' + L.i + '</button>' : '';
    $('q-sub').textContent = 'اختر سورة · بصوت الشيخ ' + reciter().name;
    $('q-reciters').innerHTML = RECITERS.map(function (r) {
      return '<button class="sbtn f' + (r.id === reciter().id ? ' on' : '') + '" data-rec="' + r.id + '">' + r.name + '</button>';
    }).join('');
    if (!$('q-list').firstChild) $('q-list').innerHTML = QURAN.map(function (q, k) {
      return '<button class="sura f" data-go="kahf" data-sura="' + (k + 1) + '"><span class="sura-n">' + (k + 1) + '</span><b class="quran">' + q[0] + '</b><span class="muted">' + countWord(q[1].length, 'آية', 'آيتان', 'آيات', 'آية') + '</span></button>';
    }).join('');
  }
  function kStop() { audio.pause(); kahf.playing = false; }

  // ---------- all apps ----------
  var appsMode = 'launch';
  function appsRender() {
    var list = apps();
    if (appsMode === 'pick') list = list.filter(function (a) { return (S.shortcuts || []).indexOf(a.pkg) < 0; });
    $('apps-title').textContent = appsMode === 'pick' ? 'اختر تطبيقًا للاختصارات' : 'كل التطبيقات';
    $('apps-sub').textContent = countWord(list.length, 'تطبيق واحد', 'تطبيقان', 'تطبيقات', 'تطبيقًا');
    $('apps-grid').innerHTML = list.map(tileHtml).join('');
  }

  // ---------- settings ----------
  function setRender() {
    var keep = document.activeElement && document.activeElement.dataset.k;
    var r = P.ymd(Date.now()), T = P.dayTimes(r.y, r.m, r.d, S.offsets);
    $('set-loc').innerHTML =
      '<div class="srow"><span class="sname">' + esc(S.loc.name) + (S.loc.country ? ' <span class="muted">· ' + esc(S.loc.country) + '</span>' : '') +
        '<br><span class="muted set-note">طريقة الحساب: ' + P.method().name + (S.loc.mode === 'auto' ? ' · ' + (S.loc.gps ? 'من موقع الجوال' : 'من اتصال الإنترنت') : '') + '</span></span>' +
        '<button class="sbtn al f' + (S.loc.mode === 'auto' ? ' on' : '') + '" data-k="loc-auto">' + (S.loc.mode === 'auto' ? 'تلقائي' : 'تحديد تلقائي') + '</button></div>' +
      '<div class="srow"><input id="loc-q" class="inp f" placeholder="ابحث عن مدينة، مثل: جدة أو عمّان" value="' + esc(locQ) + '"><button id="loc-find" class="sbtn f">بحث</button></div>' +
      (locMsg ? '<div class="muted set-note">' + locMsg + '</div>' : '') +
      locResults.map(function (g, i) {
        return '<div class="srow"><span class="sname">' + esc(g.name) + ' <span class="muted">· ' + esc([g.admin1, g.country].filter(Boolean).join('، ')) + '</span></span>' +
          '<button class="sbtn al f" data-k="loc-' + i + '">اختيار</button></div>';
      }).join('');
    $('set-sound').innerHTML = '<div class="muted set-note">صوت التنبيه لكل صلاة</div>' + FIVE.map(function (k) { return [k, P.name(k)]; }).map(function (x) {
      return '<div class="srow snd-row"><span class="sname">' + x[1] + '</span><span class="snd-opts">' + SOUNDS.map(function (o) {
        return '<button class="sbtn f' + (S.sound[x[0]] === o[0] ? ' on' : '') + '" data-k="snd-' + x[0] + '-' + o[0] + '">' + o[1] + '</button>';
      }).join('') + (A && A.previewSound && S.sound[x[0]] !== 'none' ? '<button class="sbtn f" data-k="sndt-' + x[0] + '">▶ تجربة</button>' : '') + '</span></div>';
    }).join('');
    // the phone's other notifications
    var sAt = 0; try { sAt = +localStorage.getItem('prayertv-synced-at') || 0; } catch (e) {}
    var same = syncData() === syncLast();
    $('set-sync').innerHTML = '<div class="srow"><span class="sname">' + (syncState === 'send' ? 'جارٍ الإرسال…' :
      syncState === 'none' ? '<span class="w-al">لم أجد التلفزيون على الشبكة، سأحاول عند فتح التطبيق مرة أخرى</span>' :
      syncState === 'fail' ? '<span class="w-al">التلفزيون لم يرد، سأحاول لاحقًا</span>' :
      same && sAt ? 'التلفزيون مثل الجوال ✓ <span class="muted">(آخر إرسال ' + P.full(sAt) + ')</span>' : 'لم يُرسل بعد') + '</span>' +
      '<button class="sbtn al f" data-k="syncnow">أرسل الآن</button></div>';
    $('sum-sync').textContent = same && sAt ? '✓' : '';
    $('set-more-al').innerHTML = (TV ? [] : [['friday', 'تذكير قبل الجمعة بساعة'], ['weather', 'تنبيهات الطقس: غبار، مطر، حرارة شديدة، برد شديد (مدينتك وإربد)']])
      .concat([['kaaba', 'تعامد الشمس على الكعبة (مرتين في السنة): تعرف به اتجاه القبلة']]).map(function (o) {
      return '<div class="srow"><span class="sname">' + o[1] + '</span><button class="sbtn al f' + (S.alerts[o[0]] ? ' on' : '') + '" data-k="a-' + o[0] + '">' + (S.alerts[o[0]] ? 'يعمل' : 'متوقف') + '</button></div>';
    }).join('');
    $('set-prayers').innerHTML = ORDER.map(function (k) {
      var off = S.offsets[k];
      return '<div class="srow"><span class="sname">' + P.name(k) + '</span><span class="stime">' + P.full(T.at[k]) + '</span>' +
        '<button class="sbtn f" data-k="m-' + k + '" aria-label="ناقص دقيقة">−</button>' +
        '<span class="soff">' + (off > 0 ? '+' : '') + off + '</span>' +
        '<button class="sbtn f" data-k="p-' + k + '" aria-label="زائد دقيقة">+</button>' +
        (k === 'sunrise' && TV ? '<span class="sbtn al" style="visibility:hidden"></span>' :
          '<button class="sbtn al f' + (S.alerts[k] ? ' on' : '') + '" data-k="a-' + k + '">' + (S.alerts[k] ? 'التنبيه يعمل' : 'التنبيه متوقف') + '</button>') +
        '</div>';
    }).join('');
    var sc = TV ? shortcutApps() : [];
    $('set-shortcuts').innerHTML = sc.length ? sc.map(function (a, i) {
      return '<div class="srow">' + (a.icon ? '<img src="' + a.icon + '" alt="">' : '') + '<span class="sname">' + esc(a.label) + '</span>' +
        '<button class="sbtn f" data-k="u-' + i + '" aria-label="إلى الأعلى">▲</button>' +
        '<button class="sbtn f" data-k="d-' + i + '" aria-label="إلى الأسفل">▼</button>' +
        '<button class="sbtn f" data-k="x-' + i + '">حذف</button></div>';
    }).join('') : '<div class="muted set-note">لا توجد اختصارات</div>';
    var overlay = !A || A.canOverlay();
    $('set-general').innerHTML =
      '<div class="srow"><span class="sname">فتح هذه الشاشة عند تشغيل التلفزيون</span><button class="sbtn f' + (S.openOnBoot ? ' on' : '') + '" data-k="boot">' + (S.openOnBoot ? 'يعمل' : 'متوقف') + '</button></div>' +
      (A && A.dreamOn ? '<div class="srow"><span class="sname">شاشة التوقف (Screensaver)</span><button class="sbtn f' + (A.dreamOn() ? ' on' : '') + '" data-k="dream">' + (A.dreamOn() ? 'يعمل' : 'متوقف') + '</button>' +
        (A.dreamOn() ? '<button class="sbtn f" data-k="dreamset">اختيارها في إعدادات التلفزيون</button>' : '') + '</div>' : '') +
      '<div class="srow"><span class="sname">إبقاء الشاشة مضاءة دائمًا (يمنع شاشة التوقف)</span><button class="sbtn al f' + (S.keepOn ? ' on' : '') + '" data-k="keep">' + (S.keepOn ? 'يعمل' : 'متوقف') + '</button></div>' +
      '<div class="srow"><span class="sname">تخفيت الشاشة ليلًا (من بعد العشاء بساعتين حتى الفجر)</span><button class="sbtn f' + (S.nightDim ? ' on' : '') + '" data-k="ndim">' + (S.nightDim ? 'يعمل' : 'متوقف') + '</button></div>' +
      '<div class="srow"><span class="sname">التنبيه فوق التطبيقات الأخرى (مثل يوتيوب)</span>' +
      (overlay ? '<span class="sbtn al on">مسموح</span>' : (A && A.overlaySettingsAvailable && !A.overlaySettingsAvailable() ?
        '<span class="muted adb">هذا التلفزيون لا يعرض صفحة السماح. من كمبيوتر على نفس الشبكة:<br><span dir="ltr">adb shell appops set com.dromaia.prayertv SYSTEM_ALERT_WINDOW allow</span></span>' :
        '<button class="sbtn al f" data-k="overlay">السماح</button>')) + '</div>';
    // phone: what the adhan alerts need
    var ph = A && !TV && A.notifOk;
    $('set-phone').innerHTML = !ph ? '' :
      '<div class="srow"><span class="sname">الإشعارات</span>' + (A.notifOk() ? '<span class="sbtn al on">مسموحة</span>' : '<button class="sbtn al f" data-k="notif">السماح</button>') + '</div>' +
      '<div class="srow"><span class="sname">التنبيه في الوقت بالضبط</span>' + (A.exactOk() ? '<span class="sbtn al on">يعمل</span>' : '<span class="sbtn al">قد يتأخر قليلًا</span>') + '</div>' +
      '<div class="srow"><span class="sname">استثناء من توفير البطارية (مهم في سامسونج)</span>' + (A.batteryOk() ? '<span class="sbtn al on">مستثنى</span>' : '<button class="sbtn al f" data-k="battery">استثناء</button>') + '</div>';
    // the Isha interval is a setting only where Isha is a time after Maghrib (Umm al-Qura)
    $('set-isha').innerHTML = !(P.method().ishaMin && !P.method().fixed) ? '' : [['normal', 'العشاء بعد المغرب'], ['ramadan', 'العشاء بعد المغرب في رمضان']].map(function (x) {
      return '<div class="srow"><span class="sname">' + x[1] + '</span>' +
        '<button class="sbtn f" data-k="im-' + x[0] + '" aria-label="ناقص دقيقة">−</button>' +
        '<span class="soff">' + S.ishaMin[x[0]] + '</span>' +
        '<button class="sbtn f" data-k="ip-' + x[0] + '" aria-label="زائد دقيقة">+</button>' +
        '<span class="sbtn al muted" style="border:none;background:none">دقيقة</span></div>';
    }).join('');
    $('set-iq').innerHTML = '<div class="srow muted"><span class="sname"></span><span class="iqh">الأيام العادية</span><span class="iqh">رمضان</span></div>' +
      FIVE.map(function (k) {
        function st(mode) {
          return '<span class="iqs"><button class="sbtn f" data-k="q' + mode + 'm-' + k + '" aria-label="ناقص دقيقة">−</button><span class="soff">' + S.iqMin[mode === 'n' ? 'normal' : 'ramadan'][k] +
            '</span><button class="sbtn f" data-k="q' + mode + 'p-' + k + '" aria-label="زائد دقيقة">+</button></span>';
        }
        return '<div class="srow"><span class="sname">' + P.name(k) + '</span>' + st('n') + st('r') + '</div>';
      }).join('');
    $('set-hijri').innerHTML = '<div class="srow"><span class="sname">تعديل التاريخ الهجري <span class="muted">(' + fHFull.format(Date.now()) + ')</span></span>' +
      '<button class="sbtn f" data-k="hadj-m" aria-label="يوم قبل">−</button><span class="soff">' + (S.hijriAdj > 0 ? '+' : '') + S.hijriAdj + '</span>' +
      '<button class="sbtn f" data-k="hadj-p" aria-label="يوم بعد">+</button><span class="sbtn al muted" style="border:none;background:none">يوم</span></div>';
    $('set-show').innerHTML = (stage.classList.contains('portrait') ? '<div class="srow snd-row"><span class="sname">حجم الخط</span><span class="snd-opts">' +
      [['small', 'صغير'], ['normal', 'عادي'], ['large', 'كبير'], ['xlarge', 'كبير جدًا']].map(function (o) {
        return '<button class="sbtn f' + (Math.abs(zoomOf() - FONT_SCALE[o[0]]) < .04 ? ' on' : '') + '" data-k="fsz-' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</span></div>' : '') + '<div class="srow snd-row"><span class="sname">المظهر</span><span class="snd-opts">' +
      [['auto', 'تلقائي (داكن ليلًا)'], ['light', 'فاتح'], ['dark', 'داكن']].map(function (o) {
        return '<button class="sbtn f' + (S.theme === o[0] ? ' on' : '') + '" data-k="theme-' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</span></div>' + '<div class="srow"><span class="sname">«هل تعلم؟» في بطاقة الصلاة القادمة</span><button class="sbtn al f' +
      (S.showFact ? ' on' : '') + '" data-k="fact">' + (S.showFact ? 'يظهر' : 'مخفي') + '</button></div>';
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
        return '<div class="srow"><span class="sname">' + esc(x.name) + ' <span class="muted">· ' + FAMILY.KINDS[x.kind] + ' · ' + fd(x.d, x.m, x.y) + '</span></span>' +
          '<button class="sbtn al f" data-k="fmx-' + i + '">حذف</button></div>';
      }).join('') +
      '<div class="srow"><span class="sname">ذكرى الزواج</span>' +
      (F.anniversary ? '<span class="ev-date">' + steps('fan', F.anniversary, [['d', 'اليوم'], ['m', 'الشهر']]) + '</span>' : '') +
      '<button class="sbtn f' + (F.anniversary ? ' on' : '') + '" data-k="fan-on">' + (F.anniversary ? 'تظهر' : 'مخفية') + '</button></div>';
    $('fm-kind').textContent = 'الصلة: ' + FAMILY.KINDS[fmDraft.kind];
    $('fm-date').innerHTML = steps('fmd', fmDraft, [['d', 'اليوم'], ['m', 'الشهر'], ['y', 'السنة']]);
    if (famOrder().indexOf(famTo) < 0) famTo = famOrder()[0];
    $('fam-to').textContent = 'إلى: ' + member(famTo).name;
    function cardBtn(k, e) { var g = cardOf(e); return '<button class="sbtn f' + (g ? ' on' : '') + '" data-k="' + k + '">البطاقة: ' + CARD_NAMES[g] + '</button>'; }
    $('set-events').innerHTML = autoEvents(r).map(function (e, i) {
      var on = S.autoEv[e.auto] !== false, n = daysTo(e, r);
      return '<div class="srow"><span class="sname">' + e.name + ' <span class="muted">· ' + dmy(e) + ' · ' + daysText(n) + '</span></span>' +
        cardBtn('evca-' + i, e) + '<button class="sbtn al f' + (on ? ' on' : '') + '" data-k="eva-' + e.auto + '">' + (on ? 'يظهر' : 'مخفي') + '</button></div>';
    }).join('') + S.events.map(function (e, i) {
      var n = daysTo(e, r);
      return '<div class="srow"><span class="sname">' + esc(e.name) + ' <span class="muted">· ' + dmy(e) + ' · ' + daysText(n) + '</span></span>' +
        cardBtn('evco-' + i, e) + '<button class="sbtn al f" data-k="evx-' + i + '">حذف</button></div>';
    }).join('');
    $('ev-date').innerHTML = [['d', 'اليوم'], ['m', 'الشهر'], ['y', 'السنة']].map(function (f) {
      return '<span>' + f[1] + ' <button class="sbtn f" data-k="evd-' + f[0] + 'm" aria-label="ناقص">−</button><b>' + evDraft[f[0]] +
        '</b><button class="sbtn f" data-k="evd-' + f[0] + 'p" aria-label="زائد">+</button></span>';
    }).join('');
    var wErr = '';
    try { wErr = A && A.widgetError ? A.widgetError() : ''; } catch (e) {}
    $('set-version').textContent = (A ? 'الإصدار ' + A.version() : '') + (wErr ? ' · آخر خطأ في الويدجت: ' + wErr : '');
    $('sum-loc').textContent = S.loc.name + ' · ' + P.method().name;
    $('sum-hijri').textContent = fHFull.format(Date.now());
    $('sum-update').textContent = myVersion();
    $('sum-events').textContent = allEvents(r).length ? daysText(allEvents(r)[0].left) + ': ' + allEvents(r)[0].name : '';
    updMsg();
    updLatest();
    if (keep) {
      var el = document.querySelector('#settings [data-k="' + keep + '"]');
      if (el) el.focus();
    }
  }
  // ---------- date converter: Gregorian ↔ Hijri on the Umm al-Qura calendar (the official Saudi calendar,
  // the same as the rest of the app, with the ± day adjustment of the settings); valid 1356–1500 AH ----------
  var cv = { from: 'g', y: 0, m: 0, d: 0 }, CV_G = [1937, 2077], CV_H = [1356, 1500];
  function cvToday() {
    var r = P.ymd(Date.now()), h = hOf(r.y, r.m, r.d), x = cv.from === 'g' ? r : h;
    cv.y = x.y; cv.m = x.m; cv.d = x.d;
  }
  // Hijri → Gregorian: estimate from today, then look for the day nearby
  function hToG(y, m, d) {
    var r = P.ymd(Date.now()), h0 = hOf(r.y, r.m, r.d);
    var est = Math.round(((y - h0.y) * 12 + (m - h0.m)) * 29.530589 + (d - h0.d));
    for (var k = 0; k <= 25; k++) for (var sg = -1; sg <= 1; sg += 2) {
      var dd = P.addDays(r.y, r.m, r.d, est + k * sg), h = hOf(dd.y, dd.m, dd.d);
      if (h.y === y && h.m === m && h.d === d) return dd;
    }
    return null;
  }
  function cvClamp() {
    var R = cv.from === 'g' ? CV_G : CV_H;
    cv.m = cv.m < 1 ? 12 : cv.m > 12 ? 1 : cv.m;
    cv.y = Math.max(R[0], Math.min(R[1], cv.y || R[0]));
    var dim = cv.from === 'g' ? new Date(Date.UTC(cv.y, cv.m, 0)).getUTCDate() : 30;
    cv.d = cv.d < 1 ? dim : cv.d > dim ? (cv.d === dim + 1 ? 1 : dim) : cv.d;
  }
  // the three wheels (day · month · year): scroll them (or Up / Down on the remote); the value in the middle band is chosen
  var cvSig = '', cvTimer = {};
  function cvValues(f) {
    var R = cv.from === 'g' ? CV_G : CV_H, out = [], k;
    if (f === 'd') { var dim = cv.from === 'g' ? new Date(Date.UTC(cv.y, cv.m, 0)).getUTCDate() : 30; for (k = 1; k <= dim; k++) out.push(k); }
    else if (f === 'm') for (k = 1; k <= 12; k++) out.push(k);
    else for (k = R[0]; k <= R[1]; k++) out.push(k);
    return out;
  }
  function cvLabel(f, v) { return f === 'm' ? v + ' · ' + (cv.from === 'g' ? G_MONTHS : H_MONTHS)[v - 1] : String(v); }
  function cvBuild() {
    var keep = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.wf : '';
    $('cv-fields').innerHTML = [['d', 'اليوم'], ['m', 'الشهر'], ['y', 'السنة']].map(function (x) {
      return '<div class="cv-f cv-f-' + x[0] + '"><span class="muted">' + x[1] + '</span><div class="cv-wrap">' +
        '<div class="cv-wheel f" tabindex="0" data-wf="' + x[0] + '"><div class="cv-pad"></div>' +
        cvValues(x[0]).map(function (v) { return '<div class="cv-it" data-v="' + v + '">' + cvLabel(x[0], v) + '</div>'; }).join('') +
        '<div class="cv-pad"></div></div></div></div>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.cv-wheel'), function (w) {
      cvPlace(w);
      w.addEventListener('scroll', function () {
        cvMark(w);
        clearTimeout(cvTimer[w.dataset.wf]);
        cvTimer[w.dataset.wf] = setTimeout(function () { cvSettle(w); }, 140);
      }, { passive: true });
    });
    if (keep) { var k = document.querySelector('.cv-wheel[data-wf="' + keep + '"]'); if (k) k.focus(); }
  }
  function cvItemH(w) { var it = w.querySelector('.cv-it'); return it ? it.offsetHeight : 1; }
  function cvPlace(w) {
    var vals = cvValues(w.dataset.wf), i = Math.max(0, vals.indexOf(cv[w.dataset.wf]));
    w.scrollTop = i * cvItemH(w);
    cvMark(w);
  }
  function cvMark(w) {
    var i = Math.round(w.scrollTop / cvItemH(w));
    Array.prototype.forEach.call(w.querySelectorAll('.cv-it'), function (it, k) { it.classList.toggle('sel', k === i); });
  }
  function cvSettle(w) {
    var vals = cvValues(w.dataset.wf), i = Math.max(0, Math.min(vals.length - 1, Math.round(w.scrollTop / cvItemH(w))));
    if (cv[w.dataset.wf] === vals[i]) return;
    cv[w.dataset.wf] = vals[i];
    cvRender(false);
  }
  // remote: Up / Down on a wheel
  function cvKey(w, dir) {
    var vals = cvValues(w.dataset.wf), i = vals.indexOf(cv[w.dataset.wf]) + dir;
    if (i < 0 || i >= vals.length) return;
    cv[w.dataset.wf] = vals[i];
    cvRender(false);
    cvPlace(w);
  }
  function cvRender(rebuild) {
    cvClamp();
    var sig = cv.from + '|' + cvValues('d').length;
    if (rebuild !== false || sig !== cvSig) { cvSig = sig; cvBuild(); }
    var g = null, h = null, bad = '';
    if (cv.from === 'g') { g = { y: cv.y, m: cv.m, d: cv.d }; h = hOf(g.y, g.m, g.d); }
    else {
      g = hToG(cv.y, cv.m, cv.d);
      if (g) h = { y: cv.y, m: cv.m, d: cv.d };
      else bad = 'شهر ' + H_MONTHS[cv.m - 1] + ' ' + cv.y + ' هـ تسعة وعشرون يومًا';
    }
    $('cv-g').classList.toggle('on', cv.from === 'g');
    $('cv-h').classList.toggle('on', cv.from === 'h');
    if (!g || !h) { $('cv-out').innerHTML = '<div class="cv-day muted">' + bad + '</div>'; return; }
    var r = P.ymd(Date.now()), n = daysTo(g, r), dow = new Date(Date.UTC(g.y, g.m - 1, g.d)).getUTCDay();
    var when = n === 0 ? 'اليوم' : n === 1 ? 'غدًا' : n === -1 ? 'أمس' : n === 2 ? 'بعد غد' : n === -2 ? 'قبل يومين' :
      (n > 0 ? 'بعد ' : 'قبل ') + countWord(Math.abs(n), '', '', 'أيام', 'يومًا');
    var big = cv.from === 'g' ? h.d + ' ' + H_MONTHS[h.m - 1] + ' ' + h.y + ' هـ' : g.d + ' ' + G_MONTHS[g.m - 1] + ' ' + g.y + ' م';
    var num = cv.from === 'g' ? fd(h.d, h.m, h.y) : fd(g.d, g.m, g.y);
    var sn = seasonOfDay(P.noonOf(g.y, g.m, g.d));
    $('cv-out').innerHTML = '<div class="cv-day">' + DAY_NAMES[dow] + '</div><div class="cv-big">' + big + '</div>' +
      '<div class="cv-num">' + num + '</div><div class="muted cv-when">' + when + (sn ? ' · ' + sn[1] : '') + '</div>';
  }

  // ---------- timers: the time since (or until) a date, in the unit chosen; also as home-screen widgets ----------
  // three ways to count; an older timer keeps its own unit (minutes, hours, work days, weeks) as a fourth choice
  var T_UNITS = [['timer', 'سنوات وأيام'], ['days', 'أيام'], ['months', 'أشهر']];
  var T_OLD = { minutes: 'دقائق', hours: 'ساعات', workdays: 'أيام عمل', weeks: 'أسابيع' };
  var T_COLORS = { white: '#FFFFFF', navy: '#1E2A78', pink: '#C2185B', green: '#2E7D5B', gold: '#A8792A', black: '#16181B' };
  var T_COLOR_NAMES = [['white', 'أبيض'], ['navy', 'كحلي'], ['pink', 'فوشيا'], ['green', 'أخضر'], ['gold', 'ذهبي'], ['black', 'أسود']];
  function tAt(x) { return Date.UTC(x.y, x.m - 1, x.d, x.h >= 0 ? x.h : 0, x.h >= 0 ? x.mi : 0) - P.offH(Date.UTC(x.y, x.m - 1, x.d, 12)) * HR; }
  // the counted parts: [[number, unit word], …] (Arabic number agreement)
  function tW(n, one, two, few, many) { return n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many; }
  function tParts(x, now) {
    var at = tAt(x), from = Math.min(at, now), to = Math.max(at, now), ms = to - from, out = [];
    var DAY = 86400000;
    if (x.unit === 'minutes') return [[Math.floor(ms / MIN), tW(Math.floor(ms / MIN), 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة')]];
    if (x.unit === 'hours') return [[Math.floor(ms / HR), tW(Math.floor(ms / HR), 'ساعة', 'ساعتان', 'ساعات', 'ساعة')]];
    if (x.unit === 'days') { var dd = Math.floor(ms / DAY); return [[dd, tW(dd, 'يوم', 'يومان', 'أيام', 'يومًا')]]; }
    if (x.unit === 'weeks') { var ww = Math.floor(ms / DAY / 7); return [[ww, tW(ww, 'أسبوع', 'أسبوعان', 'أسابيع', 'أسبوعًا')]]; }
    if (x.unit === 'workdays') {
      // Sunday to Thursday (the Saudi working week), the days between
      var a = new Date(from + P.offH(from) * HR), b = new Date(to + P.offH(to) * HR), n = 0;
      var da = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()), db = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
      var days = Math.round((db - da) / DAY), wk = Math.floor(days / 7); n = wk * 5;
      for (var k = 1; k <= days % 7; k++) { var dw = new Date(da + (wk * 7 + k) * DAY).getUTCDay(); if (dw !== 5 && dw !== 6) n++; }
      return [[n, tW(n, 'يوم عمل', 'يوما عمل', 'أيام عمل', 'يوم عمل')]];
    }
    // whole months / years by the calendar, then what is left
    var f = new Date(from + P.offH(from) * HR), t = new Date(to + P.offH(to) * HR);
    var months = (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + t.getUTCMonth() - f.getUTCMonth();
    var addM = function (m) { var d = new Date(f.getTime()); d.setUTCMonth(d.getUTCMonth() + m); return d; };
    if (addM(months) > t) months--;
    if (x.unit === 'months') return [[months, tW(months, 'شهر', 'شهران', 'أشهر', 'شهرًا')]];
    var years = Math.floor(months / 12), rest = t - addM(years * 12);
    var D = Math.floor(rest / DAY), H = Math.floor(rest % DAY / HR), M = Math.floor(rest % HR / MIN);
    if (years) out.push([years, tW(years, 'سنة', 'سنتان', 'سنوات', 'سنة')]);
    if (years || D) out.push([D, tW(D, 'يوم', 'يومان', 'أيام', 'يومًا')]);
    out.push([H, tW(H, 'ساعة', 'ساعتان', 'ساعات', 'ساعة')]);
    out.push([M, tW(M, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة')]);
    return out;
  }
  function tLine(x, now) {
    var past = tAt(x) <= now;
    return (past ? 'منذ ' : 'حتى ') + x.name + (x.showDate ? ' · ' + fd(x.d, x.m, x.y) + (x.h >= 0 ? ' · ' + pad2(x.h) + ':' + pad2(x.mi) : '') : '');
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function tInk(c) { return c === 'white' ? '#3A3A3A' : '#FFFFFF'; }
  var RIP = { m: ['اللهم اغفر له وارحمه، وعافه واعفُ عنه', 'رواه مسلم'], f: ['اللهم اغفر لها وارحمها، وعافها واعفُ عنها', 'رواه مسلم'] };
  function tYears(n) { return n === 1 ? 'سنة' : n === 2 ? 'سنتان' : n <= 10 ? n + ' سنوات' : n + ' سنة'; }
  function tIn(n) { return n === 0 ? 'اليوم' : n === 1 ? 'غدًا' : 'بعد ' + countWord(n, 'يوم', 'يومين', 'أيام', 'يومًا'); }
  function tNum(n) { return n.toLocaleString('en-US'); }
  // the Hijri date, and the time since it in Hijri years and months
  function tHijri(x, past) {
    var h = hOf(x.y, x.m, x.d), out = h.d + ' ' + H_MONTHS[h.m - 1] + ' ' + h.y + ' هـ';
    if (!past) return out;
    var r = P.ymd(Date.now()), t = hOf(r.y, r.m, r.d), yy = t.y - h.y, mm = t.m - h.m;
    if (t.d < h.d) mm--;
    if (mm < 0) { yy--; mm += 12; }
    if (yy >= 1) out += ' · بالهجري ' + tYears(yy) + (mm ? ' و' + countWord(mm, 'شهر', 'شهران', 'أشهر', 'شهرًا') : '');
    return out;
  }
  // the next anniversary of a past date: «تكتمل 43 سنة بعد 131 يومًا · 6 مارس»
  function tAnnivObj(x) {
    var r = P.ymd(Date.now()), y = r.y;
    if (x.m < r.m || (x.m === r.m && x.d < r.d)) y++;
    var n = y - x.y;
    if (n < 1) return null;
    var d = x.m === 2 && x.d === 29 && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1 ? 1 : x.d, m = d === 1 && x.d === 29 ? 3 : x.m;
    return { t: 'تكتمل ' + tYears(n), at: P.noonOf(y, m, d), date: d + ' ' + G_MONTHS[m - 1] + ' ' + y, left: daysTo({ y: y, m: m, d: d }, r) };
  }
  function tAnniv(x) {
    var o = tAnnivObj(x);
    return !o ? '' : o.left === 0 ? 'اليوم ' + o.t : o.t + ' ' + tIn(o.left) + ' · ' + o.date;
  }
  function tCount(x, now) { return tParts(x, now).map(function (p) { return '<b>' + (p[0] >= 10000 ? tNum(p[0]) : p[0]) + '</b><small>' + p[1] + '</small>'; }).join(' '); }
  // the timers tab: each card shows the count and one line; a tap opens its editor (with the Hijri date and the
  // next anniversary at the top); the editor and the widget settings open as full-screen sheets
  var tEdit = null, tPin = null; // the timer being edited (a copy) · a new timer widget (the ticked timers)
  function tGDate(y, m, d) { return d + ' ' + G_MONTHS[m - 1] + ' ' + y; }
  function tCard(x, i, now, preview) {
    var past = tAt(x) <= now, an = past && !x.rip ? tAnnivObj(x) : null;
    var chip = !preview && an && an.left <= 7 ? '<span class="tm-chip">' + (an.left === 0 ? 'اليوم ' + an.t : tIn(an.left) + ' ' + an.t) + '</span>' : '';
    var head = '<span class="tm-num">' + tCount(x, now) + '</span>' +
      '<span class="tm-line">' + esc(x.name ? tLine(x, now) : (past ? 'منذ …' : 'حتى …')) + '</span>' + chip +
      (x.rip ? '<span class="tm-dua">«' + RIP[x.rip][0] + '» <small>' + RIP[x.rip][1] + '</small></span>' : '');
    return '<div class="tm-card' + (x.color === 'white' ? ' tm-light' : '') + '" style="background:' + T_COLORS[x.color] + ';color:' + tInk(x.color) + '">' +
      (preview ? '<div class="tm-head">' + head + '</div>' : '<button class="tm-head f" data-tm="' + i + '">' + head + '</button>') + '</div>';
  }
  // above the editor's fields: the Hijri date and the next anniversary (or the day of a coming date)
  function tInfo(x) {
    var past = tAt(x) <= Date.now(), an = past && !x.rip ? tAnnivObj(x) : null, r = [['الهجري', tHijri(x, past)]];
    if (an) r.push(['الذكرى القادمة', (an.left === 0 ? 'اليوم ' + an.t : an.t + ' ' + tIn(an.left)) + ' · ' + an.date]);
    if (!past) r.push(['الموعد', DAY_NAMES[new Date(Date.UTC(x.y, x.m - 1, x.d)).getUTCDay()] + ' ' + tGDate(x.y, x.m, x.d)]);
    return r.map(function (q) { return '<div class="tm-row"><span>' + q[0] + '</span><b>' + esc(q[1]) + '</b></div>'; }).join('');
  }
  // the count stays on one line: smaller when it is long
  function tFit(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('.tm-num'), function (el) {
      el.style.fontSize = '';
      var b = parseFloat(getComputedStyle(el).fontSize), f = b;
      while (el.scrollWidth > el.clientWidth + 1 && f > b * .6) { f -= b * .08; el.style.fontSize = f + 'px'; }
    });
  }
  function timersRender() {
    var now = Date.now();
    $('timers-list').innerHTML = S.timers.map(function (x, i) { return tCard(x, i, now); }).join('');
    tFit($('timers-list'));
    tSheetRender();
  }
  function tTick() {
    if (screen !== 'timers') return;
    var now = Date.now();
    Array.prototype.forEach.call(document.querySelectorAll('#timers-list .tm-head'), function (c) {
      var x = S.timers[+c.dataset.tm]; if (!x) return;
      var html = tCount(x, now), n = c.querySelector('.tm-num');
      if (n.innerHTML !== html) { n.innerHTML = html; tFit(c); }
    });
    if (tEdit) { var pv = document.querySelector('#tm-sheet .tm-preview'); if (pv) { var h = tCount(tEdit, now), n2 = pv.querySelector('.tm-num'); if (n2 && n2.innerHTML !== h) { n2.innerHTML = h; tFit(pv); } } }
  }
  // the sheet: the editor or the widget settings, over the whole screen
  function tSheetRender() {
    var sh = $('tm-sheet');
    if (!tEdit && !tPin) { sh.classList.add('hidden'); sh.innerHTML = ''; return; }
    sh.classList.remove('hidden');
    if (tEdit) tEditRender(sh); else tPinRender(sh);
  }
  function tSeg(key, opts, cur, cls) {
    return '<div class="tm-seg' + (cls ? ' ' + cls : '') + '">' + opts.map(function (o) {
      return '<button class="f' + (cur === o[0] ? ' on' : '') + '" data-tk="' + key + '-' + o[0] + '"' + (o[2] ? ' aria-label="' + o[2] + '"' : '') + '>' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function tSwitch(attr, on, label) {
    return '<button class="tm-switch f' + (on ? ' on' : '') + '" ' + attr + ' role="switch" aria-checked="' + on + '"><span>' + label + '</span><i></i></button>';
  }
  function tEditRender(sh) {
    var x = tEdit, date = x.y + '-' + pad2(x.m) + '-' + pad2(x.d), time = x.h >= 0 ? pad2(x.h) + ':' + pad2(x.mi) : '';
    sh.innerHTML = '<div class="tm-bar"><button class="f" data-tk="cancel">إلغاء</button><b>' + (x.isNew ? 'عدّاد جديد' : 'تعديل العدّاد') + '</b>' +
      '<button class="gold-btn f" data-tk="save">حفظ</button></div>' +
      '<div class="tm-sheet-body">' +
      '<div class="tm-preview">' + tCard(x, -1, Date.now(), true) + '</div>' +
      '<div class="tm-rows">' + tInfo(x) + '</div>' +
      '<label class="tm-lbl" for="tm-name">الاسم</label><input id="tm-name" class="inp f" maxlength="30" placeholder="مثل: إجازة الصيف" value="' + esc(x.name) + '">' +
      '<div class="tm-two"><div><label class="tm-lbl" for="tm-date">التاريخ</label><input id="tm-date" class="inp f" type="date" value="' + date + '"></div>' +
      '<div><label class="tm-lbl" for="tm-time">الوقت (اختياري)</label><div class="tm-timebox"><input id="tm-time" class="inp f" type="time" value="' + time + '">' +
      (time ? '<button class="tm-x f" data-tk="notime" aria-label="بلا وقت">×</button>' : '') + '</div></div></div>' +
      '<div class="tm-lbl">طريقة العدّ</div>' + tSeg('unit', T_UNITS.concat(T_OLD[x.unit] ? [[x.unit, T_OLD[x.unit]]] : []), x.unit) +
      '<div class="tm-lbl">اللون</div><div class="tm-swatches">' + T_COLOR_NAMES.map(function (c) {
        return '<button class="tm-dot f' + (x.color === c[0] ? ' on' : '') + '" data-tk="color-' + c[0] + '" aria-label="' + c[1] + '" style="background:' + T_COLORS[c[0]] + '"></button>';
      }).join('') + '</div>' +
      tSwitch('data-tk="showdate"', x.showDate, 'إظهار التاريخ تحت العدّ') +
      '<div class="tm-lbl">دعاء للراحل</div>' + tSeg('rip', [['', 'بلا'], ['m', 'له'], ['f', 'لها']], x.rip || '') +
      (x.isNew ? '' : '<button class="tm-del f" data-tk="del">حذف العدّاد</button>') + '</div>';
    tFit(sh);
  }
  var TW_LINES = [['name', 'الاسم والتاريخ'], ['dua', 'الدعاء للراحل']];
  // «+ ويدجت»: tick timers (and occasions), then the phone asks «إضافة؟» and puts the widget on the home screen
  function tPinItems() {
    var seen = {}, out = S.timers.map(function (x) { return ['t:' + x.id, x.name]; });
    allEvents(P.ymd(Date.now())).forEach(function (e) { if (!seen[e.name]) { seen[e.name] = 1; out.push(['e:' + e.name, e.name]); } });
    return out;
  }
  function tPinRender(sh) {
    sh.innerHTML = '<div class="tm-bar"><button class="f" data-tp="cancel">إلغاء</button><b>ويدجت جديد</b>' +
      '<button class="gold-btn f" data-tp="go">ضعه على الشاشة</button></div>' +
      '<div class="tm-sheet-body"><p class="muted tm-note">ضع ✓ على عدّاد واحد (يثبت) أو أكثر (يتقلّب كل 5 ثوانٍ)، ثم «ضعه على الشاشة» واضغط «إضافة» في رسالة الجوال.</p>' +
      tPinItems().map(function (o, i) { return tSwitch('data-tp="' + i + '"', !!tPin.keys[o[0]], esc(o[1])); }).join('') +
      (tPin.msg ? '<p class="tm-note tm-warn">' + tPin.msg + '</p>' : '') + '</div>';
  }
  function tPinAction(k) {
    if (k === 'cancel') { tPin = null; tSheetRender(); wgFocus('timer'); return; }
    var items = tPinItems();
    if (k === 'go') {
      var keys = items.filter(function (o) { return tPin.keys[o[0]]; }).map(function (o) { return o[0]; }), r = 'no';
      if (!keys.length) tPin.msg = 'اختر عدّادًا واحدًا على الأقل';
      else {
        try { r = A && A.pinWidget ? A.pinWidget('timer', keys.join('\n')) : 'no'; } catch (e) {}
        if (r === 'ok') { tPin = null; tSheetRender(); wgFocus('timer'); return; }
        tPin.msg = 'جوالك لا يسمح بالإضافة من التطبيق: اضغط مطولًا على الشاشة الرئيسية ← الأدوات ← مواقيت الصلاة ← «عدّاد».';
      }
    } else { var o = items[+k]; if (o) tPin.keys[o[0]] = !tPin.keys[o[0]]; }
    var sh = $('tm-sheet'), st = sh.scrollTop;
    tSheetRender(); sh.scrollTop = st;
    var b = document.querySelector('#tm-sheet [data-tp="' + k + '"]'); if (b) b.focus();
  }
  function tReadForm() {
    if (!tEdit || !$('tm-name')) return;
    tEdit.name = ($('tm-name').value || '').trim();
    var d = ($('tm-date').value || '').split('-');
    if (d.length === 3 && +d[0]) { tEdit.y = +d[0]; tEdit.m = +d[1]; tEdit.d = +d[2]; }
    var tm = ($('tm-time').value || '').split(':');
    if (tm.length >= 2 && tm[0] !== '') { tEdit.h = +tm[0]; tEdit.mi = +tm[1]; }
  }
  // typing in the editor: the preview follows
  function tPreview() {
    tReadForm();
    var pv = document.querySelector('#tm-sheet .tm-preview');
    if (pv) { pv.innerHTML = tCard(tEdit, -1, Date.now(), true); tFit(pv); }
  }
  function tOpenEditor(x) { tEdit = x; tSheetRender(); var n = $('tm-name'); if (n) (x.isNew ? n : document.querySelector('#tm-sheet [data-tk="save"]')).focus(); }
  function tClose() { var back = tEdit && !tEdit.isNew ? S.timers.map(function (t) { return t.id; }).indexOf(tEdit.id) : -1; tEdit = null; timersRender(); var b = back >= 0 && document.querySelector('#timers-list [data-tm="' + back + '"]'); if (b) b.focus(); }
  function tAction(k) {
    tReadForm();
    var p = k.split('-');
    if (p[0] === 'unit') tEdit.unit = p[1];
    else if (p[0] === 'color') tEdit.color = p[1];
    else if (p[0] === 'rip') tEdit.rip = p[1] || '';
    else if (k === 'showdate') tEdit.showDate = !tEdit.showDate;
    else if (k === 'notime') { tEdit.h = -1; tEdit.mi = 0; }
    else if (k === 'cancel') { tClose(); return; }
    else if (k === 'del') {
      // a second press confirms (the phone's WebView shows no confirm box)
      var db = document.querySelector('#tm-sheet [data-tk="del"]');
      if (db && !db.classList.contains('sure')) { db.classList.add('sure'); db.textContent = 'اضغط مرة أخرى لحذف «' + tEdit.name + '»'; return; }
      S.timers = S.timers.filter(function (x) { return x.id !== tEdit.id; }); save(); sendWidget(); tEdit = null; timersRender(); return;
    }
    else if (k === 'save') {
      if (!tEdit.name) { $('tm-name').focus(); return; }
      var x = Object.assign({}, tEdit); delete x.isNew;
      var i = S.timers.map(function (t) { return t.id; }).indexOf(x.id);
      if (i >= 0) S.timers[i] = x; else S.timers.push(x);
      save(); sendWidget(); tClose(); return;
    }
    var sh = $('tm-sheet'), st = sh.scrollTop;
    tSheetRender(); sh.scrollTop = st;
    var b = document.querySelector('#tm-sheet [data-tk="' + k + '"]'); if (b) b.focus();
  }

  // ---------- the «الويدجت» screen (phone): each home-screen widget with a live preview, a button to put it there,
  // and its own look; the timer widget's choices too ----------
  var WG_KINDS = [['prayer', 'مواقيت اليوم', '4×2'], ['ring', 'الصلاة القادمة (دائرة)', '2×2'], ['strip', 'شريط الصلاة القادمة', '4×1'],
    ['timer', 'عدّاد', '4×1'], ['event', 'عدّاد المناسبة', '2×2'], ['month', 'الشهر الهجري', '4×4'], ['convert', 'تحويل التاريخ', '1×1']];
  var WG_BG = [['#2E2A6B', '#B0688F'], ['#1A5DAE', '#4AA6DC'], ['#7E3F14', '#CF8A2E'], ['#43195A', '#C9544A'], ['#0A1030', '#2B3070']];
  var WG_ACC = { gold: '#F2CF8A', white: '#FFFFFF', green: '#8FE3A8', sky: '#8FD3FF' }, WG_SC = { s: .88, m: 1, l: 1.15 };
  var wgEdit = '', wgMsg = {};
  function wgPlaced() { try { return A && A.placedWidgets ? JSON.parse(A.placedWidgets()) : {}; } catch (e) { return {}; } }
  function wgFocus(k, what) { var b = document.querySelector('[data-' + (what || 'wgp') + '="' + k + '"]'); if (b) b.focus(); }
  // what the widgets show now: the next time, the one before, the countdown, the dates, the nearest occasion
  function wgNow(t) {
    var r = P.ymd(t), T = P.dayTimes(r.y, r.m, r.d, S.offsets), at = ORDER.map(function (k) { return T.at[k]; }), next = -1, nextAt, prevAt;
    for (var i = 0; i < 6; i++) if (at[i] > t) { next = i; break; }
    if (next < 0) { var tm = P.addDays(r.y, r.m, r.d, 1); next = 0; nextAt = P.dayTimes(tm.y, tm.m, tm.d, S.offsets).at.fajr; prevAt = at[5]; }
    else { nextAt = at[next]; var ym = P.addDays(r.y, r.m, r.d, -1); prevAt = next ? at[next - 1] : P.dayTimes(ym.y, ym.m, ym.d, S.offsets).at.isha; }
    var left = Math.max(0, Math.floor((nextAt - t) / 1000)), h = hOf(r.y, r.m, r.d), ev = allEvents(r)[0];
    return { r: r, T: T, at: at, next: next, nextAt: nextAt, cur: (next + 5) % 6, names: ORDER.map(function (k) { return P.name(k, T.friday); }),
      cd: Math.floor(left / 3600) + ':' + pad2(Math.floor(left % 3600 / 60)) + ':' + pad2(left % 60),
      prog: Math.round(100 * Math.min(1, Math.max(0, (t - prevAt) / Math.max(1, nextAt - prevAt)))),
      per: next === 1 ? 0 : next === 2 || next === 3 ? 1 : next === 4 ? 2 : next === 5 ? 3 : 4,
      h: h, hijri: h.d + ' ' + H_MONTHS[h.m - 1] + ' (' + h.m + ') ' + h.y + ' هـ', greg: fGFull.format(new Date(t)).replace('،', ''),
      ev: ev ? { name: ev.name, left: ev.left } : null };
  }
  function wgLook(k) { var W = S.wstyle[k]; return { bg: W.bg === 'dark' ? 'rgba(20,26,36,.95)' : null, o: (100 - W.clear) / 100, a: WG_ACC[W.accent] || WG_ACC.gold, k: WG_SC[W.font] || 1, W: W }; }
  function wgBox(k, L, n, inner, cls) {
    return '<div class="wgp wgp-' + k + (cls ? ' ' + cls : '') + '" style="--a:' + L.a + ';--k:' + L.k + '"><i class="wgp-bg" style="background:' +
      (L.bg || 'linear-gradient(135deg,' + WG_BG[n.per][0] + ',' + WG_BG[n.per][1] + ')') + ';opacity:' + L.o + '"></i>' + inner + '</div>';
  }
  function wgInDays(n) { return n === 0 ? 'اليوم' : n === 1 ? 'غدًا' : n === 2 ? 'بعد يومين' : n <= 10 ? 'بعد ' + n + ' أيام' : 'بعد ' + n + ' يومًا'; }
  function wgPreview(k, t) {
    var n = wgNow(t);
    if (k === 'prayer') {
      var L = wgLook(k), W = L.W;
      return wgBox(k, L, n, '<div class="wgp-top"><div class="wgp-nx">' + (W.city ? '<small>' + esc(S.loc.name) + '</small>' : '') +
        '<div><b class="wgp-big">' + n.names[n.next] + '</b> <span>' + P.full(n.nextAt) + '</span></div></div>' +
        (n.ev ? '<div class="wgp-ev"><b>' + esc(n.ev.name) + '</b><span>' + wgInDays(n.ev.left) + '</span></div>' : '<div></div>') +
        '<div class="wgp-cd"><small>متبقٍّ</small><b class="ltr">' + n.cd + '</b></div></div>' +
        (W.prog ? '<div class="wgp-bar"><i style="width:' + n.prog + '%"></i></div>' : '') +
        '<div class="wgp-cols">' + n.names.map(function (nm, i) {
          return '<div class="' + (i === n.next ? 'on' : '') + (i === n.cur ? ' now' : '') + '"><small>' + nm + '</small><b>' + P.full(n.at[i]) + '</b></div>';
        }).join('') + '</div>' + (W.line ? '<div class="wgp-line">«سبحان الله وبحمده، سبحان الله العظيم»</div>' : '') +
        (W.date ? '<div class="wgp-foot"><span>' + n.greg + '</span><span>' + moonSvg(n.h.d) + n.hijri + '</span></div>' : ''));
    }
    if (k === 'ring') {
      var L2 = wgLook(k);
      return wgBox(k, L2, n, '<div class="wgp-arc" style="background:conic-gradient(var(--a) ' + n.prog + '%, rgba(255,255,255,.22) 0)"></div>' +
        '<div class="wgp-in"><b>' + n.names[n.next] + '</b><span class="wgp-c ltr">' + n.cd + '</span><small>' + P.full(n.nextAt) + '</small></div>', 'wgp-round');
    }
    if (k === 'strip') {
      var L3 = wgLook(k);
      return wgBox(k, L3, n, '<span class="wgp-h">' + moonSvg(n.h.d) + n.hijri + '</span><span><b>' + n.names[n.next] + '</b> ' + P.full(n.nextAt) + '</span><b class="wgp-c ltr">' + n.cd + '</b>');
    }
    if (k === 'convert') {
      var L4 = wgLook(k);
      return wgBox(k, L4, n, '<b class="wgp-c">' + n.h.d + '</b><span>هجري</span>');
    }
    if (k === 'month') {
      var L5 = wgLook(k), cells = '', first = null;
      for (var i = -30; i <= 30; i++) {
        var dd = P.addDays(n.r.y, n.r.m, n.r.d, i), hh = hOf(dd.y, dd.m, dd.d);
        if (hh.y !== n.h.y || hh.m !== n.h.m) continue;
        if (!first) { first = dd; for (var e = 0; e < new Date(Date.UTC(dd.y, dd.m - 1, dd.d)).getUTCDay(); e++) cells += '<i></i>'; }
        cells += '<i class="' + (i === 0 ? 'on' : '') + '"><b>' + hh.d + '</b><small>' + dd.d + '</small></i>';
      }
      return wgBox(k, L5, n, '<div class="wgp-mt">' + H_MONTHS[n.h.m - 1] + ' ' + n.h.y + ' هـ</div><div class="wgp-grid">' +
        ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map(function (x) { return '<em>' + x + '</em>'; }).join('') + cells + '</div>');
    }
    if (k === 'event') {
      return '<div class="wgp wgp-event">' + (n.ev ? '<div><b class="wgp-c">' + (n.ev.left || 'اليوم') + '</b> <span>' + (n.ev.left ? n.ev.left >= 3 && n.ev.left <= 10 ? 'أيام' : 'يوم' : '') + '</span></div><span>' + esc(n.ev.name) + '</span>' : '<span>لا توجد مناسبة</span>') + '</div>';
    }
    // timer: the first timer chosen for a widget on the screen, or the first timer
    var x = S.timers[0], tw = S.timerWg, kk = { s: .8, m: 1, l: 1.25, xl: 1.5 }[tw.font] || 1;
    if (!x) return '<div class="wgp wgp-timer" style="background:#1E2A78;color:#fff"><b>أضف عدّادًا من تاب «العدّادات»</b></div>';
    var past = tAt(x) <= t;
    return '<div class="wgp wgp-timer" style="--k:' + kk + ';background:' + (T_COLORS[x.color] || '#1E2A78') + ';color:' + tInk(x.color) + '"><span class="wgp-c">' + tCount(x, t) + '</span>' +
      (tw.name !== false ? '<span>' + (past ? 'منذ ' : 'حتى ') + esc(x.name) + (x.showDate ? ' · ' + fd(x.d, x.m, x.y) : '') + '</span>' : '') +
      (tw.dua && x.rip ? '<small>«' + RIP[x.rip][0] + '»</small>' : '') + '</div>';
  }
  function wgRow(k, name, key, opts) {
    var W = k === 'timer' ? S.timerWg : S.wstyle[k];
    return '<div class="srow snd-row"><span class="sname">' + name + '</span><span class="snd-opts">' + opts.map(function (o) {
      var on = o[0] === 't' ? !!W[key] : String(W[key]) === String(o[0]);
      return '<button class="sbtn f' + (on ? ' on' : '') + '" data-wgs="' + k + '-' + key + '-' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</span></div>';
  }
  function wgSettings(k) {
    if (k === 'timer') {
      var placed = [];
      try { placed = A && A.timerWidgets ? JSON.parse(A.timerWidgets()) : []; } catch (e) {}
      return wgRow(k, 'حجم الخط', 'font', [['s', 'صغير'], ['m', 'عادي'], ['l', 'كبير'], ['xl', 'كبير جدًا']]) +
        '<div class="srow snd-row"><span class="sname">يظهر تحت العدّ</span><span class="snd-opts">' + TW_LINES.map(function (o) {
          return '<button class="sbtn f' + (S.timerWg[o[0]] ? ' on' : '') + '" data-wgs="timer-' + o[0] + '-t">' + o[1] + '</button>';
        }).join('') + '</span></div>' +
        placed.map(function (p, i) {
          return '<div class="tm-pick"><span>الويدجت ' + (i + 1) + '</span><select class="inp f tw-sel" data-twid="' + p.id + '">' +
            S.timers.map(function (x) { return '<option value="' + x.id + '"' + (p.n === 1 && x.id === p.timer ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') +
            (p.n > 1 ? '<option value="" selected>' + countWord(p.n, 'عدّاد واحد', 'عدّادان', 'عدّادات', 'عدّادًا') + ' تتقلّب</option>' :
              S.timers.some(function (x) { return x.id === p.timer; }) ? '' : '<option value="" selected>— اختر —</option>') + '</select></div>';
        }).join('') + '<p class="muted set-note">لون كل عدّاد يُختار من تاب «العدّادات». لتغيير عدّادات ويدجت يتقلّب: اضغط عليه مطولًا ← الإعدادات.</p>';
    }
    return wgRow(k, 'الخلفية', 'bg', [['time', 'لون حسب الوقت'], ['dark', 'داكن']]) +
      wgRow(k, 'الشفافية', 'clear', [[0, '0%'], [25, '25%'], [50, '50%'], [75, '75%'], [100, '100%']]) +
      wgRow(k, 'حجم الخط', 'font', [['s', 'صغير'], ['m', 'عادي'], ['l', 'كبير']]) +
      wgRow(k, 'لون التمييز', 'accent', [['gold', 'ذهبي'], ['white', 'أبيض'], ['green', 'أخضر'], ['sky', 'سماوي']]) +
      (k === 'prayer' ? '<div class="srow snd-row"><span class="sname">يظهر فيه</span><span class="snd-opts">' +
        [['city', 'المدينة'], ['prog', 'شريط التقدّم'], ['line', 'السطر المتبدّل'], ['date', 'التاريخ']].map(function (o) {
          return '<button class="sbtn f' + (S.wstyle.prayer[o[0]] ? ' on' : '') + '" data-wgs="prayer-' + o[0] + '-t">' + o[1] + '</button>';
        }).join('') + '</span></div>' : '');
  }
  function wgRender() {
    var on = wgPlaced(), t = Date.now();
    $('wg-body').innerHTML = WG_KINDS.map(function (w) {
      var k = w[0], c = on[k] || 0, open = wgEdit === k;
      return '<div class="card wg-card" id="wg-' + k + '"><div class="wg-head"><b>' + w[1] + '</b><span class="muted ltr">' + w[2] + '</span>' +
        (c ? '<span class="wg-on">على شاشتك ✓' + (c > 1 ? ' (' + c + ')' : '') + '</span>' : '') + '</div>' +
        '<div class="wg-stage">' + wgPreview(k, t) + '</div>' +
        '<div class="wg-btns">' + (A && A.pinWidget ? '<button class="gold-btn f" data-wgp="' + k + '">ضعه على الشاشة</button>' : '') +
        (k !== 'event' ? '<button class="pill f" data-wge="' + k + '">' + (open ? 'تم' : 'تعديل الشكل') + '</button>' : '') + '</div>' +
        (wgMsg[k] ? '<p class="set-note ' + (wgMsg[k].bad ? 'tm-warn' : 'muted') + '">' + wgMsg[k].text + '</p>' : '') +
        (open ? '<div class="wg-set">' + wgSettings(k) + '</div>' : '') + '</div>';
    }).join('');
  }
  function wgSet(v) {
    var p = v.split('-'), k = p[0], key = p[1], val = p[2], W = k === 'timer' ? S.timerWg : S.wstyle[k];
    if (val === 't') W[key] = !W[key]; else W[key] = key === 'clear' ? +val : val;
    save(); sendWidget(); wgRender(); wgFocus(v, 'wgs');
  }
  function wgPin(k) {
    if (k === 'timer') { tPin = { keys: {}, msg: '' }; tEdit = null; tSheetRender(); var c0 = document.querySelector('#tm-sheet [data-tp="0"]'); if (c0) c0.focus(); return; }
    var r = 'no';
    try { r = A.pinWidget(k, ''); } catch (e) {}
    wgMsg = {}; wgMsg[k] = r === 'ok' ? { text: 'اضغط «إضافة» في رسالة الجوال' } : { bad: 1, text: 'جوالك لا يسمح بالإضافة من التطبيق: اضغط مطولًا على الشاشة الرئيسية ← الأدوات ← مواقيت الصلاة' };
    wgRender(); wgFocus(k);
  }

  // ---------- a message from the phone to the TV at home (same Wi-Fi): ready buttons or free text ----------
  var TV_QUICK = ['الأكل جاهز', 'تعالوا للصلاة', 'حان وقت النوم', 'أطفئوا التلفزيون', 'أنا في الطريق، وصلت قريبًا'];
  var tvOpen = false, tvState = '';
  function tvFrom() { return 'رسالة من ' + (fam().parent === 'mother' ? 'ماما' : 'بابا'); }
  function tvRender() {
    var sh = $('tv-sheet');
    if (!tvOpen) { sh.classList.add('hidden'); sh.innerHTML = ''; return; }
    sh.classList.remove('hidden');
    var msg = { send: 'جارٍ الإرسال…', ok: 'وصلت إلى التلفزيون ✓', none: 'لم أجد التلفزيون: تأكد أن الجوال والتلفزيون على نفس شبكة الواي فاي وأن «مواقيت الصلاة» مفتوح على التلفزيون مرة على الأقل.', fail: 'التلفزيون لم يرد، حاول مرة أخرى.' }[tvState] || '';
    sh.innerHTML = '<div class="tm-bar"><button class="f" data-tv="close">إغلاق</button><b>رسالة إلى التلفزيون</b><span></span></div>' +
      '<div class="tm-sheet-body"><div class="tv-quick">' + TV_QUICK.map(function (q, i) { return '<button class="pill f" data-tv="q' + i + '">' + q + '</button>'; }).join('') + '</div>' +
      '<label class="tm-lbl" for="tv-text">أو اكتب رسالتك</label><input id="tv-text" class="inp f" maxlength="120" placeholder="مثل: كل عام وأنتم بخير">' +
      '<button class="gold-btn f tv-send" data-tv="send">إرسال</button>' +
      (msg ? '<p class="tm-note' + (tvState === 'none' || tvState === 'fail' ? ' tm-warn' : '') + '">' + msg + '</p>' : '') + '</div>';
  }
  function tvSend(text) {
    text = (text || '').trim();
    if (!text || !A || !A.tvSend) return;
    tvState = 'send'; tvRender();
    try { A.tvSend(JSON.stringify({ t: tvFrom(), x: text }), 'msg'); } catch (e) { tvState = 'fail'; tvRender(); }
  }
  function tvAction(k) {
    if (k === 'close') { tvOpen = false; tvState = ''; tvRender(); $('tv-btn').focus(); return; }
    if (k === 'send') { tvSend($('tv-text').value); return; }
    if (k[0] === 'q') tvSend(TV_QUICK[+k.slice(1)]);
  }
  // ---------- the phone keeps the TV the same: occasions, family and its messages, timers, prayer settings ----------
  var SYNC_KEYS = ['events', 'autoEv', 'evCard', 'family', 'famMsgs', 'timers', 'offsets', 'iqMin', 'sound', 'hijriAdj'];
  var syncTimer = null, syncSending = '', syncState = '';
  function syncData() { var o = {}; SYNC_KEYS.forEach(function (k) { o[k] = S[k]; }); return JSON.stringify(o); }
  function syncLast() { try { return localStorage.getItem('prayertv-synced') || ''; } catch (e) { return ''; } }
  // a change on the phone: sent two seconds later (several changes go together); not sent again when nothing changed
  function syncSoon() { if (TV || !A || !A.tvSend) return; clearTimeout(syncTimer); syncTimer = setTimeout(function () { syncNow(false); }, 2000); }
  function syncNow(force) {
    if (TV || !A || !A.tvSend) return;
    var d = syncData();
    if (!force && d === syncLast()) return;
    syncSending = d; syncState = 'send';
    try { A.tvSend(JSON.stringify({ k: 'sync', s: JSON.parse(d) }), 'sync'); } catch (e) { syncState = 'fail'; }
  }
  function syncDone(r) {
    syncState = r;
    if (r === 'ok') { try { localStorage.setItem('prayertv-synced', syncSending); localStorage.setItem('prayertv-synced-at', String(Date.now())); } catch (e) {} }
    if (screen === 'settings') setRender();
  }
  // the TV: what a phone sent replaces the same settings here
  function syncTake() {
    var j = null;
    try { j = A && A.takeSync ? A.takeSync() : ''; } catch (e) {}
    if (!j) return;
    var o; try { o = JSON.parse(j); } catch (e) { return; }
    SYNC_KEYS.forEach(function (k) { if (o[k] !== undefined) S[k] = o[k]; });
    save();
    P.setIqamah(S.iqMin); P.setHijriAdj(S.hijriAdj);
    autoCache.key = ''; lastQ = ''; lastDay = '';
    tick();
    if (screen === 'settings') setRender();
  }
  // the TV: a message from a phone, on top of the screen for a minute (a press closes it)
  var msgTimer = null;
  function showMessage(title, text) {
    $('msg-title').textContent = title; $('msg-text').textContent = text;
    $('msg-pop').classList.remove('hidden');
    clearTimeout(msgTimer); msgTimer = setTimeout(function () { $('msg-pop').classList.add('hidden'); }, 60000);
  }

  // ---------- update from the settings: the latest release is downloaded and the installer opens ----------
  var upd = { latest: '', state: '', pct: 0, timer: null, asked: false };
  function myVersion() { try { return A && A.version ? 'v' + String(A.version()).split('.').pop() : ''; } catch (e) { return ''; } }
  function updMsg() {
    var mine = myVersion();
    var ver = mine ? 'عندك ' + mine + (upd.latest ? (upd.latest === mine ? ' · وهي الأحدث' : ' · الأحدث ' + upd.latest) : '') : 'dromaia.github.io/tv';
    var msg = { run: 'جارٍ التحميل… ' + upd.pct + '%', done: 'اكتمل التحميل، اضغط «تثبيت» في الصفحة التالية',
      fail: 'تعذّر التحميل، تأكد من الإنترنت وحاول مرة أخرى',
      perm: 'اسمح لـ«مواقيت الصلاة» بتثبيت التطبيقات (مصادر غير معروفة) ثم اضغط مرة أخرى' }[upd.state];
    $('upd-msg').innerHTML = ver + (msg ? ' <span class="muted">· ' + msg + '</span>' : '');
  }
  function updLatest() {
    if (upd.asked) return;
    upd.asked = true;
    fetch('https://api.github.com/repos/DrOmaia/prayer-tv/releases/latest').then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.tag_name) { upd.latest = j.tag_name; updMsg(); } }).catch(function () { upd.asked = false; });
  }
  function updStart() {
    if (!A || !A.updateStart) { window.open('https://dromaia.github.io/tv'); return; }
    if (upd.state === 'run') return;
    var r = A.updateStart();
    upd.state = r === 'ok' ? 'run' : r; upd.pct = 0; updMsg();
    if (r !== 'ok') return;
    clearInterval(upd.timer);
    upd.timer = setInterval(function () {
      var st = {};
      try { st = JSON.parse(A.updateStatus()); } catch (e) {}
      if (st.state === 'run') upd.pct = st.pct || 0;
      else {
        clearInterval(upd.timer);
        upd.state = st.state === 'done' ? 'done' : 'fail';
        if (upd.state === 'done') A.updateInstall();
      }
      updMsg();
    }, 1000);
  }

  // settings sections: the title opens its section and closes the others
  function setToggle(btn) {
    var sec = btn.parentNode, open = !sec.classList.contains('open');
    Array.prototype.forEach.call(document.querySelectorAll('#settings .set-sec'), function (x) {
      x.classList.toggle('open', x === sec && open);
      x.querySelector('.set-pm').textContent = x === sec && open ? '−' : '+';
    });
    btn.focus();
    if (open && btn.scrollIntoView) btn.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // ---------- the city: automatic (from the internet connection) or chosen by search (Open-Meteo geocoding) ----------
  var locResults = [], locMsg = '', locQ = '';
  function showCity() {
    $('w0-city').textContent = S.loc.name;
    $('w0-btn').setAttribute('aria-label', 'الطقس في ' + S.loc.name);
    $('set-sub').textContent = S.loc.name + ' · ' + P.method().name;
  }
  function applyLoc(loc) {
    var moved = Math.abs(loc.lat - S.loc.lat) + Math.abs(loc.lon - S.loc.lon) > 0.05 || loc.tz !== S.loc.tz;
    S.loc = loc; save();
    P.setLocation(loc); makeFormats();
    CITIES[0] = { name: loc.name, lat: loc.lat, lon: loc.lon };
    showCity();
    if (moved) {
      try { localStorage.removeItem('prayertv-w0'); } catch (e) {}
      WX[0] = null; loadWeather();
      autoCache.key = ''; lastDay = ''; tick();
    }
    if (screen === 'settings') setRender();
  }
  function geo(q) {
    return fetch('https://geocoding-api.open-meteo.com/v1/search?count=8&language=ar&format=json&name=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); }).then(function (j) { return j.results || []; });
  }
  function fromGeo(g, mode) {
    return { mode: mode, gps: false, name: g.name, country: g.country || '', lat: g.latitude, lon: g.longitude, tz: g.timezone, cc: (g.country_code || '').toUpperCase() };
  }
  function locSearch() {
    var q = ($('loc-q').value || '').trim();
    if (!q) { $('loc-q').focus(); return; }
    locQ = q;
    locMsg = 'جارٍ البحث…'; setRender();
    geo(q).then(function (list) {
      locResults = list.filter(function (g) { return g.timezone; });
      locMsg = locResults.length ? '' : 'لم أجد مدينة بهذا الاسم';
      setRender();
      var f = document.querySelector('[data-k="loc-0"]'); if (f) f.focus();
    }).catch(function () { locMsg = 'تعذّر البحث، تأكد من اتصال الإنترنت'; setRender(); });
  }
  // automatic on the phone: the phone's own location (asks once for permission); its Arabic city name and
  // time zone from the internet. If there is no position yet, the city of the internet connection meanwhile.
  var gpsTry = 0;
  function locateAuto(ask) {
    if (A && !TV && A.location) {
      var j = null;
      try {
        // the permission is asked once (and again when «تحديد تلقائي» is pressed)
        if (!A.locOk()) { if (ask || !S.gpsAsked) { S.gpsAsked = true; save(); A.askLoc(); } }
        else j = JSON.parse(A.location() || 'null');
      } catch (e) {}
      if (j && j.lat) {
        gpsTry = 0;
        Promise.all([
          fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + j.lat + '&longitude=' + j.lon + '&localityLanguage=ar').then(function (r) { return r.json(); }).catch(function () { return {}; }),
          fetch('https://api.open-meteo.com/v1/forecast?latitude=' + j.lat + '&longitude=' + j.lon + '&timezone=auto&current=temperature_2m').then(function (r) { return r.json(); })
        ]).then(function (res) {
          var g = res[0] || {}, tz = res[1] && res[1].timezone;
          if (!tz) throw 0;
          var loc = { mode: 'auto', gps: true, name: g.city || g.locality || g.principalSubdivision || S.loc.name, country: g.countryName || '', lat: +j.lat, lon: +j.lon, tz: tz, cc: (g.countryCode || '').toUpperCase() };
          if (S.loc.mode === 'auto') { locMsg = ''; applyLoc(loc); sendSchedule(); }
        }).catch(function () { locateIp(); });
        return;
      }
      // no position yet: try again shortly (the phone is looking for one), the internet's city meanwhile
      if (gpsTry++ < 3) setTimeout(function () { if (S.loc.mode === 'auto') locateAuto(); }, 8000);
    }
    locateIp();
  }
  // automatic: the city of the internet connection, its Arabic name from the geocoding service
  function locateIp() {
    if (S.loc.gps && S.loc.mode === 'auto') return; // keep the last position of the phone
    fetch('https://get.geojs.io/v1/ip/geo.json').then(function (r) { return r.json(); }).then(function (j) {
      var lat = +j.latitude, lon = +j.longitude;
      if (!j.timezone || isNaN(lat)) throw 0;
      var base = { mode: 'auto', name: j.city || j.region || j.country, country: j.country || '', lat: lat, lon: lon, tz: j.timezone, cc: (j.country_code || '').toUpperCase() };
      return geo(j.city || '').then(function (list) {
        var near = list.filter(function (g) { return Math.abs(g.latitude - lat) + Math.abs(g.longitude - lon) < 0.6; })[0];
        if (near) { base.name = near.name; base.country = near.country || base.country; }
        return base;
      }).catch(function () { return base; });
    }).then(function (loc) { if (S.loc.mode === 'auto') { locMsg = ''; applyLoc(loc); sendSchedule(); } })
      .catch(function () { locMsg = 'تعذّر تحديد المدينة تلقائيًا، ابحث عنها بالاسم'; if (screen === 'settings') setRender(); });
  }

  var SOUNDS = [['tone', 'نغمة'], ['adhan', 'أذان كامل'], ['short', 'أذان مختصر'], ['none', 'بدون صوت']];
  function setAction(k) {
    var p = k.split('-'), a = p[0], v = p[1];
    if (a === 'loc') {
      if (v === 'auto') { S.loc = Object.assign({}, S.loc, { mode: 'auto' }); save(); locMsg = 'جارٍ تحديد المدينة…'; gpsTry = 0; locateAuto(true); }
      else if (locResults[+v]) { applyLoc(fromGeo(locResults[+v], 'city')); locResults = []; locMsg = ''; sendSchedule(); }
      setRender(); return;
    }
    if (a === 'fsz') { S.fontSize = v; S.zoom = 0; save(); fit(); setRender(); return; }
    if (a === 'wg') {
      var W = S.widget, f = v, val = p[2];
      if (val === 't') W[f] = !W[f]; else W[f] = f === 'clear' ? +val : val;
      save(); sendWidget(); setRender(); return;
    }
    if (a === 'hadj') {
      S.hijriAdj = Math.max(-2, Math.min(2, S.hijriAdj + (v === 'p' ? 1 : -1))); save();
      P.setHijriAdj(S.hijriAdj); autoCache.key = ''; lastDay = ''; tick(); sendSchedule(); setRender(); return;
    }
    if (a === 'syncnow') { syncNow(true); setRender(); return; }
    if (a === 'ndim') { S.nightDim = !S.nightDim; save(); setRender(); return; }
    if (a === 'theme') { S.theme = v; night = null; tick(); }
    if (a === 'snd') { S.sound[v] = p[2]; try { A && A.previewSound && A.previewSound('stop'); } catch (e) {} }
    if (a === 'sndt') { try { A.previewSound(S.sound[v]); } catch (e) {} return; }
    if (a === 'm' || a === 'p') { S.offsets[v] = Math.max(-30, Math.min(30, S.offsets[v] + (a === 'p' ? 1 : -1))); }
    else if (a === 'a') S.alerts[v] = !S.alerts[v];
    else if (a === 'u' || a === 'd') {
      var i = +v, j = a === 'u' ? i - 1 : i + 1, arr = S.shortcuts;
      if (j >= 0 && j < arr.length) { var x = arr[i]; arr[i] = arr[j]; arr[j] = x; }
    } else if (a === 'x') S.shortcuts.splice(+v, 1);
    else if (a === 'boot') { S.openOnBoot = !S.openOnBoot; if (A) A.setOpenOnBoot(S.openOnBoot); }
    else if (a === 'overlay') { if (A) A.openOverlaySettings(); return; }
    else if (a === 'dream') { if (A) A.setDream(!A.dreamOn()); }
    else if (a === 'keep') { S.keepOn = !S.keepOn; if (A && A.setKeepOn) A.setKeepOn(S.keepOn); }
    else if (a === 'notif') { if (A) A.askNotif(); setTimeout(setRender, 1500); return; }
    else if (a === 'battery') { if (A) A.askBattery(); return; }
    else if (a === 'dreamset') { if (A) A.openDreamSettings(); return; }
    else if (a === 'eva') { v = k.slice(4); S.autoEv[v] = S.autoEv[v] === false; }
    else if (a === 'evca' || a === 'evco') {
      var ev = a === 'evca' ? autoEvents(P.ymd(Date.now()))[+v] : S.events[+v];
      if (ev) S.evCard[evKey(ev)] = CARD_LETTERS[(CARD_LETTERS.indexOf(cardOf(ev)) + 1) % CARD_LETTERS.length];
    }
    else if (a === 'fx') S.famMsgs.splice(+v, 1);
    else if (a === 'fact') { S.showFact = !S.showFact; lastFact = -1; }
    else if (/^q[nr][mp]$/.test(a)) {
      var mode = a[1] === 'n' ? 'normal' : 'ramadan';
      S.iqMin[mode][v] = Math.max(0, Math.min(60, S.iqMin[mode][v] + (a[2] === 'p' ? 1 : -1)));
      P.setIqamah(S.iqMin);
    }
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
    if (a === 'eva' || a === 'evx' || a === 'evca' || a === 'evco' || a === 'fmx' || a === 'fan') renderEvents(P.ymd(Date.now()));
    if (a === 'snd' || a === 'm' || a === 'p' || a === 'a' || a === 'im' || a === 'ip' || /^q[nr][mp]$/.test(a)) { sendSchedule(); lastDay = ''; }
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
    Array.prototype.forEach.call(document.querySelectorAll('#tabbar button'), function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    if (name === 'home') { renderShortcuts(); tick(); }
    if (name === 'calendar') { calOpen(); return; }
    if (name === 'convert') { cvToday(); cvRender(); focusFirst($('cv-g')); return; }
    if (name === 'widgets') { wgEdit = ''; wgRender(); focusFirst(document.querySelector('#widgets .f')); return; }
    if (name === 'timers') { tEdit = null; timersRender(); focusFirst(document.querySelector('#timers .f')); return; }
    if (name === 'month') { monthRender(); focusFirst(document.querySelector('#month .f')); return; }
    if (name === 'imsak') { imYear = null; imsakRender(); focusFirst(document.querySelector('#imsak .f')); return; }
    if (name === 'quran') { quranRender(); focusFirst(document.querySelector('#q-resume .f') || document.querySelector('#q-list .f')); return; }
    if (name === 'kahf') { kPlay(kahf.from || kFirst()); kahf.from = 0; $('kahf-clock').textContent = P.full(Date.now()); focusFirst($('k-play')); return; }
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
    if (!$('msg-pop').classList.contains('hidden')) { $('msg-pop').classList.add('hidden'); return true; }
    if (tvOpen) { tvAction('close'); return true; }
    if (tPin) { tPinAction('cancel'); return true; }
    if (screen === 'timers' && tEdit) { tClose(); return true; }
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
    lastKeyAt = Date.now();
    if ($('dim').classList.contains('on')) { $('dim').classList.remove('on'); e.preventDefault(); return; } // the first press only wakes the screen
    // typing in a text box: keep the keys for the text, only up/down move between items
    var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (k === 'Enter' && document.activeElement && document.activeElement.id === 'loc-q') { e.preventDefault(); locSearch(); return; }
    if (typing && k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'Escape' && k !== 'GoBack') return;
    var ae = document.activeElement;
    if (ae && ae.id === 'im-wheel' && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); imKey(k === 'ArrowUp' ? -1 : 1); return; }
    if (ae && ae.classList && ae.classList.contains('cv-wheel') && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); cvKey(ae, k === 'ArrowUp' ? -1 : 1); return; }
    var dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (dirs[k]) { e.preventDefault(); move(dirs[k]); return; }
    if (k === 'Enter' || k === ' ') {
      if (document.activeElement && document.activeElement.classList.contains('f')) { e.preventDefault(); document.activeElement.click(); }
      return;
    }
    if (k === 'Escape' || k === 'Backspace' || k === 'GoBack') { e.preventDefault(); back(); }
    if (k === 'MediaPlayPause' && screen === 'kahf') kToggle();
  });
  document.addEventListener('input', function (e) { if (tEdit && e.target.closest && e.target.closest('#tm-sheet')) tPreview(); });
  // a timer widget on the home screen shows the timer chosen here
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.twid && A && A.setTimerWidget && el.value) { try { A.setTimerWidget(+el.dataset.twid, el.value); } catch (x) {} }
  });
  document.addEventListener('focusin', function (e) {
    var c = e.target;
    if (c.classList && c.classList.contains('cell')) { cal.sy = cal.vy; cal.sm = cal.vm; cal.sd = +c.dataset.d; calMark(); calPanel(); }
  });

  document.addEventListener('click', function (e) {
    var el = e.target.closest('button');
    if (!el) return;
    if (el.dataset.tab) {
      // bottom bar (phone): go straight to that screen
      if (el.dataset.tab === screen) return;
      if (iqOpen()) iqDismiss();
      if (screen === 'kahf') kStop();
      appsMode = 'launch';
      stack = el.dataset.tab === 'home' ? [] : ['home'];
      show(el.dataset.tab);
      return;
    }
    if (el.hasAttribute('data-go')) {
      if (el.dataset.go === 'apps') appsMode = 'launch';
      if (el.dataset.go === 'kahf') { kahf.s = +(el.dataset.sura || 18); kahf.from = +(el.dataset.from || 0); }
      go(el.dataset.go); return;
    }
    if (el.hasAttribute('data-back')) { back(); return; }
    if (el.dataset.rec) { S.reciter = el.dataset.rec; dirTry = 0; save(); quranRender(); var b = document.querySelector('[data-rec="' + S.reciter + '"]'); if (b) b.focus(); return; }
    if (el.dataset.pkg) {
      if (screen === 'apps' && appsMode === 'pick') {
        S.shortcuts = (S.shortcuts || []).concat([el.dataset.pkg]); save(); back(); return;
      }
      if (A) A.launch(el.dataset.pkg);
      return;
    }
    if (el.dataset.k) { setAction(el.dataset.k); return; }
    if (el.dataset.sec) { setToggle(el); return; }
    if (el.dataset.tp) { tPinAction(el.dataset.tp); return; }
    if (el.dataset.tv) { tvAction(el.dataset.tv); return; }
    if (el.dataset.tm) { tOpenEditor(Object.assign({}, S.timers[+el.dataset.tm])); return; }
    if (el.dataset.tk) { tAction(el.dataset.tk); return; }
    if (el.dataset.wgp) { wgPin(el.dataset.wgp); return; }
    if (el.dataset.wge) { wgEdit = wgEdit === el.dataset.wge ? '' : el.dataset.wge; wgRender(); wgFocus(el.dataset.wge, 'wge'); return; }
    if (el.dataset.wgs) { wgSet(el.dataset.wgs); return; }
    if (el.classList.contains('cell')) { el.focus(); return; }
    switch (el.id) {
      case 'iq-close': iqDismiss(); break;
      case 'loc-find': locSearch(); break;
      // quick switch: dark ↔ light (the settings also have «تلقائي»)
      case 'theme-btn': S.theme = night ? 'light' : 'dark'; save(); night = null; tick(); break;
      case 'cal-prev': calMonth(-1); break;
      case 'cal-next': calMonth(1); break;
      case 'cal-today': calOpen(); break;
      case 'k-play': kToggle(); break;
      case 'k-prev-btn': kPrev(); break;
      case 'k-next-btn': kNext(); break;
      case 'set-add': appsMode = 'pick'; go('apps'); break;
      case 'ev-add': addEvent(); break;
      case 'fam-to': famTo = famOrder()[(famOrder().indexOf(famTo) + 1) % famOrder().length]; setRender(); $('fam-to').focus(); break;
      case 'fam-add': addFamMsg(); break;
      case 'upd-btn': updStart(); break;
      case 'cv-g': case 'cv-h':
        // keep the same day when switching: the result becomes the input
        var cg = cv.from === 'g' ? { y: cv.y, m: cv.m, d: cv.d } : hToG(cv.y, cv.m, cv.d), want = el.id.slice(3);
        if (want !== cv.from) {
          cv.from = want;
          if (cg) { var cx = want === 'g' ? cg : hOf(cg.y, cg.m, cg.d); cv.y = cx.y; cv.m = cx.m; cv.d = cx.d; } else cvToday();
        }
        cvRender(); el.focus(); break;
      case 'cv-today': cvToday(); cvRender(); break;
      case 'im-now': imYear = null; imsakRender(); $('im-wheel').focus(); break;
      case 'tm-add':
        var r0 = P.ymd(Date.now());
        tOpenEditor({ id: 't' + Date.now(), name: '', y: r0.y, m: r0.m, d: r0.d, h: -1, mi: 0, unit: 'days', color: 'navy', showDate: true, rip: '', isNew: true }); break;
      case 'tv-btn': tvOpen = true; tvState = ''; tvRender(); var q0 = document.querySelector('#tv-sheet [data-tv="q0"]'); if (q0) q0.focus(); break;
      case 'fm-kind': fmDraft.kind = KIND_ORDER[(KIND_ORDER.indexOf(fmDraft.kind) + 1) % KIND_ORDER.length]; setRender(); $('fm-kind').focus(); break;
      case 'fm-add': addMember(); break;
    }
  });

  // pinch with two fingers (phone, upright): everything larger or smaller; the size is kept
  (function () {
    var d0 = 0, z0 = 1, raf = 0;
    function dist(e) { var a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
    document.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2 && stage.classList.contains('portrait')) { d0 = dist(e); z0 = zoomOf(); }
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2 || !d0) return;
      e.preventDefault();
      var z = Math.max(.8, Math.min(1.6, z0 * dist(e) / d0));
      if (Math.abs(z - zoomOf()) < .01) return;
      S.zoom = Math.round(z * 100) / 100;
      if (!raf) raf = requestAnimationFrame(function () { raf = 0; fit(); });
    }, { passive: false });
    document.addEventListener('touchend', function (e) {
      if (d0 && e.touches.length < 2) { d0 = 0; save(); if (screen === 'settings') setRender(); }
    }, { passive: true });
  })();

  // swipe (phone): months in the calendar, verses in Surah Al-Kahf. Right-to-left layout: swipe right = next
  function onSwipe(el, next, prev) {
    var x0 = null, y0 = null;
    el.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx > 0) next(); else prev();
    }, { passive: true });
  }
  onSwipe($('cal-grid'), function () { calMonth(1); }, function () { calMonth(-1); });
  onSwipe(document.querySelector('.kahf-text'), kNext, kPrev);

  // called by Android
  window.App = {
    back: back,
    // a widget opens a screen (the date converter, the calendar)
    // the phone: the TV's answer to a message ('ok', 'none', 'fail'); the TV: a message from a phone
    tvSent: function (r, kind) {
      if (kind === 'sync') { syncDone(r); return; }
      tvState = r; tvRender(); if (r === 'ok') { var i = $('tv-text'); if (i) i.value = ''; }
    },
    sync: function () { syncTake(); },
    message: function (title, text) { showMessage(title, text); },
    open: function (name) { if (/^(convert|calendar|timers|weather)$/.test(name) && screen !== name) { if (iqOpen()) iqDismiss(); go(name); } },
    onResume: function () {
      appsCache = null;
      if (screen === 'home') renderShortcuts();
      if (screen === 'settings') setRender();
      sendSchedule();
      if (Date.now() - wxAt > 10 * MIN) loadWeather();
      if (TV) syncTake(); else syncSoon();
      if (screen === 'widgets') wgRender(); // a widget may have been added or removed meanwhile
      // phone travelling: the automatic city follows the phone's location
      if (S.loc.mode === 'auto' && !TV) { gpsTry = 0; locateAuto(); }
    }
  };

  if (A && TV) { try { A.setOpenOnBoot(S.openOnBoot); } catch (e) {} }
  if (TV) syncTake();
  showCity();
  if (S.loc.mode === 'auto') locateAuto();
  renderShortcuts();
  tick();
  setTimeout(function () { tick(); setInterval(tick, 1000); }, 1000 - Date.now() % 1000);
  loadWeather();
  setInterval(loadWeather, 15 * MIN);
  focusFirst();
  if (/^#(convert|calendar|timers|weather)$/.test(location.hash)) window.App.open(location.hash.slice(1));
})();
