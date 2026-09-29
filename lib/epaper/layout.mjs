import { getDateInfo, daysUntil, makeDday, formatMonthDay, formatNumber, formatSigned } from './model.mjs';

// Portrait layout: 480 × 800. Only fixed accents use red, so normal data
// changes remain compatible with the firmware's black/white partial refresh.
const INK = '#000000';
const RED = '#c00000';
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const text = (x, y, value, size = 14, weight = 600, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" ${extra}>${esc(value)}</text>`;
const line = (x1, y1, x2, y2, width = 1) =>
  `<path d="M${x1} ${y1 + (width === 1 ? 0.5 : 0)}H${x2}" stroke="${INK}" stroke-width="${width}"/>`;

function monthCalendar(info) {
  const first = new Date(Date.UTC(info.year, info.month - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(info.year, info.month, 0)).getUTCDate();
  const x = 294, stepX = 25.5, stepY = 18;
  let svg = text(456, 31, `${info.year}.${String(info.month).padStart(2, '0')}`, 13, 700, 'text-anchor="end"');
  ['일', '월', '화', '수', '목', '금', '토'].forEach((day, i) => {
    svg += text(x + i * stepX, 61, day, 12, 700, `text-anchor="middle" fill="${i === 0 ? RED : INK}"`);
  });
  for (let day = 1; day <= count; day++) {
    const slot = first + day - 1;
    const px = x + (slot % 7) * stepX, py = 83 + Math.floor(slot / 7) * stepY;
    const today = day === info.day;
    const sunday = slot % 7 === 0;
    if (today) svg += `<circle cx="${px}" cy="${py - 4}" r="9" fill="${sunday ? 'none' : INK}" stroke="${INK}"/>`;
    // Sunday glyphs stay red even today; an outline avoids changing the red plane.
    svg += text(px, py, day, 12, sunday ? 600 : today ? 700 : 600, `text-anchor="middle" fill="${sunday ? RED : today ? '#fff' : INK}"`);
  }
  return svg;
}

function weatherIcon(code) {
  const sun = '<circle cx="28" cy="25" r="10"/><path d="M28 9V4M28 46V41M12 25H7M49 25H44M17 14L13 10M43 40L39 36M17 36L13 40M43 10L39 14"/>';
  const cloud = '<path d="M10 37C10 28 20 24 27 28C32 15 49 18 51 29C63 28 65 45 54 46H19C13 46 10 43 10 37Z" fill="#fff"/>';
  let shape;
  if (code == null) shape = '<path d="M19 20C19 8 41 8 41 20C41 28 29 28 29 36M29 43V46"/>';
  else if (code === 0) shape = sun;
  else if ([1, 2].includes(code)) shape = sun + cloud;
  else if ([45, 48].includes(code)) shape = cloud + '<path d="M13 53H54M19 59H49"/>';
  else if ([71, 73, 75, 77, 85, 86].includes(code)) shape = cloud + '<path d="M20 52V60M16 56H24M43 52V60M39 56H47"/>';
  else if (code >= 95) shape = cloud + '<path d="M34 49L28 57H37L32 65"/>';
  else if (code >= 51) shape = cloud + '<path d="M21 52L17 60M36 52L32 60M51 52L47 60"/>';
  else shape = cloud;
  return `<g transform="translate(22 200)" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shape}</g>`;
}

const minutes = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;

export function scheduleStates(events, generated) {
  const now = minutes(generated);
  const future = events.map(e => e.allDay ? null : minutes(e.start))
    .filter(t => t !== null && now !== null && t > now);
  const next = future.length ? Math.min(...future) : null;
  return events.map(e => {
    if (e.allDay || now === null) return '';
    const start = minutes(e.start), end = minutes(e.end);
    if (start !== null && end !== null && end > start && start <= now && now < end) return '진행 중';
    return start !== null && start === next ? '다음' : '';
  });
}

function eventRows(events, available, fit, generated) {
  if (!available || !events.length) {
    return text(24, 395, available ? '등록된 일정이 없습니다' : '일정 정보를 확인할 수 없습니다', 18, 700)
      + text(24, 422, available ? '새 일정은 다음 갱신에 반영됩니다' : '다음 갱신에서 다시 확인합니다', 13, 600);
  }
  const states = scheduleStates(events, generated);
  return events.slice(0, 5).map((event, i) => {
    const top = 326 + i * 42;
    const state = states[i], active = state === '진행 중', color = active ? '#fff' : INK;
    const paint = `fill="${color}"`;
    let time;
    if (event.allDay) {
      time = text(32, top + 26, '종일', 13, 700, paint);
    } else {
      time = text(32, top + (event.end ? 17 : 26), event.start, 14, 700, paint)
        + (event.end ? text(32, top + 33, event.end, 12, 600, paint) : '');
    }
    const badge = state ? `<rect x="395" y="${top + 9}" width="53" height="24" rx="2" fill="${color}"/>`
      + `<rect x="397" y="${top + 11}" width="49" height="20" fill="${active ? INK : '#fff'}"/>`
      + text(421.5, top + 26, state, 12, 800, `${paint} text-anchor="middle"`) : '';
    return `<g data-event-row="${i}" data-state="${state}">`
      + (active ? `<rect x="24" y="${top}" width="432" height="42" fill="${INK}"/>` : '')
      + time + `<rect x="95" y="${top + 8}" width="2" height="26" fill="${color}"/>`
      + text(112, top + 27, fit(event.title, state ? 273 : 336, 16, active ? 800 : 700), 16, active ? 800 : 700, paint)
      + badge + (i < Math.min(events.length, 5) - 1 ? line(24, top + 42, 456, top + 42) : '') + '</g>';
  }).join('');
}

function wrapTwo(value, max, size, weight, fit) {
  const source = String(value ?? '');
  const first = fit(source, max, size, weight);
  if (first === source) return [source];
  const prefix = first.endsWith('…') ? first.slice(0, -1) : first;
  return [prefix, fit(source.slice(prefix.length).trimStart(), max, size, weight)];
}

function memoRows(todos, fit, available, localContent=false) {
  if (!available && !localContent) return text(24, 605, '메모 확인 필요', 13, 600);
  if (!todos.length) return text(24, 605, '등록된 메모 없음', 13, 600);
  return todos.slice(0, 2).map((item, i) => {
    const y = 600 + i * 39;
    const sourceLines = localContent ? item.title.split('\n').slice(0,2) : wrapTwo(item.title,178,14,600,fit);
    const lines = sourceLines.map(s=>{
      let size=14;
      if(localContent)while(size>11&&fit(s,208,size,600)!==s)size--;
      return {value:localContent?fit(s,208,size,600):s,size};
    });
    return (localContent?'':`<rect x="24" y="${y - 11}" width="10" height="10" rx="1" fill="none" stroke="${INK}"/>`)
      + lines.map((s,j)=>text(localContent?24:43,y+j*17,s.value,s.size,600)).join('');
  }).join('');
}

function importantRows(calendar, fit) {
  if (calendar.available === false && !calendar.localContent) return text(254, 605, '주요 일정 확인 필요', 13, 600);
  const baseDate=calendar.localDate||calendar.date;
  const eligible=(calendar.important||[]).filter(item=>daysUntil(baseDate,item.date)>=0);
  const rows=(calendar.localContent?eligible:eligible.sort((a,b)=>daysUntil(baseDate,a.date)-daysUntil(baseDate,b.date))).slice(0,3);
  if (!rows.length) return text(254, 605, '예정된 주요 일정 없음', 13, 600);
  return rows.map((item, i) => {
    const y = 604 + i * 25;
    return text(254, y, fit(`${makeDday(baseDate, item.date)} ${item.title}`, 156, 14, 600), 14, 600)
      + text(456, y, formatMonthDay(item.date), 12, 600, 'text-anchor="end"');
  }).join('');
}

function sparkline(market) {
  const points = market.kospi.points;
  if (!points || points.length < 2 || points.some(v => !Number.isFinite(v))) return '';
  const min = Math.min(...points), range = Math.max(0.01, Math.max(...points) - min);
  const coords = points.map((v, i) => [174 + i / (points.length - 1) * 88, 744 - (v - min) / range * 31]);
  const last = coords.at(-1);
  return `<path d="M${coords.map(p => p.map(v => v.toFixed(1)).join(' ')).join('L')}" stroke="${INK}" stroke-width="2" fill="none" stroke-linejoin="round"/>`
    + `<circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="${INK}"/>`;
}

export function makeDashboardSvg(calendar, weather, market, battery, status, fit) {
  const info = getDateInfo(calendar.date), events = calendar.events || [], todos = calendar.todos || [];
  const available = calendar.available !== false;
  const dday = calendar.dday ? makeDday(calendar.localDate||calendar.date, calendar.dday.date) : '—';
  const ddayTitle = calendar.dday?.title || '등록된 목표 없음';
  const count = available ? `${events.length}건${events.length > 5 ? ' · 5건 표시' : ''} · ${status.generated} 기준` : '확인 필요';
  const change = market.kospi.change;
  const move = Number.isFinite(change) ? formatNumber(Math.abs(change)) : '--';
  const rate = Number.isFinite(market.kospi.rate) ? `${formatSigned(market.kospi.rate)}%` : '--';
  const fill = Math.max(0, Math.min(23, Number(battery.fill) || 0));
  const degree = value => Number.isFinite(value) ? `${value}°` : '--';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="800" viewBox="0 0 480 800">
  <rect width="480" height="800" fill="#fff"/>
  <g font-family="Pretendard" fill="${INK}">
    <path d="M24 27H42" stroke="${RED}" stroke-width="3"/>
    ${text(52, 31, 'DAILY BRIEF', 12, 700, 'letter-spacing="1.2"')}
    ${text(21, 124, String(info.day).padStart(2, '0'), 88, 800)}
    ${text(143, 88, `${info.month}월`, 24, 700)}
    ${text(145, 118, info.weekday, 17, 600)}
    ${text(24, 168, 'D-DAY', 19, 800, `fill="${RED}"`)}
    ${text(103, 168, fit(dday, 72, 23, 800), 23, 800)}
    ${text(184, 168, fit(ddayTitle, 94, 22, 700), 22, 700)}
    ${monthCalendar(info)}
    ${line(24, 188, 456, 188, 2)}

    ${weatherIcon(weather.code)}
    ${text(96, 241, fit(degree(weather.temp), 140, 40, 800), 40, 800)}
    ${text(24, 274, fit(`${weather.location} · ${weather.condition}`, 212, 14, 600), 14, 600)}
    ${text(270, 213, fit(`최저 ${degree(weather.low)}   최고 ${degree(weather.high)}`, 186, 13, 600), 13, 600)}
    ${text(270, 241, Number.isFinite(weather.rain) ? `강수 ${weather.rain}%` : '강수 정보 없음', 14, 700)}
    ${text(270, 269, fit(`초미세먼지 ${weather.dust}`, 186, 13, 600), 13, 600)}
    ${line(24, 289, 456, 289)}

    <rect x="24" y="296" width="5" height="20" fill="${RED}"/>
    ${text(35, 315, '오늘의 일정', 21, 800)}
    ${text(456, 313, count, 11, 600, 'text-anchor="end"')}
    ${eventRows(events, available, fit, status.generated)}
    ${line(24, 550, 456, 550, 2)}

    <rect x="24" y="561" width="5" height="18" fill="${RED}"/>
    <rect x="254" y="561" width="5" height="18" fill="${RED}"/>
    ${text(35, 576, '메모', 16, 800)}
    ${text(265, 576, '주요 일정', 16, 800)}
    <path d="M240 562V660" stroke="${INK}"/>
    ${memoRows(todos, fit, available, calendar.localContent)}
    ${importantRows(calendar, fit)}
    ${line(24, 675, 456, 675)}

    <path d="M24 691H37" stroke="${RED}" stroke-width="3"/>
    ${text(43, 696, 'KOSPI', 12, 800, 'letter-spacing="0.5"')}
    ${text(99, 696, fit(status.market, 165, 11, 600), 11, 600)}
    ${text(24, 726, fit(formatNumber(market.kospi.value), 148, 26, 800), 26, 800)}
    ${Number.isFinite(change) ? change > 0
  ? `<path d="M24 748L29 739L34 748Z" fill="${RED}"/>`
  : change < 0
    ? `<path d="M24 739L34 739L29 748Z" fill="${INK}"/>`
    : `<path d="M24 744H34" stroke="${INK}" stroke-width="2"/>`
  : ''}
${text(40, 749, fit(`${move}  ${rate}`, 129, 12, 700), 12, 700)}
    ${sparkline(market)}
    ${text(286, 715, 'USD / KRW', 11, 700)}
    ${text(456, 715, formatNumber(market.usdkrw), 15, 700, 'text-anchor="end"')}
    ${text(286, 744, 'JPY 100 / KRW', 11, 700)}
    ${text(456, 744, formatNumber(market.jpykrw100), 15, 700, 'text-anchor="end"')}
    ${line(24, 763, 456, 763)}

    ${text(24, 786, `생성 ${status.generated}`, 11, 600)}
    ${text(118, 786, fit(status.summary, 126, 11, 600), 11, 600)}
    ${text(256, 786, `약 ${status.intervalMinutes}분 뒤 갱신`, 11, 600)}
    <rect x="377" y="775" width="30" height="13" rx="2" fill="none" stroke="${INK}" stroke-width="1.5"/>
    <rect x="407" y="779" width="3" height="5"/>
    <rect x="380" y="778" width="${fill}" height="7"/>
    ${text(456, 786, fit(battery.label, 41, 12, 700), 12, 700, 'text-anchor="end"')}
  </g></svg>`;
}
