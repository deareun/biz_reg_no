'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { inquiryAPI, errorHandler } from '@/lib/api';
import { InquiryResult } from '@/lib/types';

interface InquiryFormProps {
  onResultsReceived: (results: InquiryResult[]) => void;
  onDataDownloadClick: (results: InquiryResult[]) => void;
}

/**
 * 조회하기 폼 컴포넌트
 * 사용자 입력 수집, 유효성 검사, API 호출
 */
export default function InquiryForm({
  onResultsReceived,
  onDataDownloadClick,
}: InquiryFormProps) {
  const [businessNumbersInput, setBusinessNumbersInput] = useState('');
  const [performCategoryMapping, setPerformCategoryMapping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<InquiryResult[]>([]);

  /**
   * 사업자번호 입력 파싱
   * 쉼표, 엔터, 세미콜론으로 구분된 입력을 처리
   */
  const parseBusinessNumbers = (input: string): string => {
    const lines = input.split(/[\n,;]+/);
    return lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
  };

  /**
   * 사업자번호 유효성 검사
   */
  const validateBusinessNumbers = (input: string): { valid: boolean; message: string } => {
    if (!input.trim()) {
      return { valid: false, message: '사업자번호를 입력해주세요.' };
    }

    const numbers = input.split(/[\n,;]+/).filter((n) => n.trim());

    if (numbers.length === 0) {
      return { valid: false, message: '유효한 사업자번호가 없습니다.' };
    }

    if (numbers.length > 100) {
      return { valid: false, message: '한 번에 최대 100개까지 조회할 수 있습니다.' };
    }

    // 각 사업자번호 형식 검증
    const invalidNumbers = numbers.filter((num) => {
      const digits = num.replace(/\D/g, '');
      return digits.length !== 10 || isNaN(Number(digits));
    });

    if (invalidNumbers.length > 0) {
      return {
        valid: false,
        message: `유효하지 않은 사업자번호: ${invalidNumbers.slice(0, 3).join(', ')}${invalidNumbers.length > 3 ? '...' : ''}`,
      };
    }

    return { valid: true, message: '' };
  };

  /**
   * 조회 요청 처리
   */
  const handleLookup = async () => {
    setError(null);

    // 유효성 검사
    const validation = validateBusinessNumbers(businessNumbersInput);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setIsLoading(true);

    try {
      const results = await inquiryAPI.lookup({
        business_numbers: businessNumbersInput,
        perform_category_mapping: performCategoryMapping,
      });

      setResults(results);
      onResultsReceived(results);
    } catch (err) {
      const message = errorHandler.formatErrorMessage(err);
      setError(message);
      console.error('Lookup error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 폼 리셋
   */
  const handleReset = () => {
    setBusinessNumbersInput('');
    setPerformCategoryMapping(false);
    setError(null);
    setResults([]);
  };

  /**
   * 텍스트 영역 입력 처리 (자동 형식화)
   */
  const handleTextAreaChange = (value: string) => {
    const parsed = parseBusinessNumbers(value);
    setBusinessNumbersInput(parsed);
  };

  return (
    <div className="w-full space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>사업자번호 조회</CardTitle>
          <CardDescription>
            조회할 사업자번호를 입력해주세요. (쉼표, 엔터로 구분 가능, 최대 100개)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 에러 알림 */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 사업자번호 입력 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">사업자번호 입력</label>
            <Textarea
              placeholder="예시: 1234567890
5678901234
9012345678"
              value={businessNumbersInput}
              onChange={(e) => handleTextAreaChange(e.target.value)}
              rows={8}
              disabled={isLoading}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              입력된 사업자번호: {businessNumbersInput.split(/[\n,;]+/).filter((n) => n.trim()).length}개
            </p>
          </div>

          {/* 업종매핑 옵션 */}
          <div className="flex items-center space-x-3">
            <Checkbox
              id="categoryMapping"
              checked={performCategoryMapping}
              onCheckedChange={(checked) =>
                setPerformCategoryMapping(checked as boolean)
              }
              disabled={isLoading}
            />
            <label
              htmlFor="categoryMapping"
              className="text-sm font-medium cursor-pointer flex items-center gap-2"
            >
              업종매핑 자동 분류
              <span className="text-xs text-muted-foreground">(AI 기반)</span>
            </label>
          </div>

          {/* 액션 버튼 */}
          <div className="flex gap-3">
            <Button
              onClick={handleLookup}
              disabled={isLoading || !businessNumbersInput.trim()}
              className="flex-1"
              size="lg"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? '조회 중...' : '조회하기'}
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              disabled={isLoading}
              size="lg"
            >
              초기화
            </Button>
          </div>

          {/* 결과 요약 */}
          {results.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm font-medium text-green-900">
                조회 완료: {results.length}개 사업자 정보 조회됨
              </p>
              <Button
                onClick={() => onDataDownloadClick(results)}
                variant="default"
                size="sm"
                className="mt-3"
              >
                자료받기
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
