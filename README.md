# Whiteboard4Share

**버전 1.0.5** — 로컬 PC·LAN에서 동작하는 실시간 협업 화이트보드 앱입니다.  
필압 펜 타블렛, 이미지·텍스트·표, 레이어 순서 조정, 자동 저장, Windows 포터블 exe 배포를 지원합니다.

- **제작**: 청년안민규
- **블로그**: [https://note4all.tistory.com](https://note4all.tistory.com)
- **저장소**: [https://github.com/soonpyopark/WhiteBoard4Share](https://github.com/soonpyopark/WhiteBoard4Share)
- **라이선스**: [GNU Affero General Public License v3.0](./LICENSE) (`AGPL-3.0-only`)

---

## 주요 기능

### 갤러리 · 권한
- 새 화이트보드 생성, 썸네일 미리보기, 이름 변경 / 삭제
- **총괄관리자 / 폴더관리자 / 일반 사용자** 역할
- 폴더(테넌트) 표시 이름 · 생성/이름변경/삭제 (총괄·폴더관리자 권한)
- 비공개·열람 제한 등 공유 가시성 설정
- 공유 링크로 화이트보드 열기
- `.wb4s` 파일로 가져오기 / 내보내기

### 그리기 & 편집
- **도구**: 텍스트, 손(화면 이동), 선택, 올가미, 연필, 볼펜, 형광펜, 지우개, 사진 첨부, **표**
- Wacom·XP-Pen 등 **필압 타블렛** 자동 반영 (Pointer Events + `pressure`)
- Catmull-Rom 스플라인 보간으로 부드러운 필기
- 연필·볼펜·형광펜: 선 두께·투명도·색상·선 끝 모양(일반/화살표) 설정
- **지우개**: 부분 지우기 / 획 전체 삭제 모드
- **텍스트**
  - 클릭하여 여러 줄 입력 (`Ctrl+Enter` 확정, `Esc` 취소)
  - 더블클릭으로 재편집
  - 글꼴·크기·색상 변경 (PC 설치 글꼴 이름 직접 입력 가능)
- **이미지**: 파일 첨부, 드래그·붙여넣기 (대용량 JPEG 자동 압축), 복사·파일 저장
- **표**: 셀 편집, 행·열 편집, Excel(`.xlsx`) 내보내기
- **선택·올가미**: 객체 선택, 다중 선택, 이동·크기 조절·회전
- **레이어 순서**: 우클릭 또는 0.5초 길게 누르기 → 맨 위로 / 위로 / 아래로 / 맨 아래로 / 개체 삭제
- 실행 취소 / 다시 실행
- **자동 저장** (편집 후 약 2.5초 뒤)
- **실시간 협업** (Yjs) — 저장·공유로 장면을 동기화

### 보기 · 내보내기
- 확대 / 축소 / 배율 직접 입력, 가로 너비 맞추기, 내용 중앙으로 이동
- 화이트보드 전체를 **PNG**로 저장

### Windows 포터블 exe
- 설치 없이 USB 폴더로 배포·실행
- 창을 닫으면 **트레이**로 최소화 (완전 종료는 트레이 메뉴 Exit)
- **단일 인스턴스** — 이미 실행 중이면 안내 후 재실행하지 않음
- 갤러리 도움말(`?`)에서 **GitHub Releases 업데이트 확인**
- LAN 공개: `.env`에서 `HOSTNAME=0.0.0.0` + `allow-firewall-inbound.bat`(관리자)

---

## 단축키

| 키 | 동작 |
|----|------|
| `Ctrl+Z` | 되돌리기 |
| `Ctrl+Y` / `Ctrl+Shift+Z` | 다시 실행 |
| `Delete` / `Backspace` | 선택 객체 삭제 |
| `Ctrl+Enter` | 텍스트 입력 확정 |

---

## Windows 포터블 exe (권장)

1. `Whiteboard4Share.exe` 실행 (또는 `exe/Whiteboard4Share-*/` 폴더에서 실행)
2. exe와 같은 폴더에 `data/`가 생성되며, 화이트보드가 JSON으로 저장됩니다.
3. 메뉴 바 없이 동작하며, 외부 링크는 **기본 브라우저**에서 열립니다.

> exe 빌드는 개발자용입니다. 소스에서 직접 만들려면 아래 **개발자용 빌드**를 참고하세요.

---

## 기본 계정 (로컬 인증)

`.env`로 덮어쓰지 않으면 다음 기본값을 사용합니다.

| 역할 | 아이디 | 비밀번호 |
|------|--------|----------|
| 총괄관리자 | `admin` | `admin1234` |
| 폴더관리자 | `admin.{폴더ID}` | `admin.{폴더ID}!!` |
| 일반 사용자 | (이름+폴더로 참여) | 공용 `user!!` (레거시·관리자 로그인용) |

Keycloak SSO는 `.env.example`의 `KEYCLOAK_*` 설정을 참고하세요.

---

## 소스에서 실행 (개발·수정)

### 요구 사항

- [Node.js](https://nodejs.org/) 20 이상
- npm

### 설치

```bash
git clone https://github.com/soonpyopark/WhiteBoard4Share.git
cd WhiteBoard4Share
npm install
```

### 개발 서버

```bash
npm run dev
```

브라우저에서 **http://localhost:3007** 접속 (`.env`의 `PORT`로 변경 가능)

설정 예시는 [`.env.example`](./.env.example)를 참고하세요.

| 변수 | 설명 |
|------|------|
| `PORT` | API·프론트 포트 (기본 `3007`) |
| `HOSTNAME` | 바인딩 주소 (기본 `127.0.0.1`, LAN은 `0.0.0.0`) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 총괄관리자 계정 |
| `VITE_HOME_URL` | (선택) 갤러리 «홈» 버튼 URL |

### 프로덕션 실행 (Electron)

```bash
npm run build
npm run start
```

`npm run start` / `npm run restart`는 Electron 창을 띄우고, 앱 안에서 서버(기본 `3007`)를 켭니다.  
브라우저만 쓰려면 `npm run start:web`을 사용하세요.

### Windows 포터블 exe 빌드

```bash
npm run build:dist:exe
```

빌드 결과:
- 폴더: `exe/Whiteboard4Share-{version}-{YYMMDD-HHMMSS}/`
- zip: `exe/Whiteboard4Share-{version}-{YYMMDD-HHMMSS}_portable.zip` (PC의 7-Zip 사용)

예: `exe/Whiteboard4Share-1.0.5-260712-220141_portable.zip`

> 7-Zip이 필요합니다. 기본 경로 `C:\Program Files\7-Zip\7z.exe` 또는 환경변수 `SEVEN_ZIP`로 지정하세요.

### 컴포넌트 일괄 업데이트

```bash
update_all.bat
```

업데이트 + exe 빌드:

```bash
npm run build:update_all
```

| 옵션 | 설명 |
|------|------|
| `build` | 업데이트 후 `npm run build:dist:exe` 실행 |
| `force` | `npm install --force` 및 Electron 바이너리 재확인 |
| `skip-git` | `git pull` 생략 |
| `skip-npm` | npm 설치·빌드 생략 |

로그: `data/logs/update-all.log`

### 기타 스크립트

```bash
npm run lint          # oxlint
npm run electron:dev  # Electron 로컬 실행 (개발용)
npm run build:update_all
```

---

## 데이터 저장 위치

| 실행 방식 | 저장 경로 |
|-----------|-----------|
| `npm run dev` / `npm run start` | 프로젝트 루트 `data/{id}.json` |
| Windows 포터블 exe | exe 파일 옆 `data/{id}.json` |

각 JSON에는 제목, 그림(`paths`), 이미지(`images`), 텍스트(`texts`), 표(`tables`), 썸네일 등이 포함됩니다.  
객체는 `zIndex`로 겹침 순서가 저장됩니다.  
파일 교환 형식은 `.wb4s` (`whiteboard4share` 포맷)입니다.

---

## 기술 스택

- React 19 + TypeScript + Vite 8
- Express 5 (로컬 REST API · JSON 파일 저장)
- Yjs + WebSocket (실시간 협업·시그널링)
- HTML5 Canvas 2D + Pointer Events
- Electron 36 (Windows portable exe · 트레이 · 단일 인스턴스)

---

## 라이선스

이 프로젝트는 [GNU Affero General Public License v3.0](./LICENSE) (`AGPL-3.0-only`) 하에 배포됩니다.

- 사용·수정·재배포가 가능하지만, **파생 저작물도 동일한 AGPL-3.0**으로 공개해야 합니다.
- 수정한 버전을 **네트워크 서비스로 제공하는 경우**에도, 해당 수정본의 **전체 소스 코드**를 이용자에게 제공해야 합니다.
- 배포 시 **저작권 표시와 LICENSE 전문**을 포함해 주세요.

Copyright (c) 2025-2026 청년안민규 — [https://note4all.tistory.com](https://note4all.tistory.com)

---

## 문의

배포·사용 관련 안내 및 업데이트는 아래 블로그에서 확인할 수 있습니다.

**[https://note4all.tistory.com](https://note4all.tistory.com)**
