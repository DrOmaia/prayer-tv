// Prayer times for the chosen city (Riyadh by default), with the method of its country:
// Saudi Arabia Umm al-Qura (Fajr 18.5°, Isha = Maghrib + 90 min, 120 in Ramadan), Jordan, Egypt… (METHODS below).
// Times are computed on the device; no internet needed.
(function () {
  var LAT = 24.7136, LNG = 46.6753, ZONE = 'Asia/Riyadh', HR = 3600000, MIN = 60000;
  // fajr / isha: angle of the sun below the horizon; ishaMin: Isha a fixed time after Maghrib instead of an angle
  var METHODS = {
    umm: { name: 'أم القرى', fajr: 18.5, ishaMin: true },
    jordan: { name: 'وزارة الأوقاف الأردنية', fajr: 18, isha: 18 },
    egypt: { name: 'الهيئة المصرية العامة للمساحة', fajr: 19.5, isha: 17.5 },
    kuwait: { name: 'وزارة الأوقاف الكويتية', fajr: 18, isha: 17.5 },
    qatar: { name: 'وزارة الأوقاف القطرية', fajr: 18, ishaMin: true, fixed: 90 },
    uae: { name: 'الهيئة العامة للشؤون الإسلامية (الإمارات)', fajr: 18.2, isha: 18.2 },
    karachi: { name: 'جامعة العلوم الإسلامية بكراتشي', fajr: 18, isha: 18 },
    turkey: { name: 'رئاسة الشؤون الدينية التركية', fajr: 18, isha: 17 },
    morocco: { name: 'وزارة الأوقاف المغربية', fajr: 19, isha: 17 },
    isna: { name: 'الجمعية الإسلامية لأمريكا الشمالية', fajr: 15, isha: 15 },
    mwl: { name: 'رابطة العالم الإسلامي', fajr: 18, isha: 17 }
  };
  var BY_COUNTRY = { SA: 'umm', YE: 'umm', JO: 'jordan', PS: 'jordan', SY: 'jordan', EG: 'egypt', SD: 'egypt', LY: 'egypt', IQ: 'egypt',
    LB: 'egypt', KW: 'kuwait', QA: 'qatar', BH: 'qatar', OM: 'qatar', AE: 'uae', PK: 'karachi', IN: 'karachi', BD: 'karachi', AF: 'karachi',
    TR: 'turkey', MA: 'morocco', DZ: 'mwl', TN: 'mwl', US: 'isna', CA: 'isna' };
  var METHOD = METHODS.umm;
  function methodFor(cc) { return BY_COUNTRY[cc] || 'mwl'; }
  // the city: {lat, lon, tz (IANA name), cc (country code)}
  function setLocation(loc) {
    if (!loc) return;
    LAT = loc.lat; LNG = loc.lon; ZONE = loc.tz || 'Asia/Riyadh';
    METHOD = METHODS[methodFor(loc.cc)];
    offCache = {};
    try { fHMonth = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: ZONE, month: 'numeric' }); } catch (e) {}
  }
  // hours between UTC and the city's clock at a moment (summer time included)
  var offCache = {}, fOff = null, fOffZone = '';
  function offH(ts) {
    var key = Math.floor(ts / HR);
    if (offCache[key] != null) return offCache[key];
    if (fOffZone !== ZONE) {
      fOff = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
      fOffZone = ZONE;
    }
    var p = {};
    fOff.formatToParts(new Date(key * HR)).forEach(function (x) { p[x.type] = +x.value; });
    return (offCache[key] = (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - key * HR) / HR);
  }
  var ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  var NAMES = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
  // Ministry of Islamic Affairs: 10 min between adhan and iqamah, Fajr 20; in Ramadan Fajr and Isha also 10
  var IQ_NORMAL = { fajr: 20, dhuhr: 10, asr: 10, maghrib: 10, isha: 10 };
  var IQ_RAMADAN = { fajr: 10, dhuhr: 10, asr: 10, maghrib: 10, isha: 10 };
  // Umm al-Qura: Isha is 90 minutes after Maghrib, 120 in Ramadan (adjustable in the settings)
  var ISHA = { normal: 90, ramadan: 120 };
  function setIsha(v) { if (v) { ISHA.normal = v.normal; ISHA.ramadan = v.ramadan; } }
  // minutes from adhan to iqamah, per prayer (adjustable in the settings)
  function setIqamah(v) {
    if (!v) return;
    Object.keys(IQ_NORMAL).forEach(function (k) {
      if (v.normal && v.normal[k] != null) IQ_NORMAL[k] = v.normal[k];
      if (v.ramadan && v.ramadan[k] != null) IQ_RAMADAN[k] = v.ramadan[k];
    });
  }

  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }
  function fixAngle(a) { return a - 360 * Math.floor(a / 360); }
  function fixHour(h) { return h - 24 * Math.floor(h / 24); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }
  function sunPos(jd) {
    var D = jd - 2451545.0;
    var g = fixAngle(357.529 + 0.98560028 * D);
    var q = fixAngle(280.459 + 0.98564736 * D);
    var L = fixAngle(q + 1.915 * Math.sin(rad(g)) + 0.020 * Math.sin(rad(2 * g)));
    var e = 23.439 - 0.00000036 * D;
    var RA = deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15;
    var eqt = q / 15 - fixHour(RA);
    if (eqt > 12) eqt -= 24;
    if (eqt < -12) eqt += 24;
    return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))), eqt: eqt };
  }

  // the city's calendar day (y, m 1-12, d) at noon, as a moment
  function noonOf(y, m, d) { var u = Date.UTC(y, m - 1, d, 12); return u - offH(u) * HR; }
  // the city's calendar date of a moment
  function ymd(ts) {
    var r = new Date(ts + offH(ts) * HR);
    return { y: r.getUTCFullYear(), m: r.getUTCMonth() + 1, d: r.getUTCDate(), wd: r.getUTCDay(), h: r.getUTCHours(), mi: r.getUTCMinutes(), s: r.getUTCSeconds() };
  }

  var fHMonth = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: 'Asia/Riyadh', month: 'numeric' });
  function hijriMonth(ts) { return parseInt(fHMonth.format(new Date(ts)), 10); }
  function isRamadan(y, m, d) { return hijriMonth(noonOf(y, m, d)) === 9; }

  // Adhan times of one day; offsets = minutes added to each adhan (settings)
  function dayTimes(y, m, d, offsets) {
    var ramadan = isRamadan(y, m, d);
    var jd = julian(y, m, d) - LNG / (15 * 24);
    function noon(t) { return fixHour(12 - sunPos(jd + t).eqt); }
    function angleTime(a, t, ccw) {
      var dc = sunPos(jd + t).decl;
      var x = (-Math.sin(rad(a)) - Math.sin(rad(dc)) * Math.sin(rad(LAT))) / (Math.cos(rad(dc)) * Math.cos(rad(LAT)));
      var tt = deg(Math.acos(x)) / 15;
      return noon(t) + (ccw ? -tt : tt);
    }
    function asr(t) {
      var dc = sunPos(jd + t).decl;
      return angleTime(-deg(Math.atan(1 / (1 + Math.tan(rad(Math.abs(LAT - dc)))))), t, false);
    }
    var TZ = offH(noonOf(y, m, d)), adj = TZ - LNG / 15;
    var h = {
      fajr: angleTime(METHOD.fajr, 5 / 24, true) + adj,
      sunrise: angleTime(0.833, 6 / 24, true) + adj,
      dhuhr: noon(12 / 24) + adj,
      asr: asr(13 / 24) + adj,
      maghrib: angleTime(0.833, 18 / 24, false) + adj
    };
    h.isha = METHOD.ishaMin ? h.maghrib + (METHOD.fixed || (ramadan ? ISHA.ramadan : ISHA.normal)) / 60 : angleTime(METHOD.isha, 18 / 24, false) + adj;
    // far north in summer the sun may not go deep enough: a sensible fallback
    if (isNaN(h.fajr)) h.fajr = h.sunrise - 1.5;
    if (isNaN(h.isha)) h.isha = h.maghrib + 1.5;
    var base = Date.UTC(y, m - 1, d) - TZ * HR;
    var friday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5;
    var iq = ramadan ? IQ_RAMADAN : IQ_NORMAL;
    var out = { y: y, m: m, d: d, ramadan: ramadan, friday: friday, at: {}, iqamah: {} };
    ORDER.forEach(function (k) {
      out.at[k] = base + (Math.round(h[k] * 60) + ((offsets && offsets[k]) || 0)) * MIN;
      // no iqamah countdown for sunrise, nor for Friday prayer (it follows the khutbah)
      out.iqamah[k] = (k === 'sunrise' || (k === 'dhuhr' && friday)) ? null : out.at[k] + iq[k] * MIN;
    });
    out.imsak = out.at.fajr - 10 * MIN;
    return out;
  }

  function name(k, friday) { return k === 'dhuhr' && friday ? 'الجمعة' : NAMES[k]; }
  // 24-hour clock: 04:37, 15:45
  function full(ts) { var t = ymd(ts); return pad(t.h) + ':' + pad(t.mi); }
  // time left without seconds: 2:05
  function leftHM(ms) {
    var m = Math.max(0, Math.ceil(ms / 60000));
    return Math.floor(m / 60) + ':' + pad(m % 60);
  }
  function left(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    s = s % 60;
    return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }
  function addDays(y, m, d, n) {
    var t = new Date(Date.UTC(y, m - 1, d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  window.Prayer = {
    ORDER: ORDER, HR: HR, MIN: MIN, zone: function () { return ZONE; }, setLocation: setLocation, methodFor: methodFor, METHODS: METHODS,
    method: function () { return METHOD; },
    dayTimes: dayTimes, setIsha: setIsha, setIqamah: setIqamah, ymd: ymd, noonOf: noonOf, name: name, full: full, left: left, leftHM: leftHM,
    pad: pad, addDays: addDays, isRamadan: isRamadan
  };
})();
