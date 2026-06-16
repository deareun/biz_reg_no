# React + Next.js Frontend 포팅 설정 가이드

## 개요

이 프로젝트는 기존 Flask 기반의 사업자번호 조회 시스템을 **React + Next.js + TypeScript + shadcn/ui**로 포팅한 프론트엔드입니다.

## 폴더 구조

```
frontend/
├── app/
│   ├── inquiry/
│   │   └── page.tsx           # 조회하기 페이지
│   ├── history/
│   │   └── page.tsx           # 조회이력 페이지
│   ├── globals.css            # 글로벌 스타일
│   └── layout.tsx             # 루트 레이아웃
├── components/
│   ├── ui/                    # shadcn/ui 컴포넌트
│   ├── inquiry-form.tsx       # 조회 폼 컴포넌트
│   ├── inquiry-results-table.tsx  # 조회 결과 테이블
│   ├── data-download-modal.tsx    # 자료받기 모달
│   ├── history-filter.tsx     # 이력 필터 컴포넌트
│   └── history-table.tsx      # 이력 테이블 컴포넌트
├── lib/
│   ├── api.ts                 # API 호출 함수
│   ├── types.ts               # TypeScript 타입 정의
│   └── utils.ts               # 유틸리티 함수
├── hooks/
│   └── use-toast.ts           # 토스트 알림 훅
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
└── .env.example               # 환경 변수 예시
```

## 설치 및 실행

### 1. 의존성 설치

```bash
cd frontend
npm install
# 또는
yarn install
```

### 2. 환경 설정

`.env.example` 파일을 참고하여 `.env.local` 파일을 생성합니다:

```bash
cp .env.example .env.local
```

`.env.local` 파일에서 Flask 백엔드 URL을 설정합니다:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

### 3. 개발 서버 실행

```bash
npm run dev
# 또는
yarn dev
```

개발 서버가 http://localhost:3000 에서 실행됩니다.

### 4. 프로덕션 빌드

```bash
npm run build
npm run start
```

## 주요 기능

### 1. 조회하기 (`/inquiry`)

- **사업자번호 입력**: 텍스트 영역에서 쉼표/엔터로 구분된 입력 지원
- **업종매핑 옵션**: AI 기반 자동 분류 (Gemini API 활용)
- **결과 테이블**: 조회 결과를 테이블로 표시
  - 사업자번호, 상호명, 조회일시, 상태 표시
  - 행 전개/축소로 상세 정보 조회 가능
- **자료받기 모달**:
  - CSV 다운로드 (필드 선택 가능)
  - 이메일 발송 (필드 선택 가능)

### 2. 조회이력 (`/history`)

- **필터링**:
  - 사업자번호 검색
  - 상호명 검색
  - 조회 기간 필터 (캘린더 선택)
  - 조회 유형 필터 (Bizno API, 크롤링, 통신판매업, 가맹사업)

- **이력 관리**:
  - 개별/전체 선택 삭제
  - 3개월 경과 데이터 일괄 삭제
  - 업종매핑 수동 편집 (드롭다운 선택)
  - 편집 결과 즉시 DB 저장

## API 통신

### API 계층 (`lib/api.ts`)

모든 API 호출은 `lib/api.ts`를 통해 관리됩니다:

```typescript
// 사업자번호 조회
const results = await inquiryAPI.lookup({
  business_numbers: '1234567890,9876543210',
  perform_category_mapping: true
});

// CSV 다운로드
await inquiryAPI.downloadCSV(results, ['상호명', '사업자상태']);

// 이메일 발송
await inquiryAPI.sendEmail(results, 'user@example.com');

// 이력 조회 (필터 지원)
const history = await historyAPI.getHistory({
  bizno: '1234567890',
  date_from: new Date('2024-01-01'),
  date_to: new Date('2024-12-31'),
  status_filters: ['bizno_api', 'franchise']
});

// 업종매핑 업데이트
await historyAPI.updateCategoryMapping(recordId, {
  code: '001',
  name: '음식점'
});
```

### Flask 백엔드 연동

Flask 백엔드의 다음 엔드포인트와 연동됩니다:

- `POST /api/lookup` - 사업자번호 조회
- `GET /api/history` - 이력 조회
- `DELETE /api/history/delete-multiple` - 선택 항목 삭제
- `POST /api/history/delete-old` - 오래된 데이터 삭제
- `POST /api/update-mapping` - 업종매핑 업데이트
- `GET /api/categories` - 업종 카테고리 조회
- `POST /api/generate-csv` - CSV 생성
- `POST /api/send-email` - 이메일 발송

## 상태 관리

### 페이지 레벨 상태

페이지별로 필요한 상태를 `useState`로 관리합니다:

- **조회하기**: 입력값, 로딩 상태, 결과, 모달 상태
- **조회이력**: 필터값, 새로고침 트리거

### API 상태

`useEffect`를 통해 API 호출 및 데이터 관리:

```typescript
useEffect(() => {
  const loadData = async () => {
    const data = await historyAPI.getHistory(filters);
    setRecords(data);
  };
  loadData();
}, [filters, refreshTrigger]);
```

## 컴포넌트 구조

### shadcn/ui 컴포넌트

프로젝트에서 사용하는 shadcn/ui 컴포넌트:

- `Button` - 버튼
- `Input` - 입력 필드
- `Textarea` - 다중 줄 입력
- `Checkbox` - 체크박스
- `Select` - 드롭다운 선택
- `Card` - 카드 컨테이너
- `Table` - 데이터 테이블
- `Dialog` - 모달
- `Tabs` - 탭
- `Alert` - 알림
- `Badge` - 배지
- `Calendar` - 날짜 선택
- `Popover` - 팝오버
- `AlertDialog` - 확인 대화상자
- `Separator` - 구분선

## 에러 처리

### 에러 처리 전략

```typescript
try {
  const results = await inquiryAPI.lookup(request);
  setResults(results);
} catch (err) {
  const message = errorHandler.formatErrorMessage(err);
  setError(message);
  toast.error(message);
}
```

### 에러 유형

- **네트워크 에러**: "네트워크 연결을 확인하세요"
- **잘못된 입력**: "사업자번호는 10자리 숫자여야 합니다"
- **API 에러**: "조회 중 오류가 발생했습니다"
- **서버 에러**: "서버에 일시적 문제가 발생했습니다"

## 성능 최적화

1. **Code Splitting**: Next.js 자동 페이지 분할
2. **Image Optimization**: `next/image` 컴포넌트 사용
3. **Font Optimization**: `next/font` 사용
4. **Debouncing**: 필터 입력 시 debounce 적용 (선택사항)
5. **Lazy Loading**: 대용량 테이블 시 virtual scrolling (선택사항)

## 배포

### Vercel 배포 (권장)

```bash
npm install -g vercel
vercel
```

### 환경 변수 설정

Vercel 대시보드에서 다음을 설정합니다:

```
NEXT_PUBLIC_API_URL=https://api.example.com
```

## 개발 가이드

### 새로운 API 호출 추가

`lib/api.ts`에 함수 추가:

```typescript
export const myAPI = {
  async getData(params: MyParams): Promise<MyResponse> {
    const response = await fetchAPI<APIResponse<MyResponse>>(
      '/api/my-endpoint',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    
    if (!response.success) {
      throw new APIError(400, response.error || '요청 실패');
    }
    
    return response.data!;
  },
};
```

### 새로운 컴포넌트 추가

1. `components/` 폴더에 파일 생성
2. `'use client'` 지시문 추가 (상호작용 컴포넌트의 경우)
3. Props 타입 정의 (TypeScript)
4. 필요한 shadcn/ui 컴포넌트 import

### 스타일 커스터마이징

`app/globals.css`에서 CSS 변수 수정:

```css
:root {
  --primary: 262.1 80% 50.4%;
  --muted: 0 0% 96.1%;
  /* ... */
}
```

Tailwind CSS 클래스로 스타일 적용.

## 트러블슈팅

### CORS 에러

Flask 백엔드의 CORS 설정 확인:

```python
from flask_cors import CORS
CORS(app)
```

### API 타임아웃

`.env.local`의 Flask 백엔드 URL 확인:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

### 빌드 에러

TypeScript 타입 확인:

```bash
npm run type-check
```

## 참고 자료

- [Next.js 문서](https://nextjs.org/docs)
- [shadcn/ui 가이드](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [TypeScript 핸드북](https://www.typescriptlang.org/docs/)
