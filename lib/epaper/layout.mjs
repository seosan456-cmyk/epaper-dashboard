import { getDateInfo, daysUntil, makeDday, formatMonthDay, formatNumber, formatSigned } from "./model.mjs";
function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}


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
  const startY = 58;

  const cellW = 20;
  const cellH = 18;


  let svg = `
    <text
      x="380"
      y="35"
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
        startY + 20 + row * cellH;

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
    values.length < 2 || values.some(v => !Number.isFinite(v))
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
    Number.isFinite(market.kospi.change) && market.kospi.change >= 0
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

function eventsSvg(events, fit) {

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
    .slice(0, 5)
    .map(
(event, index) => {

  const rowTop =
    351 + index * 40;

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
      y1="${rowTop + 40}"
      x2="456"
      y2="${rowTop + 40}"
      class="softLine"
    />

    <rect
      x="29"
      y="${rowTop + 11}"
      width="14"
      height="14"
      rx="2"
      fill="none"
      stroke="#000"
      stroke-width="1.4"
    />

    <text
      x="57"
      y="${event.allDay ? rowTop + 24 : rowTop + 15}"
      class="eventTime">
      ${esc(time)}
    </text>

    ${
      end
        ? `
          <text
            x="57"
            y="${rowTop + 29}"
            class="eventEnd">
            -${esc(end)}
          </text>
        `
        : ""
    }

    <text
      x="126"
      y="${rowTop + 24}"
      class="eventTitle">
      ${esc(
        fit(event.title, 320, 16, 600)
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

function memoSvg(todos, lowerTop, fit) {

  return todos
    .slice(0, 2)
    .map(
      (item, index) => {

        const y =
          lowerTop + 52 + index * 28;

        return `
          <circle
            cx="31"
            cy="${y - 4}"
            r="2.5"
            fill="#c00000"
          />

          <text
            x="42"
            y="${y}"
            class="memo">
            ${esc(fit(item.title, 182, 13, 600))}
          </text>
        `;
      }
    )
    .join("");
}


// ======================================================
// 주요 일정
// ======================================================

function importantSvg(important, lowerTop, fit) {

  return important
    .map(
      (item, index) => {

        const y =
          lowerTop + 50 + index * 24;

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
            y="${y - 2}"
            class="importantTitle">
            ${esc(fit(item.title, 94, 11, 700))}
          </text>

          <text
            x="440"
            y="${y - 2}"
            class="importantDate"
            text-anchor="end">
            ${esc(item.date)}
          </text>
        `;
      }
    )
    .join("");
}


function weatherIcon(code) {
  if (code == null) return '<text x="48" y="52" font-size="26">?</text>';
  const sun = '<circle cx="52" cy="42" r="11" fill="none" stroke="#000" stroke-width="2"/><path d="M52 25V21 M52 59V63 M35 42H31 M69 42H73 M40 30L37 27 M64 54L67 57 M40 54L37 57 M64 30L67 27" stroke="#000" stroke-width="2"/>';
  const cloud = '<path d="M29 49 C29 39 39 36 47 41 C50 29 66 29 70 40 C81 37 88 44 86 51 H31 Z" fill="white" stroke="#000" stroke-width="2"/>';
  if (code === 0) return sun;
  if ([1,2].includes(code)) return sun+cloud;
  if ([45,48].includes(code)) return cloud+'<path d="M32 57H82 M36 62H78" stroke="#000" stroke-width="2"/>';
  if ([71,73,75,77,85,86].includes(code)) return cloud+'<text x="38" y="65" font-size="17">* * *</text>';
  if (code >= 95) return cloud+'<path d="M55 51L48 59H57L51 66" fill="none" stroke="#000" stroke-width="2"/>';
  if (code >= 51) return cloud+'<path d="M40 56L36 63 M57 56L53 63 M74 56L70 63" stroke="#000" stroke-width="2"/>';
  return cloud;
}
export function makeDashboardSvg(calendar, weather, market, battery, status, fit) {
  const info =
    getDateInfo(calendar.date);

const events =
  calendar.events || [];

const todos =
  calendar.todos || [];



const dday =
  calendar.dday
    ? {
        title: calendar.dday.title,
        value: makeDday(
          calendar.date,
          calendar.dday.date
        )
      }
    : {
        title: "",
        value: "-"
      };
const important =
  (calendar.important || [])
    .filter(item =>
      daysUntil(
        calendar.date,
        item.date
      ) >= 0
    )
    .sort(
      (a, b) =>
        daysUntil(calendar.date, a.date) -
        daysUntil(calendar.date, b.date)
    )
    .slice(0, 2)
    .map(item => {

      const days =
        daysUntil(
          calendar.date,
          item.date
        );

      return {
        title: item.title,
        tag:
          makeDday(
            calendar.date,
            item.date
          ),
        date:
          formatMonthDay(
            item.date
          ),
        red:
          days <= 30
      };
    });



  // ==================================================
  // 하단 영역은 최대 5개 일정 아래에 고정
  // ==================================================

const lowerTop = 570;

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
      stroke-width: 1;
    }

    .softLine {
      stroke: #000;
      stroke-width: 1;
    }

    .strongLine {
      stroke: #000;
      stroke-width: 2;
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
.systemSmall {
  font-size: 11px;
  fill: #000;
  font-weight: 600;
}

.systemSync {
  font-size: 11px;
  fill: #000;
  font-weight: 600;
}
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

    .memo {
     font-size: 13px;
     fill: #000;
     font-weight: 600;
    }

    .tag {
      font-size: 9px;
      fill: #fff;
      font-weight: 700;
    }

    .importantTitle {
      font-size: 11px;
      fill: #000;
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
    y1="20"
    x2="157"
    y2="210"
    class="thin"
  />

  <line
    x1="305"
    y1="25"
    x2="305"
    y2="210"
    class="thin"
  />


  <!-- 날씨 -->

  ${weatherIcon(weather.code)}

  <text
    x="91"
    y="48"
    class="weatherName">
    ${esc(fit(weather.condition, 63, 16, 700))}
  </text>

  <text
    x="25"
    y="105"
    class="temperature">
    ${weather.temp}°
  </text>

  <text
    x="27"
    y="130"
    class="weatherSub">
    ${esc(fit(`최저 ${weather.low}° · 최고 ${weather.high}°`, 126, 13, 600))}
  </text>

<text
  x="27"
  y="160"
  class="weatherSub">
  ${esc(fit(`${weather.location} · 강수 ${weather.rain}%`, 126, 13, 600))}
</text>

<text
  x="27"
  y="185"
  class="weatherSub">
  ${esc(fit(`초미세먼지 ${weather.dust}`, 126, 13, 600))}
</text>


  <!-- 날짜 -->

  <text
    x="231"
    y="45"
    class="year"
    text-anchor="middle">
    ${info.year}
  </text>

  <text
    x="231"
    y="122"
    class="bigDay"
    text-anchor="middle">
    ${info.day}
  </text>

  <text
    x="231"
    y="160"
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
    y1="225"
    x2="460"
    y2="225"
    class="strongLine"
  />

  <line
    x1="20"
    y1="305"
    x2="460"
    y2="305"
    class="strongLine"
  />

  <line
  x1="162"
  y1="225"
  x2="162"
  y2="305"
  class="thin"
/>

<line
  x1="328"
  y1="225"
  x2="328"
  y2="305"
  class="thin"
/>


  <text
    x="29"
    y="249"
    class="infoLabel">
    오늘 일정
  </text>

  <text
    x="29"
    y="283"
    class="infoBig">
    ${calendar.available ? events.length + '건' : '--'}
  </text>


  <text
    x="181"
    y="249"
    class="infoLabel">
    D-day
  </text>

  <text
    x="181"
    y="278"
    class="infoBig red">
    ${esc(dday.value)}
  </text>

  <text
    x="181"
    y="298"
    class="infoSmall">
    ${esc(fit(dday.title, 140, 11, 600))}
  </text>


  <!-- 배터리 -->

  <!-- 배터리 / 시스템 상태 -->

<rect
  x="344"
  y="231"
  width="31"
  height="17"
  rx="3"
  fill="none"
  stroke="#000"
  stroke-width="2"
/>

<rect
  x="375"
  y="236"
  width="4"
  height="7"
  fill="#000"
/>

<rect
  x="348"
  y="235"
  width="${battery.fill}"
  height="9"
  fill="#000"
/>

<text
  x="387"
  y="246"
  class="infoBig">
  ${esc(battery.label)}
</text>


<!-- Wi-Fi 아이콘 -->
<path
  d="
    M339 258
    Q347 250 355 258
    M342 262
    Q347 257 352 262
  "
  fill="none"
  stroke="#000"
  stroke-width="1.6"
  stroke-linecap="round"
/>

<circle
  cx="347"
  cy="265"
  r="1.6"
  fill="#000"
/>

<text
  x="361"
  y="262"
  class="systemSmall">
  생성 ${esc(status.generated)}
</text>


<!-- SYNC -->
<circle
  cx="347"
  cy="276"
  r="3.2"
  fill="#c00000"
/>

<text
  x="355"
  y="279"
  class="systemSync">
  ${esc(fit(status.summary, 100, 11, 600))}
</text>


<!-- 다음 갱신 -->
<text
  x="344"
  y="297"
  class="systemSmall">
  약 ${status.intervalMinutes}분 뒤 갱신
</text>


  <!-- ================================================= -->
  <!-- EVENTS -->
  <!-- ================================================= -->

  <text
    x="23"
    y="337"
    class="sectionTitle">
    오늘의 일정
  </text>

  <text
    x="452"
    y="337"
    text-anchor="end"
    class="eventCount">
    ${calendar.available ? events.length + '건' + (events.length > 5 ? ' · 5건 표시' : '') : '확인 필요'}
  </text>

  <line
    x1="22"
    y1="351"
    x2="458"
    y2="351"
    class="softLine"
  />


  ${calendar.available ? eventsSvg(events, fit) : '<text x="34" y="430" class="empty">일정 정보를 확인할 수 없습니다</text>'}


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
    y2="706"
    class="thin"
  />

  <line
    x1="20"
    y1="706"
    x2="460"
    y2="706"
    class="strongLine"
  />


<text
  x="27"
  y="${lowerTop + 24}"
  class="lowerTitle">
  메모
</text>

${memoSvg(todos, lowerTop, fit)}


  <text
    x="252"
    y="${lowerTop + 24}"
    class="lowerTitle">
    주요 일정
  </text>


  ${importantSvg(important, lowerTop, fit)}


  <!-- ================================================= -->
  <!-- MARKET -->
  <!-- ================================================= -->

  <text
    x="23"
    y="721"
    class="marketLabel">
    KOSPI ${esc(status.market)}
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
    style="fill:${Number.isFinite(market.kospi.change) && market.kospi.change >= 0 ? "#c00000" : "#000000"}">
${
  Number.isFinite(market.kospi.change) && market.kospi.change >= 0
    ? (market.kospi.change === 0 ? "―" : "▲")
    : (Number.isFinite(market.kospi.change) ? "▼" : "")
}
${formatNumber(
  Number.isFinite(market.kospi.change) ? Math.abs(market.kospi.change) : null
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
