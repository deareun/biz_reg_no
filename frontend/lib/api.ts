/**
 * Flask 백엔드와의 통신을 담당하는 API 계층
 */

import {
  InquiryRequest,
  InquiryResult,
  HistoryRecord,
  HistoryFilter,
  APIResponse,
  Categories,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/**
 * 일반적인 API 에러 처리
 */
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * API 요청 수행 헬퍼 함수
 */
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: response.statusText };
      }
      throw new APIError(
        response.status,
        errorData.error || errorData.message || `HTTP ${response.status}`,
        errorData
      );
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    if (error instanceof TypeError) {
      throw new APIError(0, '네트워크 연결을 확인하세요.', error);
    }
    throw new APIError(500, '알 수 없는 오류가 발생했습니다.', error);
  }
}

/**
 * 조회하기 API
 */
export const inquiryAPI = {
  /**
   * 사업자번호 일괄 조회
   */
  async lookup(request: InquiryRequest): Promise<InquiryResult[]> {
    const response = await fetchAPI<APIResponse<InquiryResult[]>>(
      '/api/lookup',
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );

    if (!response.success) {
      throw new APIError(400, response.error || '조회 실패');
    }

    return response.data || [];
  },

  /**
   * CSV 다운로드
   */
  async downloadCSV(
    data: InquiryResult[],
    biznoFields?: string[],
    teleFields?: string[],
    crawlFields?: string[],
    mappingFields?: string[]
  ): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/generate-csv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data,
          bizno_fields: biznoFields,
          tele_fields: teleFields,
          crawl_fields: crawlFields,
          mapping_fields: mappingFields,
        }),
      });

      if (!response.ok) {
        throw new Error('CSV 다운로드 실패');
      }

      // Blob으로 변환하여 다운로드
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `business_lookup_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      throw new APIError(
        500,
        'CSV 다운로드 중 오류가 발생했습니다.',
        error
      );
    }
  },

  /**
   * 메일로 결과 발송
   */
  async sendEmail(
    data: InquiryResult[],
    email: string,
    biznoFields?: string[],
    teleFields?: string[],
    crawlFields?: string[],
    mappingFields?: string[]
  ): Promise<string> {
    const response = await fetchAPI<APIResponse<void>>(
      '/api/send-email',
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          data,
          bizno_fields: biznoFields,
          tele_fields: teleFields,
          crawl_fields: crawlFields,
          mapping_fields: mappingFields,
        }),
      }
    );

    if (!response.success) {
      throw new APIError(400, response.error || '메일 발송 실패');
    }

    return response.message || '메일이 발송되었습니다.';
  },
};

/**
 * 조회 이력 API
 */
export const historyAPI = {
  /**
   * 이력 조회 (필터링 지원)
   */
  async getHistory(filters?: HistoryFilter): Promise<HistoryRecord[]> {
    // 필터 쿼리 스트링 구성
    const params = new URLSearchParams();
    if (filters?.bizno) params.append('bizno', filters.bizno);
    if (filters?.company_name) params.append('company_name', filters.company_name);
    if (filters?.date_from)
      params.append('date_from', filters.date_from.toISOString());
    if (filters?.date_to) params.append('date_to', filters.date_to.toISOString());
    if (filters?.status_filters?.length) {
      params.append('status_filters', JSON.stringify(filters.status_filters));
    }

    const queryString = params.toString();
    const endpoint = queryString ? `/api/history?${queryString}` : '/api/history';

    const response = await fetchAPI<APIResponse<HistoryRecord[]> & { records?: HistoryRecord[] }>(endpoint);

    if (!response.success) {
      throw new APIError(400, response.error || '이력 조회 실패');
    }

    return (response as any).records || response.data || [];
  },

  /**
   * 3개월 경과 데이터 일괄 삭제
   */
  async deleteOldRecords(days: number = 90): Promise<number> {
    const response = await fetchAPI<APIResponse<{ deleted_count: number }>>(
      '/api/history/delete-old',
      {
        method: 'POST',
        body: JSON.stringify({ days }),
      }
    );

    if (!response.success) {
      throw new APIError(400, response.error || '삭제 실패');
    }

    return response.data?.deleted_count || 0;
  },

  /**
   * 선택 항목 삭제
   */
  async deleteRecords(recordIds: number[]): Promise<number> {
    const response = await fetchAPI<APIResponse<{ deleted_count: number }>>(
      '/api/history/delete-multiple',
      {
        method: 'POST',
        body: JSON.stringify({ record_ids: recordIds }),
      }
    );

    if (!response.success) {
      throw new APIError(400, response.error || '삭제 실패');
    }

    return response.data?.deleted_count || 0;
  },

  /**
   * 개별 이력 삭제
   */
  async deleteRecord(recordId: number): Promise<void> {
    const response = await fetchAPI<APIResponse<void>>(
      `/api/history/${recordId}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.success) {
      throw new APIError(400, response.error || '삭제 실패');
    }
  },

  /**
   * 업종매핑 수동 업데이트
   */
  async updateCategoryMapping(
    recordId: number,
    mctRyCd?: { code: string; name: string },
    hpsnMctZcd?: { code: string; name: string }
  ): Promise<HistoryRecord> {
    const response = await fetchAPI<APIResponse<HistoryRecord>>(
      '/api/update-mapping',
      {
        method: 'POST',
        body: JSON.stringify({
          record_id: recordId,
          mct_ry_cd: mctRyCd,
          hpsn_mct_zcd: hpsnMctZcd,
        }),
      }
    );

    if (!response.success) {
      throw new APIError(400, response.error || '업종매핑 업데이트 실패');
    }

    return response.data!;
  },
};

/**
 * 카테고리 API
 */
export const categoryAPI = {
  /**
   * 업종 카테고리 조회
   */
  async getCategories(): Promise<Categories> {
    const response = await fetchAPI<any>('/api/categories');

    if (!response.success) {
      throw new APIError(400, response.error || '카테고리 조회 실패');
    }

    return {
      mct_ry_cd: response.mct_ry_cd || response.data?.mct_ry_cd || {},
      hpsn_mct_zcd: response.hpsn_mct_zcd || response.data?.hpsn_mct_zcd || {},
    };
  },
};

/**
 * 에러 처리 유틸리티
 */
export const errorHandler = {
  /**
   * API 에러를 사용자 친화적인 메시지로 변환
   */
  formatErrorMessage(error: unknown): string {
    if (error instanceof APIError) {
      if (error.status === 0) {
        return error.message;
      }
      if (error.status >= 500) {
        return '서버에 일시적 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
      }
      if (error.status === 401) {
        return '인증이 필요합니다. 다시 로그인해주세요.';
      }
      if (error.status === 403) {
        return '접근 권한이 없습니다.';
      }
      if (error.status === 404) {
        return '요청한 리소스를 찾을 수 없습니다.';
      }
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return '알 수 없는 오류가 발생했습니다.';
  },

  /**
   * 네트워크 에러 판별
   */
  isNetworkError(error: unknown): boolean {
    return (
      error instanceof APIError && error.status === 0
    ) ||
    (error instanceof TypeError && error.message.includes('fetch'));
  },

  /**
   * 재시도 가능한 에러인지 판별
   */
  isRetryable(error: unknown): boolean {
    if (error instanceof APIError) {
      // 네트워크 에러, 5xx, 429(Too Many Requests) 는 재시도 가능
      return error.status === 0 || error.status >= 500 || error.status === 429;
    }
    return false;
  },
};
