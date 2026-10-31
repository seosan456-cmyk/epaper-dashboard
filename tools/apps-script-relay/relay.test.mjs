import {readFileSync} from 'node:fs';


function runRelayTests(source, protocolSource) {
  const passed = [];
  function assert(value, message) { if (!value) throw new Error(message); }
  function check(name, fn) { fn(); passed.push(name); }
  function utf8(s) {
    const bytes = [];
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c < 128) bytes.push(c);
      else if (c < 2048) bytes.push(192 | (c >> 6), 128 | (c & 63));
      else if (c < 65536) bytes.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
      else bytes.push(240 | (c >> 18), 128 | ((c >> 12) & 63), 128 | ((c >> 6) & 63), 128 | (c & 63));
    }
    return bytes;
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function base64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i] & 255, b = (bytes[i + 1] || 0) & 255, c = (bytes[i + 2] || 0) & 255;
      s += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)] +
        (i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : '=') +
        (i + 2 < bytes.length ? alphabet[c & 63] : '=');
    }
    return s;
  }
  class ByteBuffer extends Uint8Array {
    static alloc(n) { return new ByteBuffer(n); }
    static concat(parts) {
      const result = new ByteBuffer(parts.reduce((n, p) => n + p.length, 0));
      let offset = 0;
      for (const p of parts) { result.set(p, offset); offset += p.length; }
      return result;
    }
    write(s) { for (let i = 0; i < s.length; i++) this[i] = s.charCodeAt(i); }
    writeUInt16LE(n, at) { this[at] = n; this[at + 1] = n >>> 8; }
    writeUInt32LE(n, at) { for (let i = 0; i < 4; i++) this[at + i] = n >>> (8 * i); }
  }
  // Use the repository's real EPD2 producer for compatibility, not a relay-specific fixture format.
  const protocol = new Function('Buffer', protocolSource.replace(/export /g, '') + ';return {bundleFrame,crc32};')(ByteBuffer);
  const black = Uint8Array.from({length:48000}, (_, i) => (i * 17 + 31) & 255);
  const red = Uint8Array.from({length:48000}, (_, i) => (i * 19 + 7) & 255);
  const frame = protocol.bundleFrame(black, red, 1791766800, 300);
  const signed = Array.from(frame, x => x > 127 ? x - 256 : x);
  function make() {
    const props = {};
    const calls = [], logs = [];
    let response = {status:200, bytes:signed};
    let thrown = false;
    let uuidCalls = 0;
    const Utilities = {
      getUuid: () => (++uuidCalls === 1 ? '01234567-89ab-cdef-0123-456789abcdef' : 'fedcba98-7654-3210-fedc-ba9876543210'),
      newBlob: s => ({getBytes: () => utf8(s)}),
      base64Encode: base64
    };
    const PropertiesService = {getScriptProperties: () => ({
      getProperty: name => Object.prototype.hasOwnProperty.call(props, name) ? props[name] : null,
      setProperty: (name, value) => { props[name] = value; }
    })};
    const ContentService = {MimeType:{JSON:'application/json', TEXT:'text/plain'},
      createTextOutput: text => ({text, mime:null, setMimeType(mime){this.mime=mime;return this;}})};
    const UrlFetchApp = {fetch:(url, options) => {
      calls.push({url, options});
      if (thrown) throw Error('Secret transport detail SHOULD_NOT_LEAK');
      return {getResponseCode:() => response.status, getContent:() => response.bytes};
    }};
    const api = new Function('Utilities', 'PropertiesService', 'ContentService', 'UrlFetchApp', 'console',
      source + ';return {setupRelay,doGet,doPost,testRelay,testDashboardRelay,verifyFrame_,crc32_};')(
      Utilities, PropertiesService, ContentService, UrlFetchApp, {log:x=>logs.push(x)});
    return {api, props, calls, logs,
      reply:(status, bytes=signed)=>{response={status,bytes};},
      throwFetch:()=>{thrown=true;},
      post:(frameRequest, token=props.RELAY_TOKEN)=>api.doPost({postData:{
        contents:JSON.stringify({relayToken:token,frame:frameRequest})
      }})};
  }
  const parseError = output => {
    assert(output.text.startsWith('EPDERR/1\n'), 'Missing error prefix');
    return JSON.parse(output.text.slice('EPDERR/1\n'.length));
  };
  check('CRC-32 known vector', () => {
    const s = make();
    assert(s.api.crc32_(Array.from('123456789', c=>c.charCodeAt(0)),0,9)===0xcbf43926, 'CRC vector');
  });
  check('Public health is safe before setup', () => {
    const s=make(), h=JSON.parse(s.api.doGet().text);
    assert(h.ok && !h.configured && h.service==='epaper-google-relay', 'Health');
    assert(s.calls.length===0, 'Health fetched upstream');
  });
  check('Setup is idempotent and does not disclose token', () => {
    const s=make(); s.api.setupRelay(); const token=s.props.RELAY_TOKEN;
    assert(/^[0-9a-f]{64}$/.test(token), 'Key shape');
    s.api.setupRelay();
    assert(s.props.RELAY_TOKEN===token, 'Setup rotated key');
    assert(!s.logs.join('').includes(token), 'Token logged');
    assert(!s.api.doGet().text.includes(token), 'Public key disclosure');
  });
  check('Large probe does not fetch Vercel and is not a frame', () => {
    const s=make(), out=s.api.doGet({parameter:{probe:'large'}}).text;
    assert(out.startsWith('EPD-PROBE/1\n131072\n') && out.endsWith('\nEND'), 'Probe framing');
    assert(out.split('\n')[2].length===131072 && s.calls.length===0, 'Probe length');
  });
  check('Missing setup fails closed', () => {
    const s=make();
    assert(parseError(s.post({})).error==='RELAY_NOT_CONFIGURED' && s.calls.length===0,'Unconfigured');
  });
  check('Wrong token cannot reach upstream', () => {
    const s=make();s.api.setupRelay();
    assert(parseError(s.post({},'wrong')).error==='UNAUTHORIZED' && s.calls.length===0,'Bad auth');
  });
  check('Malformed/missing/array requests fail before fetch', () => {
    const s=make();s.api.setupRelay();
    for(const raw of ['','{','null','[]']) {
      const out=s.api.doPost({postData:{contents:raw}});
      assert(parseError(out).ok===false,'Bad request accepted');
    }
    assert(parseError(s.api.doPost()).error==='INVALID_REQUEST' && s.calls.length===0,'Missing request');
  });
  check('Request UTF-8 byte limit enforced', () => {
    const s=make();s.api.setupRelay();
    const out=s.api.doPost({postData:{contents:'가'.repeat(5000)}});
    assert(parseError(out).error==='INVALID_REQUEST' && s.calls.length===0,'UTF8 request bound');
  });
  check('Frame UTF-8 byte limit enforced', () => {
    const s=make();s.api.setupRelay();
    assert(parseError(s.post({memo:'가'.repeat(2800)})).error==='FRAME_REQUEST_TOO_LARGE','Frame bound');
    assert(s.calls.length===0,'Too-large frame sent');
  });
  check('Malformed frame/layer/format cannot reach upstream', () => {
    const s=make();s.api.setupRelay();
    for(const q of [null,[],{layer:'red'},{format:'png'}]) {
      assert(parseError(s.post(q)).error==='INVALID_FRAME_REQUEST','Bad frame accepted');
    }
    assert(s.calls.length===0,'Malformed upstream');
  });
  check('Notes/DDay/mode/battery forwarded as POST; relay token stays private', () => {
    const s=make();s.api.setupRelay();s.props.UPSTREAM_API_TOKEN='upstream-test-secret';
    const request={mode:'dashboard',battery_mv:4000,sleep_s:600,dashboard:{
      version:1,dday:{title:'겨울방학',date:'2026-12-30'},
      notes:['가'.repeat(22)+'\n'+'나'.repeat(22),'둘째 메모'],
      important:[{title:'중간고사',date:'2026-10-20'},null,null]
    }};
    const out=s.post(request), sent=s.calls[0];
    assert(out.text.startsWith('EPD64/1\n96032\n128044\n'),'Frame envelope');
    assert(sent.url==='https://epaper-dashboard-live.vercel.app/api/frame','Wrong endpoint');
    assert(sent.options.method==='post' && sent.options.followRedirects===false &&
      sent.options.validateHttpsCertificates===true,'Transport options');
    assert(sent.options.headers.Authorization==='Bearer upstream-test-secret','Upstream auth');
    const q=JSON.parse(sent.options.payload);
    assert(q.format==='bundle' && JSON.stringify(q.dashboard)===JSON.stringify(request.dashboard),'Content changed');
    assert(!sent.options.payload.includes(s.props.RELAY_TOKEN),'Relay token leaked upstream');
  });
  check('Base64 recovers the exact 96032 bytes (including signed Byte[])', () => {
    const s=make();s.api.setupRelay();
    const encoded=s.post({mode:'clock'}).text.split('\n')[3];
    assert(encoded.length===128044 && encoded.endsWith('='),'Base64 size/padding');
    let acc=0,bits=0,index=0;
    for(const ch of encoded) {
      if(ch==='=')break;
      acc=(acc<<6)|alphabet.indexOf(ch);bits+=6;
      if(bits>=8){bits-=8;assert(((acc>>>bits)&255)===frame[index++],'Roundtrip bytes');}
    }
    assert(index===frame.length,'Roundtrip size');
  });
  check('HTTP 401/403/429/500/503 and redirects remain explicit errors', () => {
    const s=make();s.api.setupRelay();
    for(const status of [301,302,303,307,308,401,403,429,500,503]) {
      s.reply(status);
      const out=parseError(s.post({mode:'clock'}));
      assert(out.error==='UPSTREAM_HTTP' && out.upstreamStatus===status,'Upstream status lost');
    }
  });
  check('HTML/truncated/oversized success response rejected', () => {
    const s=make();s.api.setupRelay();
    for(const bytes of [[60,104,116,109,108,62],signed.slice(0,-1),signed.concat(0)]) {
      s.reply(200,bytes);
      assert(parseError(s.post({})).error==='FRAME_LENGTH','Bad length accepted');
    }
  });
  check('Header magic/version/flags/geometry/header-size/plane-size rejected', () => {
    const s=make();s.api.setupRelay();
    for(const offset of [0,1,2,3,4,5,6,8,10,12]) {
      const bad=signed.slice();bad[offset]^=1;s.reply(200,bad);
      assert(parseError(s.post({})).error==='FRAME_HEADER','Bad header accepted at '+offset);
    }
  });
  check('Sleep bounds rejected', () => {
    const s=make();s.api.setupRelay();
    for(const sleep of [0,299,3601,0xffffffff]) {
      const bad=Array.from(frame);
      for(let i=0;i<4;i++)bad[28+i]=(sleep>>>(i*8))&255;
      s.reply(200,bad);
      assert(parseError(s.post({})).error==='FRAME_SLEEP','Bad sleep accepted');
    }
  });
  check('Either plane or stored CRC corruption rejected', () => {
    const s=make();s.api.setupRelay();
    for(const at of [20,24,32,48031,48032,96031]) {
      const bad=signed.slice();bad[at]^=1;s.reply(200,bad);
      assert(parseError(s.post({})).error==='FRAME_CRC','CRC mismatch accepted at '+at);
    }
  });
  check('Transport exception does not disclose internal text', () => {
    const s=make();s.api.setupRelay();s.throwFetch();
    const out=s.post({});
    assert(parseError(out).error==='UPSTREAM_FETCH_FAILED' && !out.text.includes('SHOULD_NOT_LEAK'),'Exception leakage');
  });
  check('Editor diagnostics publish safe summaries and preserve status', () => {
    const s=make();s.api.setupRelay();
    const good=s.api.testRelay();
    assert(good.ok && good.crc && good.bytes===96032 && good.mode==='clock','Clock test');
    const publicHealth=JSON.parse(s.api.doGet().text);
    assert(publicHealth.lastTest.ok && !JSON.stringify(publicHealth).includes(s.props.RELAY_TOKEN),'Public diagnostics');
    s.reply(503);const failed=s.api.testDashboardRelay();
    assert(!failed.ok && failed.mode==='dashboard' && failed.upstreamStatus===503,'Dashboard error');
  });
  return {passed:passed.length, cases:passed};
}

const source=readFileSync(new URL('./Code.gs',import.meta.url),'utf8');
const protocolSource=readFileSync(new URL('../../lib/epaper/protocol.mjs',import.meta.url),'utf8');
console.log(JSON.stringify(runRelayTests(source,protocolSource),null,2));
