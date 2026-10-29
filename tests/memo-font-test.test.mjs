import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMemoFontTest} from '../lib/epaper/memo-font-test.mjs';
import {makeViewSvg} from '../lib/epaper/views.mjs';
import {renderDashboard,fitText} from '../lib/epaper/render.mjs';
import {crc32} from '../lib/epaper/protocol.mjs';
import handler from '../api/frame.js';

const data={calendar:{date:'2026-10-28'}};
const battery={label:'80%',fill:18};
const status={generated:'18:20',intervalMinutes:5};

test('only explicit supported memo commands trigger the test',()=>{
  assert.deepEqual(parseMemoFontTest(' 글자테스트 '),{size:null});
  assert.deepEqual(parseMemoFontTest('글자 테스트 22'),{size:22});
  for(const s of ['일반 메모','글자테스트를 해보자','글자테스트 21','글자테스트 200','글자테스트 20 추가','<script>글자테스트</script>'])assert.equal(parseMemoFontTest(s),null);
  const clock=makeViewSvg(data,battery,status,fitText,{mode:'clock',memo:'글자테스트'});
  assert.ok(!clock.includes('읽기 테스트'));
  const regular=makeViewSvg(data,battery,status,fitText,{mode:'memo',memo:'일반 메모 < & >'});
  assert.ok(regular.includes('기억해 둘 것들'));
  assert.ok(regular.includes('&lt; &amp; &gt;'));
});

test('all five pages render through the actual production renderer with a blank red plane',async()=>{
  const crcs=new Set();
  for(const memo of ['글자테스트',...['18','20','22','24'].map(n=>'글자테스트 '+n)]){
    const result=await renderDashboard(data,battery,status,{mode:'memo',memo});
    assert.equal(result.black.length,48000);assert.equal(result.red.length,48000);
    assert.ok(result.black.some(x=>x!==255));assert.ok(result.red.every(x=>x===255));
    crcs.add(crc32(result.black));
  }
  assert.equal(crcs.size,5);
});

test('clock/battery changes do not force test-page redraws',async()=>{
  const opts={mode:'memo',memo:'글자테스트'};
  const a=await renderDashboard(data,battery,status,opts);
  const b=await renderDashboard(data,{label:'79%',fill:17},{generated:'18:25',intervalMinutes:15},opts);
  assert.deepEqual(a.black,b.black);assert.deepEqual(a.red,b.red);
});

test('the existing POST API returns a CRC-valid EPD2 bundle without calling data services',async()=>{
  const previousFetch=globalThis.fetch;
  globalThis.fetch=()=>{throw Error('Font test must not fetch calendar/weather/market data');};
  try{
    for(const memo of ['글자테스트','글자테스트 20']){
      const req={method:'POST',headers:{'content-type':'application/json'},body:{mode:'memo',memo,format:'bundle',sleep_s:300}};
      if(process.env.FRAME_API_TOKEN)req.headers.authorization='Bearer '+process.env.FRAME_API_TOKEN;
      const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(x){this.body=x;return this;},send(x){this.body=x;return this;}};
      await handler(req,res);
      assert.equal(res.code,200);assert.equal(res.body.length,96032);
      assert.equal(res.body.subarray(0,4).toString(),'EPD2');
      assert.equal(res.body.readUInt32LE(20),crc32(res.body.subarray(32,48032)));
      assert.equal(res.body.readUInt32LE(24),crc32(res.body.subarray(48032)));
      assert.equal(res.headers['Content-Type'],'application/octet-stream');
    }
  }finally{globalThis.fetch=previousFetch;}
});
