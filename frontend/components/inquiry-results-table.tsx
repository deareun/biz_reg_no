'use client';

import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Download } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { InquiryResult } from '@/lib/types';

interface InquiryResultsTableProps {
  results: InquiryResult[];
  onDownloadClick: (selectedResults: InquiryResult[]) => void;
}

/**
 * 조회 결과 테이블 컴포넌트
 * 조회 결과를 테이블 형식으로 표시
 */
export default function InquiryResultsTable({
  results,
  onDownloadClick,
}: InquiryResultsTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  if (!results || results.length === 0) {
    return null;
  }

  /**
   * 행 선택 토글
   */
  const toggleRowSelect = (brno: string) => {
    setSelectedIds((prev) =>
      prev.includes(brno)
        ? prev.filter((id) => id !== brno)
        : [...prev, brno]
    );
  };

  /**
   * 전체 선택/해제
   */
  const toggleAllSelect = () => {
    if (selectedIds.length === results.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(results.map((r) => r.brno));
    }
  };

  /**
   * 행 전개/축소
   */
  const toggleRowExpand = (brno: string) => {
    setExpandedIds((prev) =>
      prev.includes(brno)
        ? prev.filter((id) => id !== brno)
        : [...prev, brno]
    );
  };

  /**
   * 상태 배지 표시
   */
  const getStatusBadges = (result: InquiryResult) => {
    const badges = [];

    if (result.api?.bizno?.found) {
      badges.push(
        <Badge key="bizno" variant="outline" className="bg-blue-50">
          Bizno API
        </Badge>
      );
    }

    if (result.crawl?.found) {
      badges.push(
        <Badge key="crawl" variant="outline" className="bg-purple-50">
          크롤링
        </Badge>
      );
    }

    if (result.api?.gov?.found) {
      badges.push(
        <Badge key="gov" variant="outline" className="bg-orange-50">
          통신판매
        </Badge>
      );
    }

    if (result.ftc?.found) {
      badges.push(
        <Badge key="ftc" variant="outline" className="bg-green-50">
          가맹사업
        </Badge>
      );
    }

    if (result.mapping) {
      badges.push(
        <Badge key="mapping" className="bg-indigo-100">
          매핑됨
        </Badge>
      );
    }

    return badges.length > 0 ? badges : [<span key="none" className="text-xs text-muted-foreground">정보없음</span>];
  };

  /**
   * 날짜 포맷팅
   */
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const selectedResults = results.filter((r) => selectedIds.includes(r.brno));

  return (
    <div className="space-y-4">
      {/* 선택 요약 */}
      <div className="flex items-center justify-between bg-muted p-3 rounded-lg">
        <span className="text-sm font-medium">
          {selectedIds.length > 0
            ? `${selectedIds.length}개 선택 (총 ${results.length}개)`
            : `총 ${results.length}개의 조회 결과`}
        </span>
        {selectedIds.length > 0 && (
          <Button
            onClick={() => onDownloadClick(selectedResults)}
            size="sm"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            자료받기
          </Button>
        )}
      </div>

      {/* 결과 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">조회 결과 목록</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedIds.length === results.length && results.length > 0}
                      onCheckedChange={toggleAllSelect}
                    />
                  </TableHead>
                  <TableHead>사업자번호</TableHead>
                  <TableHead>상호명</TableHead>
                  <TableHead>조회일시</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">상세</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result) => (
                  <React.Fragment key={result.brno}>
                    <TableRow className={expandedIds.includes(result.brno) ? 'bg-muted/50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(result.brno)}
                          onCheckedChange={() => toggleRowSelect(result.brno)}
                        />
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {result.brno_formatted}
                      </TableCell>
                      <TableCell className="font-medium">
                        {result.company_name || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(result.query_date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {getStatusBadges(result)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          onClick={() => toggleRowExpand(result.brno)}
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              expandedIds.includes(result.brno) ? 'rotate-180' : ''
                            }`}
                          />
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* 상세 정보 */}
                    {expandedIds.includes(result.brno) && (
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={6} className="p-4">
                          <div className="space-y-4">
                            {/* Bizno API 결과 */}
                            {result.api?.bizno?.found && result.api.bizno.items?.[0] && (
                              <div className="space-y-2">
                                <h4 className="font-semibold text-sm">Bizno API</h4>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  {Object.entries(result.api.bizno.items[0]).map(([key, value]) => (
                                    <div key={key}>
                                      <span className="text-muted-foreground">{key}:</span>
                                      <span className="ml-2 font-medium">{String(value || '-')}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 크롤링 결과 */}
                            {result.crawl?.found && (
                              <div className="space-y-2">
                                <h4 className="font-semibold text-sm">크롤링 정보</h4>
                                {result.crawl.search && (
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    {Object.entries(result.crawl.search).map(([key, value]) => (
                                      <div key={key}>
                                        <span className="text-muted-foreground">{key}:</span>
                                        <span className="ml-2 font-medium">{String(value || '-')}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 카테고리 매핑 */}
                            {result.mapping && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold text-sm">업종매핑 결과</h4>
                                  {(result.mapping.mct_ry_cd || result.mapping.hpsn_mct_zcd) && (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted-foreground/30 text-white text-xs font-bold hover:bg-muted-foreground/60 transition-colors" title="매핑사유">
                                          ?
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-80 text-sm whitespace-pre-wrap" side="top">
                                        <p className="font-semibold mb-1 text-xs text-muted-foreground">매핑사유</p>
                                        <p>{result.mapping.reasoning || '사유 없음'}</p>
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </div>
                                <div className="text-sm bg-indigo-50 p-3 rounded border border-indigo-200">
                                  {result.mapping.mct_ry_cd && (
                                    <p>
                                      <span className="text-muted-foreground">가맹점업종기준:</span>
                                      <span className="ml-2 font-medium">
                                        {result.mapping.mct_ry_cd.code} - {result.mapping.mct_ry_cd.name}
                                      </span>
                                    </p>
                                  )}
                                  {result.mapping.hpsn_mct_zcd && (
                                    <p>
                                      <span className="text-muted-foreground">초개인화업종기준:</span>
                                      <span className="ml-2 font-medium">
                                        {result.mapping.hpsn_mct_zcd.code} - {result.mapping.hpsn_mct_zcd.name}
                                      </span>
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* 통신판매 정보 */}
                            {result.api?.gov?.found && result.api.gov.items?.[0] && (
                              <div className="space-y-2">
                                <h4 className="font-semibold text-sm">통신판매 정보</h4>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  {Object.entries(result.api.gov.items[0])
                                    .slice(0, 8) // 처음 8개만 표시
                                    .map(([key, value]) => (
                                      <div key={key}>
                                        <span className="text-muted-foreground">{key}:</span>
                                        <span className="ml-2 font-medium">{String(value || '-')}</span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
