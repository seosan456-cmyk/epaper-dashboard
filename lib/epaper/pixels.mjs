const PANEL_W = 800, PANEL_H = 480;
const EINK_BLACK_THRESHOLD = 180;
const EINK_RED_MIN = 120;
const EINK_RED_DELTA = 40;

// 0 = 흰색
// 1 = 검정
// 2 = 빨강
export function getEPaperColor(r, g, b) {

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


export function makeEPaperData(raw) {

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


