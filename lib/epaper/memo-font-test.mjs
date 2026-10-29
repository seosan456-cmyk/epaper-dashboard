// Opt-in physical-panel font tests via the existing memo mode and BLE field.
// No firmware/protocol changes; ordinary memo and clock behavior stays intact.
const SIZES = [18, 20, 22, 24];
const SAMPLE = '창문을 열자 서늘한 바람이 들어왔다. 나는 읽던 책을 잠시 덮고, 골목 끝에서 천천히 걸어오는 사람을 바라보았다.';
const PASSAGE = [
  SAMPLE,
  '그는 한 손에 작은 종이봉투를 들고 있었다. 평소와 다를 것 없는 오후였지만, 봉투 속에 무엇이 들었는지 생각하는 동안 거리는 조금 낯설어졌다.',
  '책상 위에는 어제 적어 둔 문장이 남아 있었다. “아직 이름 붙이지 못한 일에도, 그 나름의 시간이 흐른다.” 나는 그 문장을 소리 없이 읽었다.',
  '멀리서 아이들이 웃는 소리가 들렸다. 바람은 커튼을 한 번 밀어 올리고 지나갔다. 나는 물 한 잔을 마신 뒤, 책갈피를 끼워 둔 페이지를 다시 펼쳤다.',
  '이야기 속의 여행자는 갈림길 앞에 서 있었다. 어느 쪽으로 가더라도 하루가 저물 무렵에는 작은 마을에 닿을 수 있다고 했다. 그는 서둘러 길을 고르지 않았다.',
  '잠시 멈춰 서서 자신이 지나온 길을 돌아보았다. 발자국은 멀리까지 이어져 있었고, 그 위로 바람이 가볍게 모래를 덮고 있었다.',
  '나는 다음 문장을 읽기 전에 다시 창밖을 보았다. 종이봉투를 든 사람은 이미 골목을 지나갔다. 어디선가 문이 닫히는 소리가 났고, 거리는 다시 조용해졌다.',
].join('\n\n');
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const text = (x, y, s, size, weight = 400) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}">${esc(s)}</text>`;

export function parseMemoFontTest(memo) {
  const match = /^글자\s*테스트(?:\s+(18|20|22|24))?$/u.exec(String(memo).trim());
  return match ? { size: match[1] ? Number(match[1]) : null } : null;
}

function wrap(value, size, fit) {
  const result = [];
  for (let paragraph of value.split('\n')) {
    if (!paragraph) { result.push(''); continue; }
    while (paragraph) {
      const fitted = fit(paragraph, 432, size, 400);
      if (fitted === paragraph) { result.push(paragraph); break; }
      const prefix = fitted.endsWith('…') ? fitted.slice(0, -1) : fitted;
      // Defensive guard: do not loop if a future font cannot fit one character.
      if (!prefix || !paragraph.startsWith(prefix)) { result.push('…'); break; }
      result.push(prefix.trimEnd());
      paragraph = paragraph.slice(prefix.length).trimStart();
    }
  }
  return result;
}

export function makeMemoFontTestSvg(test, fit) {
  const single = SIZES.includes(test.size);
  let content = text(24, 39, single ? `읽기 테스트 · ${test.size}px` : '읽기 테스트 · 글자 크기 비교', 22, 600)
    + text(24, 65, 'Pretendard Regular · 굵기 400 · 줄 간격 1.5배', 12);
  if (single) {
    const step = Math.round(test.size * 1.5), baseline = 108, bottom = 742;
    const visible = wrap(PASSAGE, test.size, fit).slice(0, Math.floor((bottom - baseline) / step) + 1);
    content += '<path d="M24 80.5H456" stroke="#000"/>';
    content += visible.map((s, i) => text(24, baseline + i * step, s, test.size)).join('');
  } else {
    SIZES.forEach((size, i) => {
      const top = 86 + i * 167, step = Math.round(size * 1.5);
      content += `<g data-font-size="${size}"><path d="M24 ${top + 0.5}H456" stroke="#000"/>`
        + text(24, top + 24, `${size}px`, 15, 600)
        + wrap(SAMPLE, size, fit).slice(0, 4).map((s, j) => text(24, top + 53 + j * step, s, size)).join('') + '</g>';
    });
  }
  // Static footer keeps this frame identical across scheduled refreshes.
  content += '<path d="M24 763.5H456" stroke="#000"/>'
    + text(24, 786, 'KEY 짧게: 대시보드 · 2초 길게: 설정', 12);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="800" viewBox="0 0 480 800"><rect width="480" height="800" fill="#fff"/><g font-family="Pretendard" fill="#000">${content}</g></svg>`;
}

