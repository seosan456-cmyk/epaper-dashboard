import { Resvg } from "@resvg/resvg-js";
import path from "node:path";

const FONT_FILE = path.join(
  process.cwd(),
  "fonts",
  "NotoSansKR.ttf"
);

export default async function handler(req, res) {

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg"
       width="480"
       height="300">

    <rect width="480" height="300" fill="white"/>

    <text
      x="30"
      y="70"
      font-family="Noto Sans KR"
      font-size="32"
      font-weight="700"
      fill="black">
      한글 렌더링 테스트
    </text>

    <text
      x="30"
      y="125"
      font-family="Noto Sans KR"
      font-size="24"
      fill="black">
      오늘의 일정
    </text>

    <text
      x="30"
      y="170"
      font-family="Noto Sans KR"
      font-size="24"
      fill="black">
      교내봉사 · 수행평가 · 겨울방학
    </text>

    <text
      x="30"
      y="215"
      font-family="Noto Sans KR"
      font-size="24"
      fill="#c00000">
      월요일 D-72 배터리 82%
    </text>

  </svg>
  `;

  const renderer = new Resvg(svg, {
    background: "#ffffff",

    font: {
      fontFiles: [FONT_FILE],

      // Vercel 시스템 폰트에 기대지 않음
      loadSystemFonts: false,

      defaultFontFamily: "Noto Sans KR",
      sansSerifFamily: "Noto Sans KR"
    }
  });

  const png = renderer
    .render()
    .asPng();

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
    .send(Buffer.from(png));
}