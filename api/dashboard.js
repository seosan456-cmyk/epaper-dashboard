const CALENDAR_URL =
  "https://script.google.com/macros/s/AKfycbwUO_LkuybqEmAISdZg5MuzyfBw14Yege2GOyaS1nkl5L7lXrL__GFxWE3jSx-vx56c/exec";

function escapeXml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatKoreanDate(dateText) {
  const date = new Date(dateText + "T12:00:00+09:00");

  const weekdays = [
    "일요일",
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일"
  ];

  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdays[date.getDay()]}`;
}

export default async function handler(req, res) {
  try {
    const response = await fetch(CALENDAR_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Calendar fetch failed");
    }

    const data = await response.json();

    const events = data.events || [];

    let eventRows = "";

    if (events.length === 0) {
      eventRows = `
        <text x="60" y="190"
              font-size="25"
              fill="#111">
          오늘 일정이 없습니다
        </text>
      `;
    } else {
      eventRows = events
        .slice(0, 6)
        .map((event, index) => {
          const y = 175 + index * 48;

          const time = event.allDay
            ? "종일"
            : event.start;

          return `
            <text x="60"
                  y="${y}"
                  font-size="21"
                  fill="#c1121f"
                  font-weight="700">
              ${escapeXml(time)}
            </text>

            <text x="145"
                  y="${y}"
                  font-size="25"
                  fill="#111">
              ${escapeXml(event.title)}
            </text>
          `;
        })
        .join("");
    }

    const dateLabel =
      formatKoreanDate(data.date);

    const svg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="800"
  height="480"
  viewBox="0 0 800 480">

  <rect
    width="800"
    height="480"
    fill="#ffffff"
  />

  <!-- Header -->

  <text
    x="45"
    y="65"
    font-family="Pretendard, Noto Sans KR, sans-serif"
    font-size="34"
    font-weight="700"
    fill="#111111">
    ${escapeXml(dateLabel)}
  </text>

  <text
    x="755"
    y="60"
    text-anchor="end"
    font-family="sans-serif"
    font-size="16"
    fill="#555555">
    E-PAPER
  </text>

  <line
    x1="45"
    y1="90"
    x2="755"
    y2="90"
    stroke="#111111"
    stroke-width="2"
  />

  <!-- Section title -->

  <rect
    x="45"
    y="120"
    width="7"
    height="29"
    fill="#c1121f"
  />

  <text
    x="65"
    y="145"
    font-family="Pretendard, Noto Sans KR, sans-serif"
    font-size="27"
    font-weight="700"
    fill="#111111">
    오늘 일정
  </text>

  ${eventRows}

  <!-- Footer -->

  <line
    x1="45"
    y1="420"
    x2="755"
    y2="420"
    stroke="#111111"
    stroke-width="1"
  />

  <text
    x="45"
    y="452"
    font-family="Pretendard, Noto Sans KR, sans-serif"
    font-size="14"
    fill="#555555">
    마지막 동기화 ${escapeXml(data.updatedAt)}
  </text>

</svg>
`;

    res.setHeader(
      "Content-Type",
      "image/svg+xml; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.status(200).send(svg);

  } catch (error) {

    res.status(500).send(`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="800"
        height="480">

        <rect
          width="800"
          height="480"
          fill="white"
        />

        <text
          x="50"
          y="100"
          font-size="28"
          fill="black">
          Dashboard Error
        </text>

      </svg>
    `);
  }
}