'use client';

import React, { useState, useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Skeleton,
} from '@/components/ui/skeleton';
import {
  Trash2,
  Clock,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { historyAPI, categoryAPI, errorHandler } from '@/lib/api';
import { HistoryRecord, HistoryFilter, Categories } from '@/lib/types';

interface HistoryTableProps {
  filters?: HistoryFilter;
  refreshTrigger?: number;
}

/**
 * 조회 이력 테이블 컴포넌트
 * 이력 데이터 조회, 필터링, 수정, 삭제
 */
export default function HistoryTable({
  filters,
  refreshTrigger = 0,
}: HistoryTableProps) {
  const { toast } = useToast();

  // 데이터 상태
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [categories, setCategories] = useState<Categories | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI 상태
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingMctCode, setEditingMctCode] = useState<string>('');
  const [editingHpsnCode, setEditingHpsnCode] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingOld, setIsDeletingOld] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteOldConfirm, setShowDeleteOldConfirm] = useState(false);

  /**
   * 이력 데이터 및 카테고리 로드
   */
  useEffect(() => {
    const loadData = async () => {
      setIsLoadingData(true);
      setError(null);

      try {
        const [historyData, categoriesData] = await Promise.all([
          historyAPI.getHistory(filters),
          categoryAPI.getCategories(),
        ]);

        setRecords(historyData);
        setCategories(categoriesData);
      } catch (err) {
        const message = errorHandler.formatErrorMessage(err);
        setError(message);
        console.error('Data loading error:', err);
      } finally {
        setIsLoadingData(false);
      }
    };

    loadData();
  }, [filters, refreshTrigger]);

  /**
   * 행 선택 토글
   */
  const toggleRowSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((recordId) => recordId !== id)
        : [...prev, id]
    );
  };

  /**
   * 전체 선택/해제
   */
  const toggleAllSelect = () => {
    if (selectedIds.length === records.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.map((r) => r.id));
    }
  };

  /**
   * 선택 항목 삭제
   */
  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;

    setIsDeleting(true);
    setShowDeleteConfirm(false);

    try {
      const deletedCount = await historyAPI.deleteRecords(selectedIds);

      toast({
        title: '성공',
        description: `${deletedCount}건의 기록이 삭제되었습니다.`,
      });

      // UI 새로고침
      setRecords((prev) => prev.filter((r) => !selectedIds.includes(r.id)));
      setSelectedIds([]);
    } catch (err) {
      const message = errorHandler.formatErrorMessage(err);
      toast({
        title: '오류',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  /**
   * 3개월 경과 데이터 삭제
   */
  const handleDeleteOldRecords = async () => {
    setIsDeletingOld(true);
    setShowDeleteOldConfirm(false);

    try {
      const deletedCount = await historyAPI.deleteOldRecords(90);

      toast({
        title: '성공',
        description: `${deletedCount}건의 오래된 기록이 삭제되었습니다.`,
      });

      // UI 새로고침
      setRecords([]);
      setSelectedIds([]);
    } catch (err) {
      const message = errorHandler.formatErrorMessage(err);
      toast({
        title: '오류',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsDeletingOld(false);
    }
  };

  /**
   * 업종매핑 수동 편집 시작
   */
  const startEditMapping = (record: HistoryRecord) => {
    setEditingId(record.id);
    setEditingMctCode(record.mapping?.mct_ry_cd?.code || '');
    setEditingHpsnCode(record.mapping?.hpsn_mct_zcd?.code || '');
  };

  /**
   * 업종매핑 저장
   */
  const handleSaveMapping = async (recordId: number) => {
    try {
      const mctName = editingMctCode
        ? categories?.mct_ry_cd[editingMctCode]
        : undefined;
      const hpsnName = editingHpsnCode
        ? categories?.hpsn_mct_zcd[editingHpsnCode]
        : undefined;

      await historyAPI.updateCategoryMapping(
        recordId,
        editingMctCode
          ? { code: editingMctCode, name: mctName || '' }
          : undefined,
        editingHpsnCode
          ? { code: editingHpsnCode, name: hpsnName || '' }
          : undefined
      );

      // UI 업데이트
      setRecords((prev) =>
        prev.map((r) =>
          r.id === recordId
            ? {
                ...r,
                mapping: {
                  ...(editingMctCode && { mct_ry_cd: { code: editingMctCode, name: mctName || '' } }),
                  ...(editingHpsnCode && { hpsn_mct_zcd: { code: editingHpsnCode, name: hpsnName || '' } }),
                  reasoning: '[사용자 수기입력건]',
                },
              }
            : r
        )
      );

      setEditingId(null);
      toast({
        title: '성공',
        description: '업종매핑이 업데이트되었습니다.',
      });
    } catch (err) {
      const message = errorHandler.formatErrorMessage(err);
      toast({
        title: '오류',
        description: message,
        variant: 'destructive',
      });
    }
  };

  /**
   * 상태 배지 표시
   */
  const getStatusBadges = (record: HistoryRecord) => {
    const badges = [];

    if (record.api?.bizno?.found) {
      badges.push(
        <Badge key="bizno" variant="outline" className="bg-blue-50 text-xs">
          Bizno API
        </Badge>
      );
    }

    if (record.crawl?.found) {
      badges.push(
        <Badge key="crawl" variant="outline" className="bg-purple-50 text-xs">
          크롤링
        </Badge>
      );
    }

    if (record.api?.gov?.found) {
      badges.push(
        <Badge key="gov" variant="outline" className="bg-orange-50 text-xs">
          통신판매
        </Badge>
      );
    }

    if (record.ftc?.found) {
      badges.push(
        <Badge key="ftc" variant="outline" className="bg-green-50 text-xs">
          가맹사업
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

  // 로딩 상태
  if (isLoadingData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">조회 이력</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="w-8 h-8" />
                <Skeleton className="flex-1 h-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 에러 표시 */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 액션 바 */}
      <div className="flex items-center justify-between bg-muted p-3 rounded-lg flex-wrap gap-3">
        <span className="text-sm font-medium">
          {selectedIds.length > 0
            ? `${selectedIds.length}개 선택 (총 ${records.length}개)`
            : `총 ${records.length}개의 조회 이력`}
        </span>
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <Button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              variant="destructive"
              size="sm"
              className="gap-2"
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              선택 항목 삭제
            </Button>
          )}
          <Button
            onClick={() => setShowDeleteOldConfirm(true)}
            disabled={isDeletingOld || records.length === 0}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            {isDeletingOld && <Loader2 className="h-4 w-4 animate-spin" />}
            <Clock className="h-4 w-4" />
            3개월 경과 삭제
          </Button>
        </div>
      </div>

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedIds.length === records.length && records.length > 0}
                      onCheckedChange={toggleAllSelect}
                    />
                  </TableHead>
                  <TableHead>조회일시</TableHead>
                  <TableHead>사업자번호</TableHead>
                  <TableHead>상호명</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>업종매핑</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <p className="text-muted-foreground">조회 이력이 없습니다.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(record.id)}
                          onCheckedChange={() => toggleRowSelect(record.id)}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(record.query_date)}
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {record.brno_formatted}
                      </TableCell>
                      <TableCell className="font-medium max-w-xs truncate">
                        {record.company_name || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {getStatusBadges(record)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {editingId === record.id ? (
                          <div className="space-y-2">
                            <Select
                              value={editingMctCode}
                              onValueChange={setEditingMctCode}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="가맹점원장" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(
                                  categories?.mct_ry_cd || {}
                                ).map(([code, name]) => (
                                  <SelectItem key={code} value={code}>
                                    {code}: {name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={editingHpsnCode}
                              onValueChange={setEditingHpsnCode}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="초개인화" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(
                                  categories?.hpsn_mct_zcd || {}
                                ).map(([code, name]) => (
                                  <SelectItem key={code} value={code}>
                                    {code}: {name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex gap-1">
                              <Button
                                onClick={() =>
                                  handleSaveMapping(record.id)
                                }
                                size="xs"
                                className="h-6 text-xs"
                              >
                                저장
                              </Button>
                              <Button
                                onClick={() => setEditingId(null)}
                                variant="ghost"
                                size="xs"
                                className="h-6 text-xs"
                              >
                                취소
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm space-y-1">
                            {(record.mapping?.mct_ry_cd || record.mapping?.hpsn_mct_zcd) && (
                              <div className="flex items-center gap-1 mb-1">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted-foreground/30 text-white text-xs font-bold hover:bg-muted-foreground/60 transition-colors" title="매핑사유">
                                      ?
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-80 text-sm whitespace-pre-wrap" side="left">
                                    <p className="font-semibold mb-1 text-xs text-muted-foreground">매핑사유</p>
                                    <p>{record.mapping?.reasoning || '사유 없음'}</p>
                                  </PopoverContent>
                                </Popover>
                              </div>
                            )}
                            {record.mapping?.mct_ry_cd && (
                              <p className="text-xs">
                                <span className="text-muted-foreground">MCT:</span> {record.mapping.mct_ry_cd.code}
                              </p>
                            )}
                            {record.mapping?.hpsn_mct_zcd && (
                              <p className="text-xs">
                                <span className="text-muted-foreground">HPSN:</span> {record.mapping.hpsn_mct_zcd.code}
                              </p>
                            )}
                            {!record.mapping && (
                              <p className="text-xs text-muted-foreground">-</p>
                            )}
                            <Button
                              onClick={() => startEditMapping(record)}
                              variant="ghost"
                              size="xs"
                              className="h-6 text-xs mt-1"
                            >
                              편집
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          onClick={() => {
                            setSelectedIds([record.id]);
                            setShowDeleteConfirm(true);
                          }}
                          variant="ghost"
                          size="sm"
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기록 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.length}개의 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수
              없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 3개월 경과 데이터 삭제 확인 */}
      <AlertDialog open={showDeleteOldConfirm} onOpenChange={setShowDeleteOldConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>오래된 기록 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              3개월 이상 경과한 조회 기록을 모두 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOldRecords} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
