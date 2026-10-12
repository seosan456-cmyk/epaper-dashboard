# E-paper Google relay — 1단계 접속·중계 검증

현재 버셀 화면 렌더링을 유지하면서 ESP32가 Google Apps Script에서 화면을 받도록 하는 중계 서버입니다.
기존 캘린더용 Apps Script와 **별도의 새 프로젝트**를 사용합니다.
현재 단계는 중계 서버 준비입니다. ESP32 클라이언트 연결은 아직 구현·검증하지 않았습니다.

## 지금 할 일

1. `Code.gs`를 열어 **Raw(원본)** 버튼을 누르고 전체 내용을 복사합니다.
2. https://script.google.com/ 에서 **새 프로젝트**를 만들고 이름을 `전자잉크 화면 중계`로 정합니다.
3. 기본 `Code.gs` 내용을 전체 교체하고 저장합니다.
4. 상단 함수 선택에서 **setupRelay**를 선택해 **실행**합니다. 처음에는 본인 계정에서 권한을 승인합니다.
   실행 로그의 `"ok": true`와 `"초기 설정 완료"`를 확인합니다.
   재실행해도 기존 중계 토큰은 바뀌지 않습니다.
5. 오른쪽 위 **배포 → 새 배포 → 유형: 웹 앱**을 선택합니다.
   - 실행 사용자: **나**
   - 액세스 권한: **모든 사용자** (Google 로그인을 요구하지 않는 항목)
   - 배포 후 **/exec로 끝나는 웹 앱 URL**을 복사합니다.
   - /dev 개발용 URL이나 주소 이동 후의 일회성 googleusercontent URL은 사용하지 않습니다.
6. **학교 Wi-Fi에서** /exec 주소를 엽니다. 로그인하지 않은 시크릿 창에서도 열려야 합니다.
   아래처럼 나오면 Google까지의 웹 접속이 확인된 것입니다.

```json
{
  "ok": true,
  "service": "epaper-google-relay",
  "version": "1.0",
  "message": "구글 접속 성공",
  "configured": true
}
```

`time`과 `lastTest`도 출력됩니다. 이 첫 결과는 버셀 화면 수신 성공을 의미하지 않습니다.

7. 같은 주소 뒤에 **?probe=large**를 붙여 엽니다.
   맨 앞 `EPD-PROBE/1`, 다음 줄 `131072`, 맨 끝 `END`가 보이면 약 128 KiB의 테스트 본문도 받았습니다.
   이 데이터는 가짜 테스트 문자열이며 일정·메모·화면 데이터를 포함하지 않습니다.
8. Apps Script 편집기로 돌아가 함수 **testRelay**를 선택해 **실행**합니다.
   Google 서버에서 버셀의 시계 화면을 POST로 가져와 실제 화면 크기·헤더·양쪽 CRC를 검사합니다.
   아래 실행 결과가 기대값입니다.

```json
{
  "ok": true,
  "mode": "clock",
  "bytes": 96032,
  "protocol": "EPD2",
  "crc": true,
  "message": "버셀 화면 수신 및 CRC 검사 성공"
}
```

9. 이어서 **testDashboardRelay**를 실행하면 캘린더 등 실제 대시보드 데이터까지 포함하여 검사합니다.
   이 검사는 ESP32 내부에 저장한 메모나 D-DAY를 읽지는 않습니다.
10. **/exec URL, 학교망 접속 결과, testRelay/testDashboardRelay 실행 결과**를 전달합니다.
    현재 사용 중인 아두이노 스케치 폴더 ZIP도 펌웨어 수정에 필요합니다.
    공유용 ZIP의 config.h 사본에서는 Wi-Fi 비밀번호와 토큰 값을 비우고, 실제 설정은 PC에 별도 보관합니다.

조직 계정에서 '모든 사용자' 배포가 허용되지 않으면 그 설정을 그대로 알려주세요.
로그인 화면이 나온 상태를 ESP32 접속 성공으로 취급하지 않습니다.

## 실패 결과 해석

- Google URL 자체를 열지 못함: 먼저 학교망 Google 웹 앱 접근/배포 권한 확인.
- `configured: false`: setupRelay 실행 여부 확인.
- `UPSTREAM_HTTP, upstreamStatus: 401`: 기존 버셀 FRAME_API_TOKEN 사용 여부 확인.
  사용하는 경우 Apps Script **프로젝트 설정 → 스크립트 속성**에
  `UPSTREAM_API_TOKEN`을 추가하고 기존 토큰과 같은 값으로 설정합니다.
- `UPSTREAM_HTTP, upstreamStatus: 503`: 버셀까지 도착했으나 서버의 자료 수집이 실패했습니다.
  시계 검사만 성공하고 대시보드 검사가 503이면 캘린더/외부 자료 문제부터 확인합니다.
- `UPSTREAM_FETCH_FAILED`: Google에서 버셀로 요청하는 단계에서 실패.
- `FRAME_LENGTH / FRAME_HEADER / FRAME_CRC`: 200 응답이라도 정상 화면 파일이 아니므로 전달하지 않습니다.

토큰·Wi-Fi 비밀번호·캘린더 원문은 진단 로그에 넣지 않습니다.
`RELAY_TOKEN`은 setupRelay가 스크립트 속성에 생성합니다. 펌웨어 설정에 나중에 입력하며 URL이나 GitHub에는 넣지 않습니다.

## 펌웨어용 전송 규약

로그인 없이 접속할 수 있는 /exec에 다음 JSON을 POST합니다.

```json
{
  "relayToken": "<스크립트 속성 RELAY_TOKEN>",
  "frame": {
    "format": "bundle",
    "mode": "dashboard",
    "sleep_s": 300
  }
}
```

`frame`에 기존 /api/frame 요청의 배터리 값, 메모 및 dashboard 내용을 그대로 포함합니다.
개인 내용은 URL 쿼리가 아닌 POST 본문으로만 보냅니다.
중계 토큰과 버셀 인증 토큰은 별개입니다.
중계 대상은 코드에 고정된 하나의 HTTPS 주소입니다. 클라이언트가 임의 URL을 지정할 수 없습니다.
Google→버셀 요청은 인증서 검증을 유지하고 리디렉션을 따라가지 않습니다.

성공 응답 (text/plain, UTF-8):

```text
EPD64/1
96032
128044
<기존 96032-byte EPD2 번들의 표준 Base64, 줄바꿈 없음>
```

실패 응답:

```text
EPDERR/1
{"ok":false,"error":"UPSTREAM_HTTP","upstreamStatus":503}
```

Apps Script ContentService는 오류도 HTTP 200으로 반환할 수 있으므로 **본문 접두어와 원본 EPD2 CRC를 반드시 검사**해야 합니다.
health JSON, Google 로그인 HTML, EPD-PROBE/1 테스트 본문은 프레임이 아닙니다.

ContentService는 script.googleusercontent.com의 일회성 응답 URL로 이동합니다.
펌웨어는 Google이 반환한 허용된 HTTPS 응답 주소로만 이동하고,
일회성 응답을 GET으로 받아야 하며 그 요청에 POST 본문/토큰을 재전송해서는 안 됩니다.
클라이언트 구현 시 실제 리디렉션 상태 코드와 HTTP chunked 응답을 검증해야 합니다.
양쪽 Google 호스트의 인증서 검증을 유지합니다.

ESP32에서는 큰 String/JSON/base64 배열을 만들지 않습니다.
전송을 조금씩 해석해 Base64를 복원하고 LittleFS 임시 파일로 저장한 뒤,
원본 EPD2 파일의 전체 길이·헤더·CRC를 다시 검사합니다.
TLS 연결을 닫은 뒤 프레임 버퍼를 할당하는 현재 순서를 유지합니다.
다운로드/검증 실패 시 기존 화면 파일과 표시 내용을 유지합니다.
업스트림 지연·재시도에 대한 전체 깨어있는 시간 제한도 기존 펌웨어와 함께 조정해야 합니다.

## 검증 범위

```sh
node tools/apps-script-relay/relay.test.mjs
```

19개 모의 테스트: 실제 저장소 EPD2 생산 코드와 호환, signed Byte[] 복원,
한글 메모 보존, UTF-8 크기 제한, 인증 실패, 잘못된 헤더/CRC, 503/리디렉션/네트워크 예외,
128 KiB 프로브, 비밀 정보 없는 진단.

모의 테스트는 Apps Script 실제 배포·학교망 접속·ESP32 실기 테스트를 대체하지 않습니다.
현재 기존 api/frame.js, 디자인, 캘린더, 블루투스 설정 페이지는 수정하지 않았습니다.
블루투스 웹 설정 페이지의 학교망 접속은 별도로 검토합니다.

## 참고 문서

- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/guides/content
- https://developers.google.com/apps-script/reference/url-fetch/http-response
