import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import path from "node:path";


// ======================================================
// 설정
// ======================================================

const CALENDAR_URL =
  "https://script.google.com/macros/s/AKfycbwUO_LkuybqEmAISdZg5MuzyfBw14Yege2GOyaS1nkl5L7lXrL__GFxWE3jSx-vx56c/exec";

const FONT_REGULAR = path.join(
  process.cwd(),
  "fonts",
  "Pretendard-Regular.otf"
);

const FONT_SEMIBOLD = path.join(
  process.cwd(),
  "fonts",
  "Pretendard-SemiBold.otf"
);

const FONT_BOLD = path.join(
  process.cwd(),
  "fonts",
  "Pretendard-Bold.otf"
);

const FONT_EXTRABOLD = path.join(
  process.cwd(),
  "fonts",
  "Pretendard-ExtraBold.otf"
);

const PANEL_W = 800;
const PANEL_H = 480;


// ======================================================
// 샘플 데이터
// 이후 실제 API / ESP32 값으로 교체
// ======================================================

const WEATHER_LOCATION = "아산";

function weatherCodeToText(code) {
  if (code === 0) return "맑음";
  if ([1, 2].includes(code)) return "대체로 맑음";
  if (code === 3) return "흐림";
  if ([45, 48].includes(code)) return "안개";
  if ([51, 53, 55, 56, 57].includes(code)) return "이슬비";
  if ([61, 63, 65, 66, 67].includes(code)) return "비";
  if ([71, 73, 75, 77].includes(code)) return "눈";
  if ([80, 81, 82].includes(code)) return "소나기";
  if ([85, 86].includes(code)) return "눈 소나기";
  if ([95, 96, 99].includes(code)) return "뇌우";

  return "날씨";
}


function pm25ToText(pm25) {
  // 화면용 단순 분류
  if (pm25 == null) return "정보 없음";
  if (pm25 <= 15) return "좋음";
  if (pm25 <= 35) return "보통";
  if (pm25 <= 75) return "나쁨";
  return "매우 나쁨";
}


async function getWeather() {

  // 1. 도시 이름 → 좌표
  const geoURL =
    "https://geocoding-api.open-meteo.com/v1/search" +
    `?name=${encodeURIComponent(WEATHER_LOCATION)}` +
    "&count=1" +
    "&language=ko" +
    "&countryCode=KR";

  const geoRes = await fetch(geoURL);

  if (!geoRes.ok) {
    throw new Error("Geocoding failed");
  }

  const geo = await geoRes.json();

  if (!geo.results?.length) {
    throw new Error("Location not found");
  }

  const place = geo.results[0];

  const lat = place.latitude;
  const lon = place.longitude;


  // 2. 실제 날씨
  const weatherURL =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}` +
    `&longitude=${lon}` +
    "&current=temperature_2m,weather_code" +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=Asia%2FSeoul" +
    "&forecast_days=1";

  const weatherRes = await fetch(weatherURL);

  if (!weatherRes.ok) {
    throw new Error("Weather fetch failed");
  }

  const w = await weatherRes.json();


  // 3. 미세먼지
  const airURL =
    "https://air-quality-api.open-meteo.com/v1/air-quality" +
    `?latitude=${lat}` +
    `&longitude=${lon}` +
    "&current=pm2_5" +
    "&timezone=Asia%2FSeoul";

  const airRes = await fetch(airURL);

  let pm25 = null;

  if (airRes.ok) {
    const air = await airRes.json();
    pm25 = air.current?.pm2_5 ?? null;
  }


  return {
    condition:
      weatherCodeToText(
        w.current.weather_code
      ),

    temp:
      Math.round(
        w.current.temperature_2m
      ),

    low:
      Math.round(
        w.daily.temperature_2m_min[0]
      ),

    high:
      Math.round(
        w.daily.temperature_2m_max[0]
      ),

    rain:
      Math.round(
        w.daily.precipitation_probability_max[0] ?? 0
      ),

    dust:
      pm25ToText(pm25),

    location:
      place.name
  };
}

const DDAY = {
  value: "D-72",
  title: "겨울방학"
};

const BATTERY = {
  percent: 82,
  measured: "14:10"
};
const FALLBACK_MARKET = {
  kospi: {
    value: 0,
    change: 0,
    rate: 0,
    points: [1, 1, 1, 1, 1]
  },

  usdkrw: 0,
  jpykrw100: 0
};

async function fetchYahooChart(
  symbol,
  range = "1mo",
  interval = "1d"
) {

  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol) +
    `?range=${range}` +
    `&interval=${interval}`;

  const response =
    await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });

  if (!response.ok) {
    throw new Error(
      `Yahoo ${symbol}: HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  const result =
    data?.chart?.result?.[0];

  if (!result) {
    throw new Error(
      `Yahoo ${symbol}: no result`
    );
  }

  const closes =
    (
      result
        ?.indicators
        ?.quote?.[0]
        ?.close || []
    )
      .filter(
        value =>
          Number.isFinite(value)
      );

  const price =
    result.meta?.regularMarketPrice ??
    closes.at(-1);

  const previousClose =
    result.meta?.previousClose ??
    (
      closes.length >= 2
        ? closes.at(-2)
        : price
    );

  if (!Number.isFinite(price) || price <= 0 ||
      !Number.isFinite(previousClose) || previousClose <= 0) {
    throw new Error(`Yahoo ${symbol}: invalid price data`);
  }

  return {
    price,
    previousClose,
    closes
  };
}


async function getMarketData() {

  const [
    kospi,
    usd,
    jpy
  ] =
    await Promise.all([

      fetchYahooChart(
        "^KS11",
        "1mo",
        "1d"
      ),

      fetchYahooChart(
        "KRW=X",
        "5d",
        "1d"
      ),

      fetchYahooChart(
        "JPYKRW=X",
        "5d",
        "1d"
      )
    ]);


  const change =
    kospi.price -
    kospi.previousClose;

  const rate =
    kospi.previousClose
      ? change /
        kospi.previousClose *
        100
      : 0;


  return {

    kospi: {
      value: kospi.price,
      change,
      rate,

      points:
        kospi.closes
          .slice(-12)
    },

    usdkrw:
      usd.price,

    jpykrw100:
      jpy.price * 100
  };
}


function formatNumber(
  value,
  digits = 2
) {

  if (!Number.isFinite(value)) {
    return "-";
  }

  return value.toLocaleString(
    "ko-KR",
    {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }
  );
}


function formatSigned(
  value,
  digits = 2
) {

  if (!Number.isFinite(value)) {
    return "-";
  }

  const prefix =
    value > 0
      ? "+"
      : "";

  return (
    prefix +
    value.toFixed(digits)
  );
}

const TODOS = [
  { done: true,  title: "학부모 상담 연락" },
  { done: true,  title: "수행평가 자료 확인" },
  { done: false, title: "수업 PPT 수정" },
  { done: false, title: "교실 정리" }
];

const IMPORTANT = [
  {
    tag: "D-12",
    title: "중간고사",
    date: "9.19",
    red: true
  },
  {
    tag: "D-72",
    title: "겨울방학",
    date: "11.27",
    red: false
  }
];



// ======================================================
// XML
// ======================================================

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}


function shorten(value, max = 19) {

  const chars = [...String(value)];

  if (chars.length <= max) {
    return value;
  }

  return (
    chars
      .slice(0, max - 1)
      .join("") + "…"
  );
}


// ======================================================
// 날짜
// ======================================================

function getDateInfo(dateString) {

  const date =
    new Date(
      `${dateString}T12:00:00+09:00`
    );

  const weekdays = [
    "일요일",
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일"
  ];

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    weekday: weekdays[date.getDay()]
  };
}


// ======================================================
// 월간 달력
// ======================================================

function makeCalendar(year, month) {

  const first =
    new Date(year, month - 1, 1);

  const lastDay =
    new Date(year, month, 0)
      .getDate();

  const cells = [];

  for (
    let i = 0;
    i < first.getDay();
    i++
  ) {
    cells.push(null);
  }

  for (
    let day = 1;
    day <= lastDay;
    day++
  ) {
    cells.push(day);
  }

  return cells;
}


function calendarSvg(info) {

  const cells =
    makeCalendar(
      info.year,
      info.month
    );

  const weekNames =
    ["일", "월", "화", "수", "목", "금", "토"];


  // 조금 확대
  const startX = 320;
  const startY = 72;

  const cellW = 20;
  const cellH = 23;


  let svg = `
    <text
      x="380"
      y="43"
      class="calendarTitle"
      text-anchor="middle">
      ${info.year}.${String(info.month).padStart(2, "0")}
    </text>
  `;


  weekNames.forEach(
    (name, col) => {

      svg += `
        <text
          x="${startX + col * cellW}"
          y="${startY}"
          class="${
            col === 0
              ? "calendarSunday"
              : "calendarWeek"
          }"
          text-anchor="middle">
          ${name}
        </text>
      `;
    }
  );


  cells.forEach(
    (day, index) => {

      if (!day) return;

      const col =
        index % 7;

      const row =
        Math.floor(index / 7);

      const x =
        startX + col * cellW;

      const y =
        startY + 24 + row * cellH;

      const today =
        day === info.day;


      if (today) {

        svg += `
          <circle
            cx="${x}"
            cy="${y - 4}"
            r="10"
            fill="#000"
          />

          <text
            x="${x}"
            y="${y}"
            class="calendarToday"
            text-anchor="middle">
            ${day}
          </text>
        `;

      } else {

        svg += `
          <text
            x="${x}"
            y="${y}"
            class="${
              col === 0
                ? "calendarSunday"
                : "calendarDay"
            }"
            text-anchor="middle">
            ${day}
          </text>
        `;
      }
    }
  );

  return svg;
}


// ======================================================
// KOSPI 그래프
// ======================================================

function sparklineSvg(market) {

  const values =
    market.kospi.points;


  if (
    !values ||
    values.length < 2
  ) {
    return "";
  }


  const min =
    Math.min(...values);

  const max =
    Math.max(...values);

  const range =
    Math.max(
      0.01,
      max - min
    );


  const x = 132;
  const y = 744;

  const width = 148;
  const height = 31;


  const points =
    values
      .map(
        (value, index) => {

          const px =
            x +
            (
              index /
              (values.length - 1)
            ) *
            width;


          const py =
            y +
            height -
            (
              (value - min) /
              range
            ) *
            height;


          return `${px},${py}`;
        }
      )
      .join(" ");


  const last =
    values.at(-1);


  const finalY =
    y +
    height -
    (
      (last - min) /
      range
    ) *
    height;


  const pointColor =
    market.kospi.change >= 0
      ? "#c00000"
      : "#000000";


  return `
    <polyline
      points="${points}"
      fill="none"
      stroke="#000"
      stroke-width="1.8"
      stroke-linejoin="round"
      stroke-linecap="round"
    />

    <circle
      cx="${x + width}"
      cy="${finalY}"
      r="3.2"
      fill="${pointColor}"
    />
  `;
}

// ======================================================
// 일정
// ======================================================

function eventsSvg(events) {

  if (!events.length) {

    return `
      <text
        x="34"
        y="430"
        class="empty">
        오늘 등록된 일정이 없습니다
      </text>
    `;
  }


  return events
    .slice(0, 4)
    .map(
      (event, index) => {

        const top =
          404 + index * 47;

        const time =
          event.allDay
            ? "종일"
            : event.start;

        const end =
          event.allDay
            ? ""
            : event.end;


        return `
          <line
            x1="24"
            y1="${top + 35}"
            x2="456"
            y2="${top + 35}"
            class="softLine"
          />

          <rect
            x="29"
            y="${top - 5}"
            width="14"
            height="14"
            rx="2"
            fill="none"
            stroke="#000"
            stroke-width="1.4"
          />

          <text
            x="57"
            y="${top}"
            class="eventTime">
            ${esc(time)}
          </text>

          ${
            end
              ? `
                <text
                  x="57"
                  y="${top + 14}"
                  class="eventEnd">
                  -${esc(end)}
                </text>
              `
              : ""
          }

          <text
            x="126"
            y="${top + 5}"
            class="eventTitle">
            ${esc(
              shorten(
                event.title,
                18
              )
            )}
          </text>
        `;
      }
    )
    .join("");
}


// ======================================================
// TODO
// ======================================================

function todoSvg(lowerTop) {

  return TODOS
    .slice(0, 3)
    .map(
      (item, index) => {

        const y =
          lowerTop + 37 + index * 22;

        return `
          <rect
            x="29"
            y="${y - 10}"
            width="10"
            height="10"
            rx="1"
            fill="${
              item.done
                ? "#c00000"
                : "white"
            }"
            stroke="${
              item.done
                ? "#c00000"
                : "#000"
            }"
            stroke-width="1.2"
          />

          ${
            item.done
              ? `
                <path
                  d="
                    M31 ${y - 5}
                    L34 ${y - 2}
                    L38 ${y - 8}
                  "
                  stroke="white"
                  stroke-width="1.2"
                  fill="none"
                />
              `
              : ""
          }

          <text
            x="49"
            y="${y}"
            class="todo">
            ${esc(item.title)}
          </text>
        `;
      }
    )
    .join("");
}


// ======================================================
// 주요 일정
// ======================================================

function importantSvg(lowerTop) {

  return IMPORTANT
    .map(
      (item, index) => {

        const y =
          lowerTop + 37 + index * 29;

        return `
          <rect
            x="252"
            y="${y - 14}"
            width="39"
            height="17"
            rx="8"
            fill="${
              item.red
                ? "#c00000"
                : "#000"
            }"
          />

          <text
            x="271.5"
            y="${y - 2}"
            text-anchor="middle"
            class="tag">
            ${esc(item.tag)}
          </text>

          <text
            x="301"
            y="${y}"
            class="importantTitle">
            ${esc(item.title)}
          </text>

          <text
            x="440"
            y="${y}"
            class="importantDate"
            text-anchor="end">
            ${esc(item.date)}
          </text>
        `;
      }
    )
    .join("");
}


// ======================================================
// 대시보드
// ======================================================

function makeDashboardSvg(calendar, weather, market) {

  const info =
    getDateInfo(calendar.date);

  const events =
    calendar.events || [];

  const done =
    TODOS.filter(v => v.done).length;


  // ==================================================
  // 일정 수에 따른 하단 영역 위치 자동조정
  // ==================================================

  const visibleEvents =
    Math.min(events.length, 4);

  const calculatedLower =
    405 +
    Math.max(visibleEvents, 1) * 47 +
    25;

  const lowerTop =
    Math.min(
      590,
      Math.max(
        510,
        calculatedLower
      )
    );


  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="480"
  height="800"
  viewBox="0 0 480 800">

  <rect
    width="480"
    height="800"
    fill="#ffffff"
  />

  <style>

    text {
  font-family: "Pretendard";
  fill: #000;
}

    .thin {
      stroke: #000;
      stroke-width: 0.7;
    }

    .softLine {
      stroke: #000;
      stroke-width: 0.45;
    }

    .strongLine {
      stroke: #000;
      stroke-width: 1.6;
    }


    /* ---------------- WEATHER ---------------- */

    .weatherName {
      font-size: 16px;
      font-weight: 700;
      fill: #000;
    }

    .temperature {
      font-size: 54px;
      font-weight: 800;
    }

    .weatherSub {
      font-size: 13px;
      fill: #000;
      font-weight: 600;
    }


    /* ---------------- DATE ---------------- */

    .year {
      font-size: 21px;
      font-weight: 700;
    }

    .bigDay {
      font-size: 77px;
      font-weight: 800;
    }

    .weekday {
      font-size: 20px;
      font-weight: 700;
    }


    /* ---------------- CALENDAR ---------------- */

    .calendarTitle {
      font-size: 14px;
      font-weight: 700;
      fill: #000;
    }

    .calendarWeek {
      font-size: 11px;
      fill: #000;
      font-weight: 600;
    }

    .calendarSunday {
      font-size: 11px;
      fill: #c00000;
      font-weight: 700;
    }

    .calendarDay {
      font-size: 11px;
      fill: #000;
      font-weight: 600;
    }

    .calendarToday {
      font-size: 11px;
      fill: #fff;
      font-weight: 700;
    }


    /* ---------------- SUMMARY ---------------- */

    .infoLabel {
      font-size: 12px;
      fill: #000;
      font-weight: 700;
    }

    .infoBig {
      font-size: 18px;
      font-weight: 800;
    }

    .infoSmall {
      font-size: 11px;
      fill: #000;
      font-weight: 600;
    }

    .red {
      fill: #c00000;
    }


    /* ---------------- EVENTS ---------------- */

    .sectionTitle {
      font-size: 22px;
      font-weight: 700;
    }

    .eventCount {
      font-size: 12px;
      font-weight: 700;
      fill: #000;
    }

    .eventTime {
      font-size: 13px;
      font-weight: 700;
      fill: #000;
    }

    .eventEnd {
      font-size: 11px;
      fill: #000;
      font-weight: 600;
    }

    .eventTitle {
      font-size: 16px;
      font-weight: 600;
      fill: #000;
    }

    .empty {
      font-size: 15px;
      fill: #000;
      font-weight: 600;
    }


    /* ---------------- LOWER ---------------- */

    .lowerTitle {
      font-size: 15px;
      font-weight: 800;
    }

    .todo {
      font-size: 12px;
      fill: #000;
      font-weight: 600;
    }

    .tag {
      font-size: 9px;
      fill: fff;
      font-weight: 700;
    }

    .importantTitle {
      font-size: 11px;
      fill: fff;
      font-weight: 700;
    }

    .importantDate {
      font-size: 11px;
      fill: #000;
      font-weight: 600;
    }


    /* ---------------- MARKET ---------------- */

    .marketLabel {
      font-size: 11px;
      font-weight: 700;
      fill: #000;
    }

    .marketBig {
      font-size: 20px;
      font-weight: 800;
    }

    .marketChange {
      font-size: 11px;
      fill: #c00000;
      font-weight: 700;
    }

    .exchange {
      font-size: 11px;
      fill: #000;
      font-weight: 600;
    }

  </style>


  <!-- ================================================= -->
  <!-- TOP -->
  <!-- ================================================= -->

  <line
    x1="157"
    y1="25"
    x2="157"
    y2="243"
    class="thin"
  />

  <line
    x1="305"
    y1="25"
    x2="305"
    y2="243"
    class="thin"
  />


  <!-- 날씨 -->

  <circle
    cx="47"
    cy="51"
    r="10"
    fill="none"
    stroke="#000"
    stroke-width="2"
  />

  <path
    d="
      M29 65
      C29 54 39 51 47 56
      C50 44 66 44 70 55
      C81 52 88 59 86 66
      H31
      Z
    "
    fill="white"
    stroke="#000"
    stroke-width="2"
  />

  <text
    x="91"
    y="58"
    class="weatherName">
    ${esc(weather.condition)}
  </text>

  <text
    x="25"
    y="120"
    class="temperature">
    ${weather.temp}°
  </text>

  <text
    x="27"
    y="146"
    class="weatherSub">
    최저 ${weather.low}° · 최고 ${weather.high}°
  </text>

  <text
    x="27"
    y="178"
    class="weatherSub">
    ${esc(weather.location)}
  </text>

  <text
    x="27"
    y="202"
    class="weatherSub">
    강수확률 ${weather.rain}%
  </text>

  <text
    x="27"
    y="226"
    class="weatherSub">
    미세먼지 ${esc(weather.dust)}
  </text>


  <!-- 날짜 -->

  <text
    x="231"
    y="58"
    class="year"
    text-anchor="middle">
    ${info.year}
  </text>

  <text
    x="231"
    y="153"
    class="bigDay"
    text-anchor="middle">
    ${info.day}
  </text>

  <text
    x="231"
    y="198"
    class="weekday"
    text-anchor="middle">
    ${esc(info.weekday)}
  </text>


  <!-- 월간 달력 -->

  ${calendarSvg(info)}


  <!-- ================================================= -->
  <!-- SUMMARY -->
  <!-- ================================================= -->

  <line
    x1="20"
    y1="260"
    x2="460"
    y2="260"
    class="strongLine"
  />

  <line
    x1="20"
    y1="343"
    x2="460"
    y2="343"
    class="strongLine"
  />

  <line
    x1="162"
    y1="260"
    x2="162"
    y2="343"
    class="thin"
  />

  <line
    x1="328"
    y1="260"
    x2="328"
    y2="343"
    class="thin"
  />


  <text
    x="29"
    y="284"
    class="infoLabel">
    오늘 일정
  </text>

  <text
    x="29"
    y="318"
    class="infoBig">
    ${events.length}건
  </text>


  <text
    x="181"
    y="284"
    class="infoLabel">
    D-day
  </text>

  <text
    x="181"
    y="313"
    class="infoBig red">
    ${esc(DDAY.value)}
  </text>

  <text
    x="181"
    y="333"
    class="infoSmall">
    ${esc(DDAY.title)}
  </text>


  <!-- 배터리 -->

  <rect
    x="350"
    y="278"
    width="31"
    height="17"
    rx="3"
    fill="none"
    stroke="#000"
    stroke-width="2"
  />

  <rect
    x="381"
    y="283"
    width="4"
    height="7"
    fill="#000"
  />

  <rect
    x="354"
    y="282"
    width="${
      Math.round(
        23 *
        BATTERY.percent /
        100
      )
    }"
    height="9"
    fill="#000"
  />

  <text
    x="393"
    y="293"
    class="infoBig">
    ${BATTERY.percent}%
  </text>

  <text
    x="350"
    y="319"
    class="infoSmall">
    측정 ${esc(BATTERY.measured)}
  </text>


  <!-- ================================================= -->
  <!-- EVENTS -->
  <!-- ================================================= -->

  <text
    x="23"
    y="375"
    class="sectionTitle">
    오늘의 일정
  </text>

  <text
    x="452"
    y="375"
    text-anchor="end"
    class="eventCount">
    ${events.length}건
  </text>

  <line
    x1="22"
    y1="389"
    x2="458"
    y2="389"
    class="softLine"
  />


  ${eventsSvg(events)}


  <!-- ================================================= -->
  <!-- LOWER SECTION -->
  <!-- ================================================= -->

  <line
    x1="20"
    y1="${lowerTop}"
    x2="460"
    y2="${lowerTop}"
    class="strongLine"
  />

  <line
    x1="238"
    y1="${lowerTop}"
    x2="238"
    y2="696"
    class="thin"
  />

  <line
    x1="20"
    y1="696"
    x2="460"
    y2="696"
    class="strongLine"
  />


  <text
    x="27"
    y="${lowerTop + 24}"
    class="lowerTitle">
    오늘 할 일
  </text>

  <text
    x="190"
    y="${lowerTop + 24}"
    class="infoSmall">
    ${done}/${TODOS.length}
  </text>


  ${todoSvg(lowerTop)}


  <text
    x="252"
    y="${lowerTop + 24}"
    class="lowerTitle">
    주요 일정
  </text>


  ${importantSvg(lowerTop)}


  <!-- ================================================= -->
  <!-- MARKET -->
  <!-- ================================================= -->

  <text
    x="23"
    y="721"
    class="marketLabel">
    KOSPI
  </text>

  <text
    x="23"
    y="751"
    class="marketBig">
${formatNumber(
  market.kospi.value
)}
  </text>

  <text
    x="23"
    y="774"
    class="marketChange"
    style="fill:${market.kospi.change >= 0 ? "#c00000" : "#000000"}">
${
  market.kospi.change >= 0
    ? "▲"
    : "▼"
}
${formatNumber(
  Math.abs(
    market.kospi.change
  )
)}
(${formatSigned(
  market.kospi.rate
)}%)
  </text>


  ${sparklineSvg(market)}


  <text
    x="310"
    y="732"
    class="exchange">
    USD/KRW
  </text>

<text
  x="446"
  y="732"
  text-anchor="end"
  class="exchange">
  ${formatNumber(
    market.usdkrw
  )}
</text>

<text
  x="310"
  y="757"
  class="exchange">
  JPY 100/KRW
</text>

<text
  x="446"
  y="757"
  text-anchor="end"
  class="exchange">
  ${formatNumber(
    market.jpykrw100
  )}
</text>

</svg>
  `;
}


// ======================================================
// 3색 E-ink 변환
// ======================================================

const EINK_BLACK_THRESHOLD = 200;
const EINK_RED_MIN = 120;
const EINK_RED_DELTA = 40;

// 0 = 흰색
// 1 = 검정
// 2 = 빨강
function getEPaperColor(r, g, b) {

  const redPixel =
    r > EINK_RED_MIN &&
    r > g + EINK_RED_DELTA &&
    r > b + EINK_RED_DELTA;

  if (redPixel) {
    return 2;
  }

  const luminance =
    0.299 * r +
    0.587 * g +
    0.114 * b;

  if (luminance < EINK_BLACK_THRESHOLD) {
    return 1;
  }

  return 0;
}


function makeEPaperData(raw) {

  const black =
    Buffer.alloc(
      PANEL_W * PANEL_H / 8,
      0xFF
    );

  const red =
    Buffer.alloc(
      PANEL_W * PANEL_H / 8,
      0xFF
    );

  for (let y = 0; y < PANEL_H; y++) {

    for (let x = 0; x < PANEL_W; x++) {

      const p =
        (y * PANEL_W + x) * 3;

      const color =
        getEPaperColor(
          raw[p],
          raw[p + 1],
          raw[p + 2]
        );

      const byteIndex =
        y * (PANEL_W / 8) +
        Math.floor(x / 8);

      const mask =
        0x80 >> (x % 8);

      if (color === 2) {

        red[byteIndex] &=
          ~mask;

      } else if (color === 1) {

        black[byteIndex] &=
          ~mask;
      }
    }
  }

  return {
    black,
    red
  };
}


// ======================================================
// 브라우저용 실제 E-ink 미리보기
// ======================================================

async function makeEPaperPreview(portrait) {

  const {
    data,
    info
  } =
    await sharp(portrait)
      .removeAlpha()
      .raw()
      .toBuffer({
        resolveWithObject: true
      });

  const output =
    Buffer.alloc(
      info.width *
      info.height *
      3,
      255
    );

  for (
    let i = 0;
    i < data.length;
    i += 3
  ) {

    const color =
      getEPaperColor(
        data[i],
        data[i + 1],
        data[i + 2]
      );

    // 검정
    if (color === 1) {

      output[i] = 0;
      output[i + 1] = 0;
      output[i + 2] = 0;

    }

    // 빨강
    else if (color === 2) {

      output[i] = 192;
      output[i + 1] = 0;
      output[i + 2] = 0;

    }

    // 흰색
    else {

      output[i] = 255;
      output[i + 1] = 255;
      output[i + 2] = 255;

    }
  }

  return sharp(
    output,
    {
      raw: {
        width: info.width,
        height: info.height,
        channels: 3
      }
    }
  )
    .png()
    .toBuffer();
}
// ======================================================
// API
// ======================================================

export default async function handler(
  req,
  res
) {

  try {

    const response =
      await fetch(
        CALENDAR_URL,
        {
          cache: "no-store"
        }
      );


    if (!response.ok) {

      throw new Error(
        "Calendar fetch failed"
      );
    }


const calendar =
  await response.json();

let weather;

try {
  weather = await getWeather();
}
catch (error) {

  console.error(
    "Weather error:",
    error
  );

  // 날씨 API 실패해도
  // 대시보드 전체가 죽지 않게 fallback
  weather = {
    condition: "정보 없음",
    temp: "--",
    low: "--",
    high: "--",
    rain: "--",
    dust: "정보 없음",
    location: WEATHER_LOCATION
  };
}
let market;
try {
  market =
    await getMarketData();
  console.log(
    "Market OK:",
    market
  );
} catch (error) {
  console.error(
    "Market failed:",
    error
  );
  market =
    FALLBACK_MARKET;
}
const svg =
  makeDashboardSvg(
    calendar,
    weather,
    market
  );


    const renderer =
      new Resvg(
        svg,
        {
          background:
            "#ffffff",

          font: {

  fontFiles: [
    FONT_REGULAR,
    FONT_SEMIBOLD,
    FONT_BOLD,
    FONT_EXTRABOLD
  ],

  loadSystemFonts:
    false,

  defaultFontFamily:
    "Pretendard",

  sansSerifFamily:
    "Pretendard"
}
        }
      );


    const portrait =
      Buffer.from(
        renderer
          .render()
          .asPng()
      );


    // ================================================
    // 브라우저 미리보기
    // ================================================

    if (!req.query.layer) {

  let previewImage =
    portrait;

  if (
    req.query.preview === "epaper"
  ) {

    previewImage =
      await makeEPaperPreview(
        portrait
      );
  }

  res.setHeader(
    "Content-Type",
    "image/png"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  return res
    .status(200)
    .send(previewImage);
}

    // ================================================
    // 실제 패널
    // ================================================

    const {
      data: raw,
      info
    } =
      await sharp(portrait)
        .rotate(90)
        .removeAlpha()
        .raw()
        .toBuffer({
          resolveWithObject: true
        });


    if (
      info.width !== PANEL_W ||
      info.height !== PANEL_H
    ) {

      throw new Error(
        `Wrong size: ${info.width}x${info.height}`
      );
    }


    const frame =
      makeEPaperData(raw);


    const output =
      req.query.layer === "red"
        ? frame.red
        : frame.black;


    res.setHeader(
      "Content-Type",
      "application/octet-stream"
    );

    res.setHeader(
      "Content-Length",
      output.length
    );


    return res
      .status(200)
      .send(output);

  }

  catch (error) {

    console.error(error);


    return res
      .status(500)
      .json({
        error: String(error)
      });
  }
}