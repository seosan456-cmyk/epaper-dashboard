/**
 * E-paper Google relay v1.0
 * 새 Apps Script 프로젝트의 Code.gs에 이 파일 전체를 붙여 넣으세요.
 * 기존 캘린더용 Apps Script와 별도 프로젝트로 배포합니다.
 *
 * GET /exec             : 로그인 없이 Google 응답이 도착하는지 확인
 * GET /exec?probe=large : 128 KiB 테스트 본문 (개인 정보/버셀 호출 없음)
 * POST /exec            : {relayToken, frame:{...기존 /api/frame POST 내용}}
 *
 * Script properties:
 * RELAY_TOKEN        setupRelay()가 생성. 요청 본문에만 사용, URL에 넣지 않음.
 * UPSTREAM_API_TOKEN 기존 Vercel FRAME_API_TOKEN을 사용할 때만 동일한 값 설정.
 */
const RELAY_VERSION = '1.0';
const UPSTREAM_URL = 'https://epaper-dashboard-live.vercel.app/api/frame';
const FRAME_BYTES = 96032;
const PLANE_BYTES = 48000;

function setupRelay() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('RELAY_TOKEN')) {
    properties.setProperty('RELAY_TOKEN',
      (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''));
  }
  const result = {ok: true, version: RELAY_VERSION, message: '초기 설정 완료'};
  console.log(JSON.stringify(result));
  return result; // 토큰은 프로젝트 설정 > 스크립트 속성에서 확인합니다.
}

function doGet(e) {
  if (e && e.parameter && e.parameter.probe === 'large') {
    // 실제 프레임과 다른 접두어: 펌웨어가 테스트 본문을 화면으로 오인하지 않음.
    return text_('EPD-PROBE/1\n131072\n' +
      '0123456789abcdef'.repeat(8192) + '\nEND');
  }
  const properties = PropertiesService.getScriptProperties();
  let lastTest = null;
  try { lastTest = JSON.parse(properties.getProperty('LAST_RELAY_TEST') || 'null'); }
  catch (_) { /* 오래된 진단 기록은 무시 */ }
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    service: 'epaper-google-relay',
    version: RELAY_VERSION,
    message: '구글 접속 성공',
    configured: !!properties.getProperty('RELAY_TOKEN'),
    time: new Date().toISOString(),
    lastTest: lastTest
  }, null, 2)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || !raw ||
        raw.length > 12288 || utf8Length_(raw) > 12288) {
      throw fault_('INVALID_REQUEST');
    }
    let request;
    try { request = JSON.parse(raw); }
    catch (_) { throw fault_('INVALID_JSON'); }
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw fault_('INVALID_REQUEST');
    }
    const expected = PropertiesService.getScriptProperties().getProperty('RELAY_TOKEN');
    if (!expected) throw fault_('RELAY_NOT_CONFIGURED');
    if (!equalToken_(request.relayToken, expected)) throw fault_('UNAUTHORIZED');

    const bytes = fetchFrame_(request.frame);
    const base64 = Utilities.base64Encode(bytes);
    const expectedLength = 4 * Math.ceil(FRAME_BYTES / 3);
    if (base64.length !== expectedLength) throw fault_('ENCODING_FAILED');
    // 고정된 짧은 3줄 뒤에 Base64. 클라이언트에서 본문 전체를 String으로 만들지 않습니다.
    return text_('EPD64/1\n' + FRAME_BYTES + '\n' + base64.length + '\n' + base64);
  } catch (error) {
    return text_('EPDERR/1\n' + JSON.stringify(safeError_(error)));
  }
}

// Apps Script 편집기에서 실행: 외부 데이터에 의존하지 않는 시계 화면 전송 검사.
function testRelay() { return runTest_('clock'); }

// Apps Script 편집기에서 실행: 기존 캘린더/날씨/시장 데이터 포함 검사.
function testDashboardRelay() { return runTest_('dashboard'); }

function runTest_(mode) {
  let result;
  try {
    const bytes = fetchFrame_({mode: mode, format: 'bundle', sleep_s: 300});
    result = {
      ok: true, mode: mode, bytes: bytes.length,
      protocol: 'EPD2', crc: true,
      message: '버셀 화면 수신 및 CRC 검사 성공'
    };
  } catch (error) {
    result = Object.assign({mode: mode}, safeError_(error));
  }
  result.time = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty('LAST_RELAY_TEST', JSON.stringify(result));
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function fetchFrame_(frame) {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
    throw fault_('INVALID_FRAME_REQUEST');
  }
  const q = JSON.parse(JSON.stringify(frame));
  if (q.layer !== undefined || (q.format !== undefined && q.format !== 'bundle')) {
    throw fault_('INVALID_FRAME_REQUEST');
  }
  q.format = 'bundle';
  const payload = JSON.stringify(q);
  if (utf8Length_(payload) > 8192) throw fault_('FRAME_REQUEST_TOO_LARGE');
  const headers = {Accept: 'application/octet-stream'};
  const apiToken = PropertiesService.getScriptProperties().getProperty('UPSTREAM_API_TOKEN');
  if (apiToken) headers.Authorization = 'Bearer ' + apiToken;
  let response;
  try {
    // URL은 고정. 사용자가 임의 URL을 중계 대상으로 지정할 수 없습니다.
    response = UrlFetchApp.fetch(UPSTREAM_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      headers: headers,
      muteHttpExceptions: true,
      followRedirects: false,
      validateHttpsCertificates: true
    });
  } catch (_) {
    throw fault_('UPSTREAM_FETCH_FAILED');
  }
  const status = response.getResponseCode();
  if (status !== 200) throw fault_('UPSTREAM_HTTP', status);
  const bytes = response.getContent(); // Apps Script Byte[]: 음수 값도 포함 가능.
  verifyFrame_(bytes);
  return bytes;
}

function verifyFrame_(bytes) {
  if (!bytes || bytes.length !== FRAME_BYTES) throw fault_('FRAME_LENGTH');
  if ((bytes[0] & 255) !== 69 || (bytes[1] & 255) !== 80 ||
      (bytes[2] & 255) !== 68 || (bytes[3] & 255) !== 50 ||
      (bytes[4] & 255) !== 1 || (bytes[5] & 255) !== 0 ||
      u16_(bytes, 6) !== 800 || u16_(bytes, 8) !== 480 ||
      u16_(bytes, 10) !== 32 || u32_(bytes, 12) !== PLANE_BYTES) {
    throw fault_('FRAME_HEADER');
  }
  const sleep = u32_(bytes, 28);
  if (sleep < 300 || sleep > 3600) throw fault_('FRAME_SLEEP');
  if (crc32_(bytes, 32, PLANE_BYTES) !== u32_(bytes, 20) ||
      crc32_(bytes, 32 + PLANE_BYTES, PLANE_BYTES) !== u32_(bytes, 24)) {
    throw fault_('FRAME_CRC');
  }
}

function u16_(bytes, at) {
  return (bytes[at] & 255) | ((bytes[at + 1] & 255) << 8);
}
function u32_(bytes, at) {
  return ((bytes[at] & 255) | ((bytes[at + 1] & 255) << 8) |
    ((bytes[at + 2] & 255) << 16) | ((bytes[at + 3] & 255) << 24)) >>> 0;
}
function crc32_(bytes, offset, length) {
  let c = 0xffffffff;
  for (let i = offset; i < offset + length; i++) {
    c ^= bytes[i] & 255;
    for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function equalToken_(got, expected) {
  if (typeof got !== 'string' || got.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
function utf8Length_(text) { return Utilities.newBlob(text).getBytes().length; }
function text_(value) {
  return ContentService.createTextOutput(value).setMimeType(ContentService.MimeType.TEXT);
}
function fault_(code, status) {
  const error = new Error(code);
  error.relayCode = code;
  if (status !== undefined) error.upstreamStatus = status;
  return error;
}
function safeError_(error) {
  const result = {ok: false, error: error && error.relayCode || 'RELAY_INTERNAL'};
  if (error && Number.isInteger(error.upstreamStatus)) result.upstreamStatus = error.upstreamStatus;
  return result; // 상위 서버 본문, 인증 토큰, 개인 메모를 반환하거나 기록하지 않음.
}
