var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  if (mod && typeof mod === "object" || typeof mod === "function") {
    for (let key of __getOwnPropNames(mod))
      if (!__hasOwnProp.call(to, key))
        __defProp(to, key, {
          get: __accessProp.bind(mod, key),
          enumerable: true
        });
  }
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __jsonParse = (a) => JSON.parse(a);
var __require = import.meta.require;

// src/ui/page/api.ts
function createApi(token) {
  return async function call(path, body) {
    const response = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...body === undefined ? {} : { "Content-Type": "application/json" }
      },
      ...body === undefined ? {} : { body: JSON.stringify(body) }
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(errorMessage(json));
    return json;
  };
}
function errorMessage(json) {
  return json && typeof json === "object" && "message" in json && typeof json.message === "string" ? json.message : "Request failed";
}

// src/ui/page/render/dom.ts
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  if (props.className)
    node.className = props.className;
  if (props.text !== undefined)
    node.textContent = props.text;
  if (props.label)
    node.setAttribute("aria-label", props.label);
  Object.assign(node.dataset, props.data);
  node.append(...children);
  return node;
}
function byId(id) {
  const node = document.getElementById(id);
  if (!node)
    throw new Error(`Missing #${id}`);
  return node;
}
function table(headings, rows) {
  return el("table", {}, [
    el("thead", {}, [
      el("tr", {}, headings.map((text) => el("th", { text })))
    ]),
    el("tbody", {}, rows.map((cells) => el("tr", {}, cells.map((cell) => el("td", {}, [cell])))))
  ]);
}
function button(text, tone, label, onClick) {
  const node = el("button", {
    className: tone === "link" ? "link" : `button small ${tone}`,
    text,
    label
  });
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

// src/ui/page/notice.ts
function notify(message, error = false) {
  const notice = byId("notice");
  notice.textContent = message;
  notice.dataset.error = String(error);
}
function errorText(error) {
  return error instanceof Error ? error.message : "Request failed";
}
async function busy(message, action) {
  const buttons = [...document.querySelectorAll("button")];
  for (const button2 of buttons)
    button2.disabled = true;
  byId("progress").hidden = false;
  notify(message);
  try {
    await action();
  } catch (error) {
    notify(errorText(error), true);
  } finally {
    for (const button2 of buttons)
      button2.disabled = false;
    byId("progress").hidden = true;
  }
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/constants.js
var daysInYear = 365.2425;
var maxTime = Math.pow(10, 8) * 24 * 60 * 60 * 1000;
var minTime = -maxTime;
var millisecondsInWeek = 604800000;
var millisecondsInDay = 86400000;
var millisecondsInMinute = 60000;
var minutesInYear = 525600;
var minutesInMonth = 43200;
var minutesInDay = 1440;
var secondsInHour = 3600;
var secondsInDay = secondsInHour * 24;
var secondsInWeek = secondsInDay * 7;
var secondsInYear = secondsInDay * daysInYear;
var secondsInMonth = secondsInYear / 12;
var secondsInQuarter = secondsInMonth * 3;
var constructFromSymbol = Symbol.for("constructDateFrom");

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/constructFrom.js
function constructFrom(date, value) {
  if (typeof date === "function")
    return date(value);
  if (date && typeof date === "object" && constructFromSymbol in date)
    return date[constructFromSymbol](value);
  if (date instanceof Date)
    return new date.constructor(value);
  return new Date(value);
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/toDate.js
function toDate(argument, context) {
  return constructFrom(context || argument, argument);
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/_lib/defaultOptions.js
var defaultOptions = {};
function getDefaultOptions() {
  return defaultOptions;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/startOfWeek.js
function startOfWeek(date, options) {
  const defaultOptions2 = getDefaultOptions();
  const weekStartsOn = options?.weekStartsOn ?? options?.locale?.options?.weekStartsOn ?? defaultOptions2.weekStartsOn ?? defaultOptions2.locale?.options?.weekStartsOn ?? 0;
  const _date = toDate(date, options?.in);
  const day = _date.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  _date.setDate(_date.getDate() - diff);
  _date.setHours(0, 0, 0, 0);
  return _date;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/startOfISOWeek.js
function startOfISOWeek(date, options) {
  return startOfWeek(date, { ...options, weekStartsOn: 1 });
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/getISOWeekYear.js
function getISOWeekYear(date, options) {
  const _date = toDate(date, options?.in);
  const year = _date.getFullYear();
  const fourthOfJanuaryOfNextYear = constructFrom(_date, 0);
  fourthOfJanuaryOfNextYear.setFullYear(year + 1, 0, 4);
  fourthOfJanuaryOfNextYear.setHours(0, 0, 0, 0);
  const startOfNextYear = startOfISOWeek(fourthOfJanuaryOfNextYear);
  const fourthOfJanuaryOfThisYear = constructFrom(_date, 0);
  fourthOfJanuaryOfThisYear.setFullYear(year, 0, 4);
  fourthOfJanuaryOfThisYear.setHours(0, 0, 0, 0);
  const startOfThisYear = startOfISOWeek(fourthOfJanuaryOfThisYear);
  if (_date.getTime() >= startOfNextYear.getTime()) {
    return year + 1;
  } else if (_date.getTime() >= startOfThisYear.getTime()) {
    return year;
  } else {
    return year - 1;
  }
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/_lib/getTimezoneOffsetInMilliseconds.js
function getTimezoneOffsetInMilliseconds(date) {
  const _date = toDate(date);
  const utcDate = new Date(Date.UTC(_date.getFullYear(), _date.getMonth(), _date.getDate(), _date.getHours(), _date.getMinutes(), _date.getSeconds(), _date.getMilliseconds()));
  utcDate.setUTCFullYear(_date.getFullYear());
  return +date - +utcDate;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/_lib/normalizeDates.js
function normalizeDates(context, ...dates) {
  const normalize = constructFrom.bind(null, context || dates.find((date) => typeof date === "object"));
  return dates.map(normalize);
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/startOfDay.js
function startOfDay(date, options) {
  const _date = toDate(date, options?.in);
  _date.setHours(0, 0, 0, 0);
  return _date;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/differenceInCalendarDays.js
function differenceInCalendarDays(laterDate, earlierDate, options) {
  const [laterDate_, earlierDate_] = normalizeDates(options?.in, laterDate, earlierDate);
  const laterStartOfDay = startOfDay(laterDate_);
  const earlierStartOfDay = startOfDay(earlierDate_);
  const laterTimestamp = +laterStartOfDay - getTimezoneOffsetInMilliseconds(laterStartOfDay);
  const earlierTimestamp = +earlierStartOfDay - getTimezoneOffsetInMilliseconds(earlierStartOfDay);
  return Math.round((laterTimestamp - earlierTimestamp) / millisecondsInDay);
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/startOfISOWeekYear.js
function startOfISOWeekYear(date, options) {
  const year = getISOWeekYear(date, options);
  const fourthOfJanuary = constructFrom(options?.in || date, 0);
  fourthOfJanuary.setFullYear(year, 0, 4);
  fourthOfJanuary.setHours(0, 0, 0, 0);
  return startOfISOWeek(fourthOfJanuary);
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/compareAsc.js
function compareAsc(dateLeft, dateRight) {
  const diff = +toDate(dateLeft) - +toDate(dateRight);
  if (diff < 0)
    return -1;
  else if (diff > 0)
    return 1;
  return diff;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/isDate.js
function isDate(value) {
  return value instanceof Date || typeof value === "object" && Object.prototype.toString.call(value) === "[object Date]";
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/isValid.js
function isValid(date) {
  return !(!isDate(date) && typeof date !== "number" || isNaN(+toDate(date)));
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/_lib/getRoundingMethod.js
function getRoundingMethod(method) {
  return (number) => {
    const round = method ? Math[method] : Math.trunc;
    const result = round(number);
    return result === 0 ? 0 : result;
  };
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/startOfYear.js
function startOfYear(date, options) {
  const date_ = toDate(date, options?.in);
  date_.setFullYear(date_.getFullYear(), 0, 1);
  date_.setHours(0, 0, 0, 0);
  return date_;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/locale/en-US/_lib/formatDistance.js
var formatDistanceLocale = {
  lessThanXSeconds: {
    one: "less than a second",
    other: "less than {{count}} seconds"
  },
  xSeconds: {
    one: "1 second",
    other: "{{count}} seconds"
  },
  halfAMinute: "half a minute",
  lessThanXMinutes: {
    one: "less than a minute",
    other: "less than {{count}} minutes"
  },
  xMinutes: {
    one: "1 minute",
    other: "{{count}} minutes"
  },
  aboutXHours: {
    one: "about 1 hour",
    other: "about {{count}} hours"
  },
  xHours: {
    one: "1 hour",
    other: "{{count}} hours"
  },
  xDays: {
    one: "1 day",
    other: "{{count}} days"
  },
  aboutXWeeks: {
    one: "about 1 week",
    other: "about {{count}} weeks"
  },
  xWeeks: {
    one: "1 week",
    other: "{{count}} weeks"
  },
  aboutXMonths: {
    one: "about 1 month",
    other: "about {{count}} months"
  },
  xMonths: {
    one: "1 month",
    other: "{{count}} months"
  },
  aboutXYears: {
    one: "about 1 year",
    other: "about {{count}} years"
  },
  xYears: {
    one: "1 year",
    other: "{{count}} years"
  },
  overXYears: {
    one: "over 1 year",
    other: "over {{count}} years"
  },
  almostXYears: {
    one: "almost 1 year",
    other: "almost {{count}} years"
  }
};
var formatDistance = (token, count, options) => {
  let result;
  const tokenValue = formatDistanceLocale[token];
  if (typeof tokenValue === "string") {
    result = tokenValue;
  } else if (count === 1) {
    result = tokenValue.one;
  } else {
    result = tokenValue.other.replace("{{count}}", count.toString());
  }
  if (options?.addSuffix) {
    if (options.comparison && options.comparison > 0) {
      return "in " + result;
    } else {
      return result + " ago";
    }
  }
  return result;
};

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/locale/_lib/buildFormatLongFn.js
function buildFormatLongFn(args) {
  return (options = {}) => {
    const width = options.width ? String(options.width) : args.defaultWidth;
    const format = args.formats[width] || args.formats[args.defaultWidth];
    return format;
  };
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/locale/en-US/_lib/formatLong.js
var dateFormats = {
  full: "EEEE, MMMM do, y",
  long: "MMMM do, y",
  medium: "MMM d, y",
  short: "MM/dd/yyyy"
};
var timeFormats = {
  full: "h:mm:ss a zzzz",
  long: "h:mm:ss a z",
  medium: "h:mm:ss a",
  short: "h:mm a"
};
var dateTimeFormats = {
  full: "{{date}} 'at' {{time}}",
  long: "{{date}} 'at' {{time}}",
  medium: "{{date}}, {{time}}",
  short: "{{date}}, {{time}}"
};
var formatLong = {
  date: buildFormatLongFn({
    formats: dateFormats,
    defaultWidth: "full"
  }),
  time: buildFormatLongFn({
    formats: timeFormats,
    defaultWidth: "full"
  }),
  dateTime: buildFormatLongFn({
    formats: dateTimeFormats,
    defaultWidth: "full"
  })
};

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/locale/en-US/_lib/formatRelative.js
var formatRelativeLocale = {
  lastWeek: "'last' eeee 'at' p",
  yesterday: "'yesterday at' p",
  today: "'today at' p",
  tomorrow: "'tomorrow at' p",
  nextWeek: "eeee 'at' p",
  other: "P"
};
var formatRelative = (token, _date, _baseDate, _options) => formatRelativeLocale[token];

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/locale/_lib/buildLocalizeFn.js
function buildLocalizeFn(args) {
  return (value, options) => {
    const context = options?.context ? String(options.context) : "standalone";
    let valuesArray;
    if (context === "formatting" && args.formattingValues) {
      const defaultWidth = args.defaultFormattingWidth || args.defaultWidth;
      const width = options?.width ? String(options.width) : defaultWidth;
      valuesArray = args.formattingValues[width] || args.formattingValues[defaultWidth];
    } else {
      const defaultWidth = args.defaultWidth;
      const width = options?.width ? String(options.width) : args.defaultWidth;
      valuesArray = args.values[width] || args.values[defaultWidth];
    }
    const index = args.argumentCallback ? args.argumentCallback(value) : value;
    return valuesArray[index];
  };
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/locale/en-US/_lib/localize.js
var eraValues = {
  narrow: ["B", "A"],
  abbreviated: ["BC", "AD"],
  wide: ["Before Christ", "Anno Domini"]
};
var quarterValues = {
  narrow: ["1", "2", "3", "4"],
  abbreviated: ["Q1", "Q2", "Q3", "Q4"],
  wide: ["1st quarter", "2nd quarter", "3rd quarter", "4th quarter"]
};
var monthValues = {
  narrow: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
  abbreviated: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ],
  wide: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ]
};
var dayValues = {
  narrow: ["S", "M", "T", "W", "T", "F", "S"],
  short: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
  abbreviated: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  wide: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ]
};
var dayPeriodValues = {
  narrow: {
    am: "a",
    pm: "p",
    midnight: "mi",
    noon: "n",
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night"
  },
  abbreviated: {
    am: "AM",
    pm: "PM",
    midnight: "midnight",
    noon: "noon",
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night"
  },
  wide: {
    am: "a.m.",
    pm: "p.m.",
    midnight: "midnight",
    noon: "noon",
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night"
  }
};
var formattingDayPeriodValues = {
  narrow: {
    am: "a",
    pm: "p",
    midnight: "mi",
    noon: "n",
    morning: "in the morning",
    afternoon: "in the afternoon",
    evening: "in the evening",
    night: "at night"
  },
  abbreviated: {
    am: "AM",
    pm: "PM",
    midnight: "midnight",
    noon: "noon",
    morning: "in the morning",
    afternoon: "in the afternoon",
    evening: "in the evening",
    night: "at night"
  },
  wide: {
    am: "a.m.",
    pm: "p.m.",
    midnight: "midnight",
    noon: "noon",
    morning: "in the morning",
    afternoon: "in the afternoon",
    evening: "in the evening",
    night: "at night"
  }
};
var ordinalNumber = (dirtyNumber, _options) => {
  const number = Number(dirtyNumber);
  const rem100 = number % 100;
  if (rem100 > 20 || rem100 < 10) {
    switch (rem100 % 10) {
      case 1:
        return number + "st";
      case 2:
        return number + "nd";
      case 3:
        return number + "rd";
    }
  }
  return number + "th";
};
var localize = {
  ordinalNumber,
  era: buildLocalizeFn({
    values: eraValues,
    defaultWidth: "wide"
  }),
  quarter: buildLocalizeFn({
    values: quarterValues,
    defaultWidth: "wide",
    argumentCallback: (quarter) => quarter - 1
  }),
  month: buildLocalizeFn({
    values: monthValues,
    defaultWidth: "wide"
  }),
  day: buildLocalizeFn({
    values: dayValues,
    defaultWidth: "wide"
  }),
  dayPeriod: buildLocalizeFn({
    values: dayPeriodValues,
    defaultWidth: "wide",
    formattingValues: formattingDayPeriodValues,
    defaultFormattingWidth: "wide"
  })
};

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/locale/_lib/buildMatchFn.js
function buildMatchFn(args) {
  return (string, options = {}) => {
    const width = options.width;
    const matchPattern = width && args.matchPatterns[width] || args.matchPatterns[args.defaultMatchWidth];
    const matchResult = string.match(matchPattern);
    if (!matchResult) {
      return null;
    }
    const matchedString = matchResult[0];
    const parsePatterns = width && args.parsePatterns[width] || args.parsePatterns[args.defaultParseWidth];
    const key = Array.isArray(parsePatterns) ? findIndex(parsePatterns, (pattern) => pattern.test(matchedString)) : findKey(parsePatterns, (pattern) => pattern.test(matchedString));
    let value;
    value = args.valueCallback ? args.valueCallback(key) : key;
    value = options.valueCallback ? options.valueCallback(value) : value;
    const rest = string.slice(matchedString.length);
    return { value, rest };
  };
}
function findKey(object, predicate) {
  for (const key in object) {
    if (Object.prototype.hasOwnProperty.call(object, key) && predicate(object[key])) {
      return key;
    }
  }
  return;
}
function findIndex(array, predicate) {
  for (let key = 0;key < array.length; key++) {
    if (predicate(array[key])) {
      return key;
    }
  }
  return;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/locale/_lib/buildMatchPatternFn.js
function buildMatchPatternFn(args) {
  return (string, options = {}) => {
    const matchResult = string.match(args.matchPattern);
    if (!matchResult)
      return null;
    const matchedString = matchResult[0];
    const parseResult = string.match(args.parsePattern);
    if (!parseResult)
      return null;
    let value = args.valueCallback ? args.valueCallback(parseResult[0]) : parseResult[0];
    value = options.valueCallback ? options.valueCallback(value) : value;
    const rest = string.slice(matchedString.length);
    return { value, rest };
  };
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/locale/en-US/_lib/match.js
var matchOrdinalNumberPattern = /^(\d+)(th|st|nd|rd)?/i;
var parseOrdinalNumberPattern = /\d+/i;
var matchEraPatterns = {
  narrow: /^(b|a)/i,
  abbreviated: /^(b\.?\s?c\.?|b\.?\s?c\.?\s?e\.?|a\.?\s?d\.?|c\.?\s?e\.?)/i,
  wide: /^(before christ|before common era|anno domini|common era)/i
};
var parseEraPatterns = {
  any: [/^b/i, /^(a|c)/i]
};
var matchQuarterPatterns = {
  narrow: /^[1234]/i,
  abbreviated: /^q[1234]/i,
  wide: /^[1234](th|st|nd|rd)? quarter/i
};
var parseQuarterPatterns = {
  any: [/1/i, /2/i, /3/i, /4/i]
};
var matchMonthPatterns = {
  narrow: /^[jfmasond]/i,
  abbreviated: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  wide: /^(january|february|march|april|may|june|july|august|september|october|november|december)/i
};
var parseMonthPatterns = {
  narrow: [
    /^j/i,
    /^f/i,
    /^m/i,
    /^a/i,
    /^m/i,
    /^j/i,
    /^j/i,
    /^a/i,
    /^s/i,
    /^o/i,
    /^n/i,
    /^d/i
  ],
  any: [
    /^ja/i,
    /^f/i,
    /^mar/i,
    /^ap/i,
    /^may/i,
    /^jun/i,
    /^jul/i,
    /^au/i,
    /^s/i,
    /^o/i,
    /^n/i,
    /^d/i
  ]
};
var matchDayPatterns = {
  narrow: /^[smtwf]/i,
  short: /^(su|mo|tu|we|th|fr|sa)/i,
  abbreviated: /^(sun|mon|tue|wed|thu|fri|sat)/i,
  wide: /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i
};
var parseDayPatterns = {
  narrow: [/^s/i, /^m/i, /^t/i, /^w/i, /^t/i, /^f/i, /^s/i],
  any: [/^su/i, /^m/i, /^tu/i, /^w/i, /^th/i, /^f/i, /^sa/i]
};
var matchDayPeriodPatterns = {
  narrow: /^(a|p|mi|n|(in the|at) (morning|afternoon|evening|night))/i,
  any: /^([ap]\.?\s?m\.?|midnight|noon|(in the|at) (morning|afternoon|evening|night))/i
};
var parseDayPeriodPatterns = {
  any: {
    am: /^a/i,
    pm: /^p/i,
    midnight: /^mi/i,
    noon: /^no/i,
    morning: /morning/i,
    afternoon: /afternoon/i,
    evening: /evening/i,
    night: /night/i
  }
};
var match = {
  ordinalNumber: buildMatchPatternFn({
    matchPattern: matchOrdinalNumberPattern,
    parsePattern: parseOrdinalNumberPattern,
    valueCallback: (value) => parseInt(value, 10)
  }),
  era: buildMatchFn({
    matchPatterns: matchEraPatterns,
    defaultMatchWidth: "wide",
    parsePatterns: parseEraPatterns,
    defaultParseWidth: "any"
  }),
  quarter: buildMatchFn({
    matchPatterns: matchQuarterPatterns,
    defaultMatchWidth: "wide",
    parsePatterns: parseQuarterPatterns,
    defaultParseWidth: "any",
    valueCallback: (index) => index + 1
  }),
  month: buildMatchFn({
    matchPatterns: matchMonthPatterns,
    defaultMatchWidth: "wide",
    parsePatterns: parseMonthPatterns,
    defaultParseWidth: "any"
  }),
  day: buildMatchFn({
    matchPatterns: matchDayPatterns,
    defaultMatchWidth: "wide",
    parsePatterns: parseDayPatterns,
    defaultParseWidth: "any"
  }),
  dayPeriod: buildMatchFn({
    matchPatterns: matchDayPeriodPatterns,
    defaultMatchWidth: "any",
    parsePatterns: parseDayPeriodPatterns,
    defaultParseWidth: "any"
  })
};

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/locale/en-US.js
var enUS = {
  code: "en-US",
  formatDistance,
  formatLong,
  formatRelative,
  localize,
  match,
  options: {
    weekStartsOn: 0,
    firstWeekContainsDate: 1
  }
};
// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/getDayOfYear.js
function getDayOfYear(date, options) {
  const _date = toDate(date, options?.in);
  const diff = differenceInCalendarDays(_date, startOfYear(_date));
  const dayOfYear = diff + 1;
  return dayOfYear;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/getISOWeek.js
function getISOWeek(date, options) {
  const _date = toDate(date, options?.in);
  const diff = +startOfISOWeek(_date) - +startOfISOWeekYear(_date);
  return Math.round(diff / millisecondsInWeek) + 1;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/getWeekYear.js
function getWeekYear(date, options) {
  const _date = toDate(date, options?.in);
  const year = _date.getFullYear();
  const defaultOptions2 = getDefaultOptions();
  const firstWeekContainsDate = options?.firstWeekContainsDate ?? options?.locale?.options?.firstWeekContainsDate ?? defaultOptions2.firstWeekContainsDate ?? defaultOptions2.locale?.options?.firstWeekContainsDate ?? 1;
  const firstWeekOfNextYear = constructFrom(options?.in || date, 0);
  firstWeekOfNextYear.setFullYear(year + 1, 0, firstWeekContainsDate);
  firstWeekOfNextYear.setHours(0, 0, 0, 0);
  const startOfNextYear = startOfWeek(firstWeekOfNextYear, options);
  const firstWeekOfThisYear = constructFrom(options?.in || date, 0);
  firstWeekOfThisYear.setFullYear(year, 0, firstWeekContainsDate);
  firstWeekOfThisYear.setHours(0, 0, 0, 0);
  const startOfThisYear = startOfWeek(firstWeekOfThisYear, options);
  if (+_date >= +startOfNextYear) {
    return year + 1;
  } else if (+_date >= +startOfThisYear) {
    return year;
  } else {
    return year - 1;
  }
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/startOfWeekYear.js
function startOfWeekYear(date, options) {
  const defaultOptions2 = getDefaultOptions();
  const firstWeekContainsDate = options?.firstWeekContainsDate ?? options?.locale?.options?.firstWeekContainsDate ?? defaultOptions2.firstWeekContainsDate ?? defaultOptions2.locale?.options?.firstWeekContainsDate ?? 1;
  const year = getWeekYear(date, options);
  const firstWeek = constructFrom(options?.in || date, 0);
  firstWeek.setFullYear(year, 0, firstWeekContainsDate);
  firstWeek.setHours(0, 0, 0, 0);
  const _date = startOfWeek(firstWeek, options);
  return _date;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/getWeek.js
function getWeek(date, options) {
  const _date = toDate(date, options?.in);
  const diff = +startOfWeek(_date, options) - +startOfWeekYear(_date, options);
  return Math.round(diff / millisecondsInWeek) + 1;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/_lib/addLeadingZeros.js
function addLeadingZeros(number, targetLength) {
  const sign = number < 0 ? "-" : "";
  const output = Math.abs(number).toString().padStart(targetLength, "0");
  return sign + output;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/_lib/format/lightFormatters.js
var lightFormatters = {
  y(date, token) {
    const signedYear = date.getFullYear();
    const year = signedYear > 0 ? signedYear : 1 - signedYear;
    return addLeadingZeros(token === "yy" ? year % 100 : year, token.length);
  },
  M(date, token) {
    const month = date.getMonth();
    return token === "M" ? String(month + 1) : addLeadingZeros(month + 1, 2);
  },
  d(date, token) {
    return addLeadingZeros(date.getDate(), token.length);
  },
  a(date, token) {
    const dayPeriodEnumValue = date.getHours() / 12 >= 1 ? "pm" : "am";
    switch (token) {
      case "a":
      case "aa":
        return dayPeriodEnumValue.toUpperCase();
      case "aaa":
        return dayPeriodEnumValue;
      case "aaaaa":
        return dayPeriodEnumValue[0];
      case "aaaa":
      default:
        return dayPeriodEnumValue === "am" ? "a.m." : "p.m.";
    }
  },
  h(date, token) {
    return addLeadingZeros(date.getHours() % 12 || 12, token.length);
  },
  H(date, token) {
    return addLeadingZeros(date.getHours(), token.length);
  },
  m(date, token) {
    return addLeadingZeros(date.getMinutes(), token.length);
  },
  s(date, token) {
    return addLeadingZeros(date.getSeconds(), token.length);
  },
  S(date, token) {
    const numberOfDigits = token.length;
    const milliseconds = date.getMilliseconds();
    const fractionalSeconds = Math.trunc(milliseconds * Math.pow(10, numberOfDigits - 3));
    return addLeadingZeros(fractionalSeconds, token.length);
  }
};

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/_lib/format/formatters.js
var dayPeriodEnum = {
  am: "am",
  pm: "pm",
  midnight: "midnight",
  noon: "noon",
  morning: "morning",
  afternoon: "afternoon",
  evening: "evening",
  night: "night"
};
var formatters = {
  G: function(date, token, localize2) {
    const era = date.getFullYear() > 0 ? 1 : 0;
    switch (token) {
      case "G":
      case "GG":
      case "GGG":
        return localize2.era(era, { width: "abbreviated" });
      case "GGGGG":
        return localize2.era(era, { width: "narrow" });
      case "GGGG":
      default:
        return localize2.era(era, { width: "wide" });
    }
  },
  y: function(date, token, localize2) {
    if (token === "yo") {
      const signedYear = date.getFullYear();
      const year = signedYear > 0 ? signedYear : 1 - signedYear;
      return localize2.ordinalNumber(year, { unit: "year" });
    }
    return lightFormatters.y(date, token);
  },
  Y: function(date, token, localize2, options) {
    const signedWeekYear = getWeekYear(date, options);
    const weekYear = signedWeekYear > 0 ? signedWeekYear : 1 - signedWeekYear;
    if (token === "YY") {
      const twoDigitYear = weekYear % 100;
      return addLeadingZeros(twoDigitYear, 2);
    }
    if (token === "Yo") {
      return localize2.ordinalNumber(weekYear, { unit: "year" });
    }
    return addLeadingZeros(weekYear, token.length);
  },
  R: function(date, token) {
    const isoWeekYear = getISOWeekYear(date);
    return addLeadingZeros(isoWeekYear, token.length);
  },
  u: function(date, token) {
    const year = date.getFullYear();
    return addLeadingZeros(year, token.length);
  },
  Q: function(date, token, localize2) {
    const quarter = Math.ceil((date.getMonth() + 1) / 3);
    switch (token) {
      case "Q":
        return String(quarter);
      case "QQ":
        return addLeadingZeros(quarter, 2);
      case "Qo":
        return localize2.ordinalNumber(quarter, { unit: "quarter" });
      case "QQQ":
        return localize2.quarter(quarter, {
          width: "abbreviated",
          context: "formatting"
        });
      case "QQQQQ":
        return localize2.quarter(quarter, {
          width: "narrow",
          context: "formatting"
        });
      case "QQQQ":
      default:
        return localize2.quarter(quarter, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  q: function(date, token, localize2) {
    const quarter = Math.ceil((date.getMonth() + 1) / 3);
    switch (token) {
      case "q":
        return String(quarter);
      case "qq":
        return addLeadingZeros(quarter, 2);
      case "qo":
        return localize2.ordinalNumber(quarter, { unit: "quarter" });
      case "qqq":
        return localize2.quarter(quarter, {
          width: "abbreviated",
          context: "standalone"
        });
      case "qqqqq":
        return localize2.quarter(quarter, {
          width: "narrow",
          context: "standalone"
        });
      case "qqqq":
      default:
        return localize2.quarter(quarter, {
          width: "wide",
          context: "standalone"
        });
    }
  },
  M: function(date, token, localize2) {
    const month = date.getMonth();
    switch (token) {
      case "M":
      case "MM":
        return lightFormatters.M(date, token);
      case "Mo":
        return localize2.ordinalNumber(month + 1, { unit: "month" });
      case "MMM":
        return localize2.month(month, {
          width: "abbreviated",
          context: "formatting"
        });
      case "MMMMM":
        return localize2.month(month, {
          width: "narrow",
          context: "formatting"
        });
      case "MMMM":
      default:
        return localize2.month(month, { width: "wide", context: "formatting" });
    }
  },
  L: function(date, token, localize2) {
    const month = date.getMonth();
    switch (token) {
      case "L":
        return String(month + 1);
      case "LL":
        return addLeadingZeros(month + 1, 2);
      case "Lo":
        return localize2.ordinalNumber(month + 1, { unit: "month" });
      case "LLL":
        return localize2.month(month, {
          width: "abbreviated",
          context: "standalone"
        });
      case "LLLLL":
        return localize2.month(month, {
          width: "narrow",
          context: "standalone"
        });
      case "LLLL":
      default:
        return localize2.month(month, { width: "wide", context: "standalone" });
    }
  },
  w: function(date, token, localize2, options) {
    const week = getWeek(date, options);
    if (token === "wo") {
      return localize2.ordinalNumber(week, { unit: "week" });
    }
    return addLeadingZeros(week, token.length);
  },
  I: function(date, token, localize2) {
    const isoWeek = getISOWeek(date);
    if (token === "Io") {
      return localize2.ordinalNumber(isoWeek, { unit: "week" });
    }
    return addLeadingZeros(isoWeek, token.length);
  },
  d: function(date, token, localize2) {
    if (token === "do") {
      return localize2.ordinalNumber(date.getDate(), { unit: "date" });
    }
    return lightFormatters.d(date, token);
  },
  D: function(date, token, localize2) {
    const dayOfYear = getDayOfYear(date);
    if (token === "Do") {
      return localize2.ordinalNumber(dayOfYear, { unit: "dayOfYear" });
    }
    return addLeadingZeros(dayOfYear, token.length);
  },
  E: function(date, token, localize2) {
    const dayOfWeek = date.getDay();
    switch (token) {
      case "E":
      case "EE":
      case "EEE":
        return localize2.day(dayOfWeek, {
          width: "abbreviated",
          context: "formatting"
        });
      case "EEEEE":
        return localize2.day(dayOfWeek, {
          width: "narrow",
          context: "formatting"
        });
      case "EEEEEE":
        return localize2.day(dayOfWeek, {
          width: "short",
          context: "formatting"
        });
      case "EEEE":
      default:
        return localize2.day(dayOfWeek, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  e: function(date, token, localize2, options) {
    const dayOfWeek = date.getDay();
    const localDayOfWeek = (dayOfWeek - options.weekStartsOn + 8) % 7 || 7;
    switch (token) {
      case "e":
        return String(localDayOfWeek);
      case "ee":
        return addLeadingZeros(localDayOfWeek, 2);
      case "eo":
        return localize2.ordinalNumber(localDayOfWeek, { unit: "day" });
      case "eee":
        return localize2.day(dayOfWeek, {
          width: "abbreviated",
          context: "formatting"
        });
      case "eeeee":
        return localize2.day(dayOfWeek, {
          width: "narrow",
          context: "formatting"
        });
      case "eeeeee":
        return localize2.day(dayOfWeek, {
          width: "short",
          context: "formatting"
        });
      case "eeee":
      default:
        return localize2.day(dayOfWeek, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  c: function(date, token, localize2, options) {
    const dayOfWeek = date.getDay();
    const localDayOfWeek = (dayOfWeek - options.weekStartsOn + 8) % 7 || 7;
    switch (token) {
      case "c":
        return String(localDayOfWeek);
      case "cc":
        return addLeadingZeros(localDayOfWeek, token.length);
      case "co":
        return localize2.ordinalNumber(localDayOfWeek, { unit: "day" });
      case "ccc":
        return localize2.day(dayOfWeek, {
          width: "abbreviated",
          context: "standalone"
        });
      case "ccccc":
        return localize2.day(dayOfWeek, {
          width: "narrow",
          context: "standalone"
        });
      case "cccccc":
        return localize2.day(dayOfWeek, {
          width: "short",
          context: "standalone"
        });
      case "cccc":
      default:
        return localize2.day(dayOfWeek, {
          width: "wide",
          context: "standalone"
        });
    }
  },
  i: function(date, token, localize2) {
    const dayOfWeek = date.getDay();
    const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
    switch (token) {
      case "i":
        return String(isoDayOfWeek);
      case "ii":
        return addLeadingZeros(isoDayOfWeek, token.length);
      case "io":
        return localize2.ordinalNumber(isoDayOfWeek, { unit: "day" });
      case "iii":
        return localize2.day(dayOfWeek, {
          width: "abbreviated",
          context: "formatting"
        });
      case "iiiii":
        return localize2.day(dayOfWeek, {
          width: "narrow",
          context: "formatting"
        });
      case "iiiiii":
        return localize2.day(dayOfWeek, {
          width: "short",
          context: "formatting"
        });
      case "iiii":
      default:
        return localize2.day(dayOfWeek, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  a: function(date, token, localize2) {
    const hours = date.getHours();
    const dayPeriodEnumValue = hours / 12 >= 1 ? "pm" : "am";
    switch (token) {
      case "a":
      case "aa":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "abbreviated",
          context: "formatting"
        });
      case "aaa":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "abbreviated",
          context: "formatting"
        }).toLowerCase();
      case "aaaaa":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "narrow",
          context: "formatting"
        });
      case "aaaa":
      default:
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  b: function(date, token, localize2) {
    const hours = date.getHours();
    let dayPeriodEnumValue;
    if (hours === 12) {
      dayPeriodEnumValue = dayPeriodEnum.noon;
    } else if (hours === 0) {
      dayPeriodEnumValue = dayPeriodEnum.midnight;
    } else {
      dayPeriodEnumValue = hours / 12 >= 1 ? "pm" : "am";
    }
    switch (token) {
      case "b":
      case "bb":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "abbreviated",
          context: "formatting"
        });
      case "bbb":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "abbreviated",
          context: "formatting"
        }).toLowerCase();
      case "bbbbb":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "narrow",
          context: "formatting"
        });
      case "bbbb":
      default:
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  B: function(date, token, localize2) {
    const hours = date.getHours();
    let dayPeriodEnumValue;
    if (hours >= 17) {
      dayPeriodEnumValue = dayPeriodEnum.evening;
    } else if (hours >= 12) {
      dayPeriodEnumValue = dayPeriodEnum.afternoon;
    } else if (hours >= 4) {
      dayPeriodEnumValue = dayPeriodEnum.morning;
    } else {
      dayPeriodEnumValue = dayPeriodEnum.night;
    }
    switch (token) {
      case "B":
      case "BB":
      case "BBB":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "abbreviated",
          context: "formatting"
        });
      case "BBBBB":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "narrow",
          context: "formatting"
        });
      case "BBBB":
      default:
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  h: function(date, token, localize2) {
    if (token === "ho") {
      let hours = date.getHours() % 12;
      if (hours === 0)
        hours = 12;
      return localize2.ordinalNumber(hours, { unit: "hour" });
    }
    return lightFormatters.h(date, token);
  },
  H: function(date, token, localize2) {
    if (token === "Ho") {
      return localize2.ordinalNumber(date.getHours(), { unit: "hour" });
    }
    return lightFormatters.H(date, token);
  },
  K: function(date, token, localize2) {
    const hours = date.getHours() % 12;
    if (token === "Ko") {
      return localize2.ordinalNumber(hours, { unit: "hour" });
    }
    return addLeadingZeros(hours, token.length);
  },
  k: function(date, token, localize2) {
    let hours = date.getHours();
    if (hours === 0)
      hours = 24;
    if (token === "ko") {
      return localize2.ordinalNumber(hours, { unit: "hour" });
    }
    return addLeadingZeros(hours, token.length);
  },
  m: function(date, token, localize2) {
    if (token === "mo") {
      return localize2.ordinalNumber(date.getMinutes(), { unit: "minute" });
    }
    return lightFormatters.m(date, token);
  },
  s: function(date, token, localize2) {
    if (token === "so") {
      return localize2.ordinalNumber(date.getSeconds(), { unit: "second" });
    }
    return lightFormatters.s(date, token);
  },
  S: function(date, token) {
    return lightFormatters.S(date, token);
  },
  X: function(date, token, _localize) {
    const timezoneOffset = date.getTimezoneOffset();
    if (timezoneOffset === 0) {
      return "Z";
    }
    switch (token) {
      case "X":
        return formatTimezoneWithOptionalMinutes(timezoneOffset);
      case "XXXX":
      case "XX":
        return formatTimezone(timezoneOffset);
      case "XXXXX":
      case "XXX":
      default:
        return formatTimezone(timezoneOffset, ":");
    }
  },
  x: function(date, token, _localize) {
    const timezoneOffset = date.getTimezoneOffset();
    switch (token) {
      case "x":
        return formatTimezoneWithOptionalMinutes(timezoneOffset);
      case "xxxx":
      case "xx":
        return formatTimezone(timezoneOffset);
      case "xxxxx":
      case "xxx":
      default:
        return formatTimezone(timezoneOffset, ":");
    }
  },
  O: function(date, token, _localize) {
    const timezoneOffset = date.getTimezoneOffset();
    switch (token) {
      case "O":
      case "OO":
      case "OOO":
        return "GMT" + formatTimezoneShort(timezoneOffset, ":");
      case "OOOO":
      default:
        return "GMT" + formatTimezone(timezoneOffset, ":");
    }
  },
  z: function(date, token, _localize) {
    const timezoneOffset = date.getTimezoneOffset();
    switch (token) {
      case "z":
      case "zz":
      case "zzz":
        return "GMT" + formatTimezoneShort(timezoneOffset, ":");
      case "zzzz":
      default:
        return "GMT" + formatTimezone(timezoneOffset, ":");
    }
  },
  t: function(date, token, _localize) {
    const timestamp = Math.trunc(+date / 1000);
    return addLeadingZeros(timestamp, token.length);
  },
  T: function(date, token, _localize) {
    return addLeadingZeros(+date, token.length);
  }
};
function formatTimezoneShort(offset, delimiter = "") {
  const sign = offset > 0 ? "-" : "+";
  const absOffset = Math.abs(offset);
  const hours = Math.trunc(absOffset / 60);
  const minutes = absOffset % 60;
  if (minutes === 0) {
    return sign + String(hours);
  }
  return sign + String(hours) + delimiter + addLeadingZeros(minutes, 2);
}
function formatTimezoneWithOptionalMinutes(offset, delimiter) {
  if (offset % 60 === 0) {
    const sign = offset > 0 ? "-" : "+";
    return sign + addLeadingZeros(Math.abs(offset) / 60, 2);
  }
  return formatTimezone(offset, delimiter);
}
function formatTimezone(offset, delimiter = "") {
  const sign = offset > 0 ? "-" : "+";
  const absOffset = Math.abs(offset);
  const hours = addLeadingZeros(Math.trunc(absOffset / 60), 2);
  const minutes = addLeadingZeros(absOffset % 60, 2);
  return sign + hours + delimiter + minutes;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/_lib/format/longFormatters.js
var dateLongFormatter = (pattern, formatLong2) => {
  switch (pattern) {
    case "P":
      return formatLong2.date({ width: "short" });
    case "PP":
      return formatLong2.date({ width: "medium" });
    case "PPP":
      return formatLong2.date({ width: "long" });
    case "PPPP":
    default:
      return formatLong2.date({ width: "full" });
  }
};
var timeLongFormatter = (pattern, formatLong2) => {
  switch (pattern) {
    case "p":
      return formatLong2.time({ width: "short" });
    case "pp":
      return formatLong2.time({ width: "medium" });
    case "ppp":
      return formatLong2.time({ width: "long" });
    case "pppp":
    default:
      return formatLong2.time({ width: "full" });
  }
};
var dateTimeLongFormatter = (pattern, formatLong2) => {
  const matchResult = pattern.match(/(P+)(p+)?/) || [];
  const datePattern = matchResult[1];
  const timePattern = matchResult[2];
  if (!timePattern) {
    return dateLongFormatter(pattern, formatLong2);
  }
  let dateTimeFormat;
  switch (datePattern) {
    case "P":
      dateTimeFormat = formatLong2.dateTime({ width: "short" });
      break;
    case "PP":
      dateTimeFormat = formatLong2.dateTime({ width: "medium" });
      break;
    case "PPP":
      dateTimeFormat = formatLong2.dateTime({ width: "long" });
      break;
    case "PPPP":
    default:
      dateTimeFormat = formatLong2.dateTime({ width: "full" });
      break;
  }
  return dateTimeFormat.replace("{{date}}", dateLongFormatter(datePattern, formatLong2)).replace("{{time}}", timeLongFormatter(timePattern, formatLong2));
};
var longFormatters = {
  p: timeLongFormatter,
  P: dateTimeLongFormatter
};

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/_lib/protectedTokens.js
var dayOfYearTokenRE = /^D+$/;
var weekYearTokenRE = /^Y+$/;
var throwTokens = ["D", "DD", "YY", "YYYY"];
function isProtectedDayOfYearToken(token) {
  return dayOfYearTokenRE.test(token);
}
function isProtectedWeekYearToken(token) {
  return weekYearTokenRE.test(token);
}
function warnOrThrowProtectedError(token, format, input) {
  const _message = message(token, format, input);
  console.warn(_message);
  if (throwTokens.includes(token))
    throw new RangeError(_message);
}
function message(token, format, input) {
  const subject = token[0] === "Y" ? "years" : "days of the month";
  return `Use \`${token.toLowerCase()}\` instead of \`${token}\` (in \`${format}\`) for formatting ${subject} to the input \`${input}\`; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md`;
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/format.js
var formattingTokensRegExp = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g;
var longFormattingTokensRegExp = /P+p+|P+|p+|''|'(''|[^'])+('|$)|./g;
var escapedStringRegExp = /^'([^]*?)'?$/;
var doubleQuoteRegExp = /''/g;
var unescapedLatinCharacterRegExp = /[a-zA-Z]/;
function format(date, formatStr, options) {
  const defaultOptions2 = getDefaultOptions();
  const locale = options?.locale ?? defaultOptions2.locale ?? enUS;
  const firstWeekContainsDate = options?.firstWeekContainsDate ?? options?.locale?.options?.firstWeekContainsDate ?? defaultOptions2.firstWeekContainsDate ?? defaultOptions2.locale?.options?.firstWeekContainsDate ?? 1;
  const weekStartsOn = options?.weekStartsOn ?? options?.locale?.options?.weekStartsOn ?? defaultOptions2.weekStartsOn ?? defaultOptions2.locale?.options?.weekStartsOn ?? 0;
  const originalDate = toDate(date, options?.in);
  if (!isValid(originalDate)) {
    throw new RangeError("Invalid time value");
  }
  let parts = formatStr.match(longFormattingTokensRegExp).map((substring) => {
    const firstCharacter = substring[0];
    if (firstCharacter === "p" || firstCharacter === "P") {
      const longFormatter = longFormatters[firstCharacter];
      return longFormatter(substring, locale.formatLong);
    }
    return substring;
  }).join("").match(formattingTokensRegExp).map((substring) => {
    if (substring === "''") {
      return { isToken: false, value: "'" };
    }
    const firstCharacter = substring[0];
    if (firstCharacter === "'") {
      return { isToken: false, value: cleanEscapedString(substring) };
    }
    if (formatters[firstCharacter]) {
      return { isToken: true, value: substring };
    }
    if (firstCharacter.match(unescapedLatinCharacterRegExp)) {
      throw new RangeError("Format string contains an unescaped latin alphabet character `" + firstCharacter + "`");
    }
    return { isToken: false, value: substring };
  });
  if (locale.localize.preprocessor) {
    parts = locale.localize.preprocessor(originalDate, parts);
  }
  const formatterOptions = {
    firstWeekContainsDate,
    weekStartsOn,
    locale
  };
  return parts.map((part) => {
    if (!part.isToken)
      return part.value;
    const token = part.value;
    if (!options?.useAdditionalWeekYearTokens && isProtectedWeekYearToken(token) || !options?.useAdditionalDayOfYearTokens && isProtectedDayOfYearToken(token)) {
      warnOrThrowProtectedError(token, formatStr, String(date));
    }
    const formatter = formatters[token[0]];
    return formatter(originalDate, token, locale.localize, formatterOptions);
  }).join("");
}
function cleanEscapedString(input) {
  const matched = input.match(escapedStringRegExp);
  if (!matched) {
    return input;
  }
  return matched[1].replace(doubleQuoteRegExp, "'");
}

// ../../node_modules/.bun/date-fns@4.4.0/node_modules/date-fns/formatDistanceStrict.js
function formatDistanceStrict(laterDate, earlierDate, options) {
  const defaultOptions2 = getDefaultOptions();
  const locale = options?.locale ?? defaultOptions2.locale ?? enUS;
  const comparison = compareAsc(laterDate, earlierDate);
  if (isNaN(comparison)) {
    throw new RangeError("Invalid time value");
  }
  const localizeOptions = Object.assign({}, options, {
    addSuffix: options?.addSuffix,
    comparison
  });
  const [laterDate_, earlierDate_] = normalizeDates(options?.in, ...comparison > 0 ? [earlierDate, laterDate] : [laterDate, earlierDate]);
  const roundingMethod = getRoundingMethod(options?.roundingMethod ?? "round");
  const milliseconds = earlierDate_.getTime() - laterDate_.getTime();
  const minutes = milliseconds / millisecondsInMinute;
  const timezoneOffset = getTimezoneOffsetInMilliseconds(earlierDate_) - getTimezoneOffsetInMilliseconds(laterDate_);
  const dstNormalizedMinutes = (milliseconds - timezoneOffset) / millisecondsInMinute;
  const defaultUnit = options?.unit;
  let unit;
  if (!defaultUnit) {
    if (minutes < 1) {
      unit = "second";
    } else if (minutes < 60) {
      unit = "minute";
    } else if (minutes < minutesInDay) {
      unit = "hour";
    } else if (dstNormalizedMinutes < minutesInMonth) {
      unit = "day";
    } else if (dstNormalizedMinutes < minutesInYear) {
      unit = "month";
    } else {
      unit = "year";
    }
  } else {
    unit = defaultUnit;
  }
  if (unit === "second") {
    const seconds = roundingMethod(milliseconds / 1000);
    return locale.formatDistance("xSeconds", seconds, localizeOptions);
  } else if (unit === "minute") {
    const roundedMinutes = roundingMethod(minutes);
    return locale.formatDistance("xMinutes", roundedMinutes, localizeOptions);
  } else if (unit === "hour") {
    const hours = roundingMethod(minutes / 60);
    return locale.formatDistance("xHours", hours, localizeOptions);
  } else if (unit === "day") {
    const days = roundingMethod(dstNormalizedMinutes / minutesInDay);
    return locale.formatDistance("xDays", days, localizeOptions);
  } else if (unit === "month") {
    const months = roundingMethod(dstNormalizedMinutes / minutesInMonth);
    return months === 12 && defaultUnit !== "month" ? locale.formatDistance("xYears", 1, localizeOptions) : locale.formatDistance("xMonths", months, localizeOptions);
  } else {
    const years = roundingMethod(dstNormalizedMinutes / minutesInYear);
    return locale.formatDistance("xYears", years, localizeOptions);
  }
}

// src/ui/view/guidance/restore.ts
function restoreBlock(status) {
  if (status === "local-only")
    return "Local-only files have no history on the server.";
  if (status === "conflict")
    return "Choose a side in Conflicts before restoring.";
  if (status === "detached")
    return "This file is detached; press Pull to reconcile it first.";
  return;
}

// src/ui/page/render/chip.ts
var tones = {
  "in-sync": "cold",
  "local-only": "idle",
  "local-changes": "warm",
  "remote-changes": "warm",
  "held-back": "alarm",
  missing: "alarm",
  detached: "alarm",
  conflict: "alarm",
  approved: "idle",
  "needs-approval": "warm",
  changed: "alarm",
  unavailable: "alarm"
};
function chip(value) {
  return el("span", {
    className: "chip",
    text: value.replaceAll("-", " "),
    data: { tone: tones[value] }
  });
}
function quiet(status) {
  return status === "in-sync" || status === "local-only";
}

// src/ui/page/render/window.ts
function windowPane(title, badge, lit, body) {
  const handle = () => el("span", { className: "handle" });
  const hatch = () => el("span", { className: "hatch" });
  return el("figure", { className: "window", data: { lit: String(lit) } }, [
    el("figcaption", { className: "bar" }, [
      handle(),
      hatch(),
      el("span", { className: "title", text: title }),
      hatch(),
      badge,
      handle()
    ]),
    el("div", { className: "pane" }, body)
  ]);
}

// src/ui/page/render/keys.ts
function keyList(keys) {
  if (!keys)
    return el("span", { className: "muted", text: "-" });
  if (keys.kind === "unparsed")
    return el("span", { className: "muted", text: `not parsed (${keys.reason})` });
  const items = [
    ...keys.added.map((key) => el("span", { className: "key-added", text: `+ ${key}` })),
    ...keys.removed.map((key) => el("span", { className: "key-removed", text: `- ${key}` })),
    ...keys.changed.map((key) => el("span", { text: `~ ${key}` }))
  ];
  if (!items.length)
    return el("span", { className: "muted", text: "layout only" });
  return el("span", { className: "keys" }, items);
}

// src/ui/page/render/history/changes.ts
function historyKeys(changes) {
  if (changes === "unknown")
    return el("span", { className: "muted", text: "changes unknown" });
  if (changes === "unparsed")
    return el("span", { className: "muted", text: "not parsed" });
  return keyList({ kind: "diff", ...changes });
}
function versionChanges(version) {
  if (version.kind === "deleted")
    return el("span", { className: "muted", text: "deleted" });
  if (version.kind === "lost")
    return el("span", { className: "muted", text: "lost in a server repair" });
  if (version.kind === "restored")
    return el("span", { className: "row" }, [
      el("span", { className: "muted", text: "restored by a server repair" }),
      historyKeys(version.changes)
    ]);
  return historyKeys(version.changes);
}

// src/ui/page/render/history/pane.ts
function historyPane(pane, actions) {
  const { root, file, history } = pane;
  const current = history.checkouts.find((checkout) => checkout.root === root)?.version;
  const block = restoreBlock(file.status);
  const rows = history.versions.map((version) => [
    el("span", { className: "row" }, [
      el("span", { className: "mono", text: `v${version.version}` }),
      ...version.version === current ? [el("span", { className: "chip", text: "current", data: { tone: "warm" } })] : []
    ]),
    el("span", { className: "mono muted", text: when(version, history.checkedAt) }),
    el("span", { text: origin(version) }),
    versionChanges(version),
    restorable(version, current, block) ? button("Restore as local edit", "quiet", `Restore v${version.version} of ${file.path}`, () => actions.ask(version.version)) : el("span")
  ]);
  return windowPane(`${history.repoId} ${file.path}`, chip(file.status), true, [
    el("div", { className: "row" }, [
      el("span", { className: "mono muted", text: root }),
      button("Close", "link", "Close history", actions.close)
    ]),
    ...block ? [el("p", { className: "callout", text: block })] : [],
    history.versions.length ? table(["Version", "Time", "Device", "Keys", ""], rows) : el("p", { className: "empty", text: "No retained versions." }),
    ...footnotes(history, current),
    ...pane.asking === undefined ? [] : [confirmStrip(file, pane.asking, actions)],
    ...pane.outcome ? [outcomeStrip(file, pane.outcome)] : []
  ]);
}
function restorable(version, current, block) {
  return !block && version.version !== current && (version.kind === "live" || version.kind === "restored");
}
function when(version, now) {
  if (!version.time)
    return "unknown time";
  return `${formatDistanceStrict(new Date(version.time), now, { addSuffix: true })} · ${format(new Date(version.time), "PP p")}`;
}
function origin(version) {
  return version.device ?? (version.removedDevice ? "removed device" : "unknown device");
}
function footnotes(history, current) {
  return [
    ...history.pruned ? ["Older versions pruned."] : [],
    ...current === undefined && history.versions.length ? ["This checkout matches no retained version."] : []
  ].map((text) => el("p", { className: "muted", text }));
}
function confirmStrip(file, version, actions) {
  return el("div", { className: "strip", data: { tone: "warm" } }, [
    el("p", {
      text: `Restore v${version} of ${file.path} as a local edit? Your current file is backed up first, and nothing reaches the server until you Push.`
    }),
    el("div", { className: "actions" }, [
      button(`Restore v${version}`, "primary", `Confirm restoring v${version}`, () => actions.restore(version)),
      button("Cancel", "quiet", "Cancel restore", actions.cancel)
    ])
  ]);
}
function outcomeStrip(file, outcome) {
  if (outcome.kind === "refused")
    return el("div", { className: "strip", data: { tone: "alarm" } }, [
      el("p", { text: outcome.message })
    ]);
  if (outcome.kind === "unchanged")
    return el("div", { className: "strip" }, [
      el("p", { text: `${file.path} already matches v${outcome.version}.` })
    ]);
  return el("div", { className: "strip", data: { tone: "warm" } }, [
    el("p", { text: `Restored v${outcome.version} of ${file.path} as a local edit:` }),
    historyKeys(outcome.changes),
    el("p", {
      className: "muted",
      text: "Review the keys in Repos, then press Push to publish them."
    })
  ]);
}

// src/ui/page/render/reveal.ts
function reveal(target) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  target.dataset.flash = "false";
  requestAnimationFrame(() => target.dataset.flash = "true");
}

// src/ui/page/history.ts
function createHistory(call, refresh) {
  let pane;
  const load = (root, path) => call(`history?${new URLSearchParams({ root, path }).toString()}`);
  const draw = () => {
    byId("history-section").hidden = !pane;
    byId("history").replaceChildren(...pane ? [historyPane(pane, actions)] : []);
  };
  const update = (change) => {
    if (pane)
      pane = { ...pane, ...change };
    draw();
  };
  const actions = {
    ask: (version) => update({ asking: version, outcome: undefined }),
    cancel: () => update({ asking: undefined }),
    restore: (version) => void restore(version),
    close: () => {
      pane = undefined;
      draw();
    }
  };
  async function restore(version) {
    if (!pane)
      return;
    const { root, file } = pane;
    await busy(`Restoring v${version} of ${file.path}...`, async () => {
      try {
        const result = await call("history/restore", {
          root,
          path: file.path,
          version
        });
        const restored = result.kind === "restored";
        await refresh();
        update({
          history: await load(root, file.path),
          asking: undefined,
          outcome: { kind: restored ? "restored" : "unchanged", version, changes: result.changes }
        });
        notify(restored ? `Restored v${version} of ${file.path} locally. Review it, then press Push.` : `${file.path} already matches v${version}.`);
      } catch (error) {
        update({ asking: undefined, outcome: { kind: "refused", message: errorText(error) } });
        notify("Restore refused; see History.", true);
      }
    });
  }
  async function open(checkout, file) {
    await busy(`Loading history of ${file.path}...`, async () => {
      pane = { root: checkout.root, file, history: await load(checkout.root, file.path) };
      draw();
      reveal(byId("history-section"));
      notify(`History of ${file.path}. Key names only, never values.`);
    });
  }
  function track(repos) {
    const open2 = pane;
    if (!open2)
      return;
    const file = repos.flatMap((repo) => repo.checkouts).find((checkout) => checkout.root === open2.root)?.files.find((item) => item.path === open2.file.path);
    if (file)
      update({ file });
  }
  return { open, track };
}

// src/ui/page/rename.ts
function createRename(call, refresh) {
  return async function rename(name) {
    let failure;
    await busy("Renaming this device...", async () => {
      try {
        const result = await call("devices/rename", { name });
        await refresh();
        notify(result.kind === "renamed" ? `This device is now ${name}.` : "This device already has that name.");
      } catch (error) {
        failure = errorText(error);
        notify("Rename failed; see Devices.", true);
      }
    });
    return failure;
  };
}

// src/ui/page/render/conflicts.ts
function renderConflicts(target, conflicts, resolve) {
  if (!conflicts.length) {
    target.replaceChildren(el("p", { className: "empty", text: "No conflicts." }));
    return;
  }
  target.replaceChildren(...conflicts.map((conflict) => {
    const pane = windowPane(conflict.path, el("span", { className: "chip", text: "conflict", data: { tone: "alarm" } }), true, [
      ...conflict.roots.map((root) => el("span", { className: "mono muted", text: root })),
      sides(conflict),
      el("div", { className: "actions" }, [
        choiceButton(conflict, "keep-mine", resolve),
        choiceButton(conflict, "take-server", resolve)
      ])
    ]);
    pane.dataset.conflict = conflict.id;
    return pane;
  }));
}
function sides(conflict) {
  const keys = conflict.keys;
  const yours = conflict.mineDeleted ? ["deleted"] : keys.kind === "diff" ? [...keys.changed, ...keys.added.map((key) => `${key} (only here)`)] : [`not parsed (${keys.reason})`];
  const server = conflict.serverDeleted ? ["deleted"] : keys.kind === "diff" ? [...keys.changed, ...keys.removed.map((key) => `${key} (only there)`)] : [`not parsed (${keys.reason})`];
  const side = (label, items) => el("div", {}, [
    el("p", { className: "label", text: label }),
    el("div", { className: "keys" }, (items.length ? items : ["no key changes"]).map((text) => el("span", { text })))
  ]);
  return el("div", { className: "sides" }, [side("Yours", yours), side("Server", server)]);
}
function choiceButton(conflict, choice, resolve) {
  const text = choice === "keep-mine" ? "Keep mine" : "Take server";
  const tone = choice === "keep-mine" ? "quiet" : "primary";
  return button(text, tone, `${text} for ${conflict.path}`, () => resolve(conflict, choice));
}

// src/ui/view/summary.ts
var plural = new Intl.PluralRules("en");
function syncSummary(kind, changed, conflicts) {
  const noun = plural.select(conflicts) === "one" ? "conflict" : "conflicts";
  return `${kind === "pull" ? "Pulled" : "Pushed"}: ${changed} changed, ${conflicts} ${noun}.`;
}

// src/ui/page/render/devices/rename.ts
function renameControl(current, rename) {
  const control = el("div", { className: "rename" });
  const closed = () => control.replaceChildren(button("Rename", "quiet", "Rename this device", open));
  const open = () => {
    const input = el("input", { className: "input", label: "New name for this device" });
    const error = el("p", { className: "field-error" });
    const save = el("button", { className: "button small primary", text: "Save" });
    input.value = current;
    input.autocomplete = "off";
    input.spellcheck = false;
    error.setAttribute("aria-live", "polite");
    save.type = "submit";
    const form = el("form", { className: "rename-form" }, [
      el("div", { className: "row" }, [
        input,
        save,
        button("Cancel", "quiet", "Cancel renaming", closed)
      ]),
      error
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      error.textContent = "";
      rename(input.value).then((message2) => {
        if (!message2)
          return;
        error.textContent = message2;
        input.focus();
      });
    });
    control.replaceChildren(form);
    input.focus();
    input.select();
  };
  closed();
  return control;
}

// src/ui/page/render/devices/list.ts
function renderDevices(target, devices, rename) {
  target.replaceChildren(el("ul", { className: "cells", label: "Devices" }, devices.map((device) => el("li", { className: "cell" }, [
    el("h3", { text: device.name }),
    el("span", { className: device.current ? "accent" : "muted", text: flags(device) }),
    el("span", {
      className: "mono muted",
      text: device.clientVersion ? `v${device.clientVersion}` : "version unknown"
    }),
    ...device.current ? [renameControl(device.name, rename)] : []
  ]))));
}
function flags(device) {
  return [
    device.current ? "this device" : "",
    device.unconfirmed ? "unconfirmed" : "",
    device.recoveryKeyHeld ? "holds recovery key" : ""
  ].filter(Boolean).join(" · ") || "member";
}

// src/ui/view/unlock/text.ts
var fixed = {
  never: "never expires",
  locked: "locked — run envden unlock in a terminal",
  unrecorded: "unlocked; expiry not recorded on this device",
  unknown: "unknown; the server is unreachable"
};
function unlockText(unlock, now, date) {
  if (unlock.kind !== "until")
    return fixed[unlock.kind];
  if (unlock.until <= now)
    return fixed.locked;
  return `${date(unlock.until)} (${formatDistanceStrict(unlock.until, now, { addSuffix: true })})`;
}

// src/ui/page/render/overview.ts
var lights = { reachable: "good", error: "bad" };
function renderOverview(target, overview, conflicts) {
  const cell = (term, value, attention = false) => el("div", { data: { attention: String(attention) } }, [
    el("dt", { className: "label", text: term }),
    el("dd", { className: "mono" }, value)
  ]);
  const text = (value) => el("span", { text: value });
  target.replaceChildren(cell("Server", [
    el("span", {
      className: "light",
      label: overview.server.reachability,
      data: { tone: lights[overview.server.reachability] ?? "idle" }
    }),
    text(overview.server.address)
  ]), cell("Vault", [text(overview.vaultId)]), cell("Unlock", [text(unlockText(overview.unlock, overview.checkedAt, (ms) => format(ms, "PP p")))], overview.unlock.kind === "locked"), cell("Pending", [text(String(overview.pending))], overview.pending > 0), cell("Conflicts", [text(String(conflicts))], conflicts > 0));
}

// src/ui/view/guidance/held.ts
var guidance = {
  "invalid-state": "invalid sync state; press Pull, then settle any conflict above",
  oversized: "file exceeds 1 MiB; reduce its size before pushing",
  "needs-approval": "checkout needs approval; run envden track in a terminal",
  excluded: "excluded by env-files; change them with envden config in a terminal",
  conflict: "choose a side in Conflicts",
  lost: "content was lost outside envden; restore a version from History",
  incomplete: "placement incomplete; press Pull"
};
function heldGuidance(held) {
  return guidance[held];
}

// src/ui/page/render/repos.ts
function renderRepos(target, repos, actions) {
  if (!repos.length) {
    target.replaceChildren(el("p", { className: "empty", text: "No tracked env files yet." }));
    return;
  }
  target.replaceChildren(...repos.map((repo) => windowPane(repo.repoId, chip(repo.status), !quiet(repo.status), repo.checkouts.map((checkout) => checkoutBlock(checkout, actions)))));
}
function checkoutBlock(checkout, actions) {
  return el("div", { className: "checkout" }, [
    el("div", { className: "row" }, [
      el("span", { className: "mono", text: checkout.root }),
      chip(checkout.approval)
    ]),
    table(["File", "Placement", "Status", "Keys", ""], checkout.files.map((file) => [
      el("span", { className: "mono", text: file.path }),
      el("span", { className: "mono muted", text: file.mode }),
      statusCell(file, actions),
      keyList(file.keys),
      button("History", "link", `History of ${file.path}`, () => actions.history(checkout, file))
    ]))
  ]);
}
function statusCell(file, actions) {
  const conflictId = file.conflictId;
  const hint = conflictId ? button("Show conflict", "link", `Show the conflict in ${file.path}`, () => actions.showConflict(conflictId)) : file.held && el("span", { className: "muted", text: heldGuidance(file.held) });
  return el("span", { className: "row" }, [chip(file.status), ...hint ? [hint] : []]);
}

// src/ui/page/main.ts
var call = createApi(location.hash.slice(1));
var history = createHistory(call, refresh);
var rename = createRename(call, refresh);
async function refresh() {
  const status = await call("status");
  if (status.kind === "not-configured") {
    notify("This device isn't set up. Run envden setup or envden join in a terminal.", true);
    return false;
  }
  byId("device").textContent = status.overview.deviceName;
  renderOverview(byId("overview"), status.overview, status.conflicts.length);
  renderConflicts(byId("conflicts"), status.conflicts, resolve);
  renderRepos(byId("repos"), status.repos, { showConflict, history: history.open });
  history.track(status.repos);
  await call("devices").then((devices) => renderDevices(byId("devices"), devices, rename), (error) => {
    byId("devices").textContent = errorText(error);
  });
  return true;
}
function showConflict(id) {
  const panes = byId("conflicts").querySelectorAll("[data-conflict]");
  const pane = [...panes].find((item) => item.dataset.conflict === id);
  if (pane)
    reveal(pane);
}
function sync(kind) {
  return busy(kind === "pull" ? "Pulling from the server..." : "Pushing to the server...", async () => {
    const result = await call(kind, {});
    await refresh();
    notify([syncSummary(kind, result.changed, result.conflicts), ...result.reports ?? []].join(" "), result.conflicts > 0);
  });
}
function resolve(conflict, choice) {
  const side = choice === "keep-mine" ? "your version" : "the server's version";
  if (!confirm(`Use ${side} of ${conflict.path}? The other side is backed up.`))
    return;
  busy("Resolving...", async () => {
    await call("resolve", { id: conflict.id, choice });
    await refresh();
    notify(`Resolved ${conflict.path}. Push to send it to your other devices.`);
  });
}
function ready() {
  notify("Ready. Nothing syncs until you press Pull or Push.");
}
byId("refresh").addEventListener("click", () => void busy("Refreshing...", async () => {
  if (await refresh())
    ready();
}));
byId("pull").addEventListener("click", () => void sync("pull"));
byId("push").addEventListener("click", () => void sync("push"));
if (location.hash.length > 1)
  busy("Loading...", async () => {
    if (await refresh())
      ready();
  });
else
  notify("Open the link that envden ui printed in your terminal.", true);
