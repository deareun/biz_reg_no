'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { HistoryFilter, STATUS_FILTERS } from '@/lib/types';
import { Calendar as CalendarIcon, X } from 'lucide-react';

interface HistoryFilterProps {
  onFiltersChange: (filters: HistoryFilter) => void;
}

/**
 * 이력 필터 컴포넌트
 * 검색 및 필터링 옵션을 제공
 */
export default function HistoryFilterComponent({
  onFiltersChange,
}: HistoryFilterProps) {
  const [bizno, setBizno] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);

  /**
   * 필터 변경 시 부모에 알림
   */
  const notifyFiltersChange = useCallback(() => {
    onFiltersChange({
      bizno: bizno || undefined,
      company_name: companyName || undefined,
      date_from: dateFrom,
      date_to: dateTo,
      status_filters: statusFilters.length > 0 ? statusFilters : undefined,
    });
  }, [bizno, companyName, dateFrom, dateTo, statusFilters, onFiltersChange]);

  /**
   * 사업자번호 입력 변경
   */
  const handleBiznoChange = (value: string) => {
    setBizno(value);
  };

  /**
   * 상호명 입력 변경
   */
  const handleCompanyNameChange = (value: string) => {
    setCompanyName(value);
  };

  /**
   * 상태 필터 선택
   */
  const toggleStatusFilter = (statusId: string) => {
    setStatusFilters((prev) =>
      prev.includes(statusId)
        ? prev.filter((id) => id !== statusId)
        : [...prev, statusId]
    );
  };

  /**
   * 필터 초기화
   */
  const handleReset = () => {
    setBizno('');
    setCompanyName('');
    setDateFrom(null);
    setDateTo(null);
    setStatusFilters([]);
    onFiltersChange({});
  };

  /**
   * 필터 적용
   */
  const handleApply = () => {
    notifyFiltersChange();
  };

  /**
   * 날짜 포맷팅
   */
  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">검색 및 필터</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 검색 필드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bizno">사업자번호</Label>
            <Input
              id="bizno"
              placeholder="예: 1234567890"
              value={bizno}
              onChange={(e) => handleBiznoChange(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyName">상호명</Label>
            <Input
              id="companyName"
              placeholder="검색할 상호명"
              value={companyName}
              onChange={(e) => handleCompanyNameChange(e.target.value)}
            />
          </div>
        </div>

        {/* 날짜 범위 */}
        <div className="space-y-2">
          <Label>조회 기간</Label>
          <div className="flex gap-2 items-center flex-wrap">
            {/* 시작 날짜 */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2 font-normal w-full md:w-auto"
                >
                  <CalendarIcon className="h-4 w-4" />
                  {dateFrom ? formatDate(dateFrom) : '시작일'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom || undefined}
                  onSelect={(date) => setDateFrom(date || null)}
                  disabled={(date) =>
                    dateTo ? date > dateTo : false
                  }
                />
              </PopoverContent>
            </Popover>

            {/* 구분선 */}
            <span className="text-muted-foreground">~</span>

            {/* 종료 날짜 */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2 font-normal w-full md:w-auto"
                >
                  <CalendarIcon className="h-4 w-4" />
                  {dateTo ? formatDate(dateTo) : '종료일'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo || undefined}
                  onSelect={(date) => setDateTo(date || null)}
                  disabled={(date) =>
                    dateFrom ? date < dateFrom : false
                  }
                />
              </PopoverContent>
            </Popover>

            {/* 날짜 초기화 */}
            {(dateFrom || dateTo) && (
              <Button
                onClick={() => {
                  setDateFrom(null);
                  setDateTo(null);
                }}
                variant="ghost"
                size="sm"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* 상태 필터 */}
        <div className="space-y-3">
          <Label>조회 유형</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STATUS_FILTERS.map((status) => (
              <div key={status.id} className="flex items-center space-x-2">
                <Checkbox
                  id={status.id}
                  checked={statusFilters.includes(status.id)}
                  onCheckedChange={() => toggleStatusFilter(status.id)}
                />
                <Label
                  htmlFor={status.id}
                  className="text-sm font-normal cursor-pointer"
                >
                  {status.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleApply}
            className="flex-1"
          >
            검색
          </Button>
          <Button
            onClick={handleReset}
            variant="outline"
            className="flex-1"
          >
            초기화
          </Button>
        </div>

        {/* 필터 상태 표시 */}
        {(bizno || companyName || dateFrom || dateTo || statusFilters.length > 0) && (
          <div className="bg-muted p-3 rounded text-xs text-muted-foreground">
            <p>
              활성 필터:
              {bizno && ` 사업자번호(${bizno})`}
              {companyName && ` 상호명(${companyName})`}
              {dateFrom && ` 시작일(${formatDate(dateFrom)})`}
              {dateTo && ` 종료일(${formatDate(dateTo)})`}
              {statusFilters.length > 0 && ` 유형(${statusFilters.join(', ')})`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
