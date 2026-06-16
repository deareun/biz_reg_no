'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Download, Mail, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { inquiryAPI, errorHandler } from '@/lib/api';
import { InquiryResult } from '@/lib/types';

interface DataDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: InquiryResult[];
}

/**
 * 자료받기 모달 컴포넌트
 * CSV 다운로드 및 메일 발송 기능 제공
 */
export default function DataDownloadModal({
  isOpen,
  onClose,
  data,
}: DataDownloadModalProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CSV 필드 선택
  const [selectedBiznoFields, setSelectedBiznoFields] = useState<string[]>(['상호명', '사업자상태']);
  const [selectedCrawlFields, setSelectedCrawlFields] = useState<string[]>(['대표자명', '주소']);
  const [selectedTeleFields, setSelectedTeleFields] = useState<string[]>(['판매물품']);
  const [selectedMappingFields, setSelectedMappingFields] = useState<string[]>(['mct_ry_cd', 'hpsn_mct_zcd']);

  // 사용 가능한 필드 목록
  const biznoFields = [
    { id: '상호명', label: '상호명' },
    { id: '사업자상태', label: '사업자상태' },
    { id: '사업자상태코드', label: '사업자상태코드' },
    { id: '과세유형', label: '과세유형' },
    { id: '폐업일', label: '폐업일' },
  ];

  const crawlFields = [
    { id: '대표자명', label: '대표자명' },
    { id: '주소', label: '주소' },
    { id: '업태', label: '업태' },
    { id: '종목', label: '종목' },
  ];

  const teleFields = [
    { id: '판매물품', label: '판매물품' },
    { id: '판매방식', label: '판매방식' },
    { id: '도메인', label: '도메인' },
  ];

  const mappingFields = [
    { id: 'mct_ry_cd', label: '가맹점원장 코드' },
    { id: 'mct_ry_nm', label: '가맹점원장 명' },
    { id: 'hpsn_mct_zcd', label: '초개인화 코드' },
    { id: 'hpsn_mct_nm', label: '초개인화 명' },
  ];

  /**
   * 이메일 유효성 검사
   */
  const validateEmail = (emailToValidate: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailToValidate);
  };

  /**
   * CSV 다운로드
   */
  const handleDownloadCSV = async () => {
    setError(null);
    setIsLoading(true);

    try {
      await inquiryAPI.downloadCSV(
        data,
        selectedBiznoFields,
        selectedTeleFields,
        selectedCrawlFields,
        selectedMappingFields
      );

      toast({
        title: '성공',
        description: 'CSV 파일이 다운로드되었습니다.',
      });

      onClose();
    } catch (err) {
      const message = errorHandler.formatErrorMessage(err);
      setError(message);
      toast({
        title: '오류',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 메일 발송
   */
  const handleSendEmail = async () => {
    setError(null);

    // 이메일 유효성 검사
    if (!email.trim()) {
      setError('이메일 주소를 입력해주세요.');
      return;
    }

    if (!validateEmail(email)) {
      setError('유효한 이메일 주소를 입력해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      const message = await inquiryAPI.sendEmail(
        data,
        email,
        selectedBiznoFields,
        selectedTeleFields,
        selectedCrawlFields,
        selectedMappingFields
      );

      toast({
        title: '성공',
        description: message,
      });

      setEmail('');
      onClose();
    } catch (err) {
      const message = errorHandler.formatErrorMessage(err);
      setError(message);
      toast({
        title: '오류',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 필드 선택 토글
   */
  const toggleField = (
    fieldId: string,
    selectedFields: string[],
    setSelectedFields: (fields: string[]) => void
  ) => {
    setSelectedFields(
      selectedFields.includes(fieldId)
        ? selectedFields.filter((id) => id !== fieldId)
        : [...selectedFields, fieldId]
    );
  };

  /**
   * 필드 선택 렌더링
   */
  const renderFieldCheckboxes = (
    fields: Array<{ id: string; label: string }>,
    selectedFields: string[],
    setSelectedFields: (fields: string[]) => void
  ) => {
    return (
      <div className="space-y-3">
        {fields.map((field) => (
          <div key={field.id} className="flex items-center space-x-2">
            <Checkbox
              id={field.id}
              checked={selectedFields.includes(field.id)}
              onCheckedChange={() =>
                toggleField(field.id, selectedFields, setSelectedFields)
              }
            />
            <Label
              htmlFor={field.id}
              className="text-sm font-normal cursor-pointer"
            >
              {field.label}
            </Label>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>자료받기</DialogTitle>
          <DialogDescription>
            조회 결과를 CSV로 다운로드하거나 이메일로 받을 수 있습니다.
            ({data.length}개 항목)
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="download" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="download" className="gap-2">
              <Download className="h-4 w-4" />
              CSV 다운로드
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" />
              메일 발송
            </TabsTrigger>
          </TabsList>

          {/* CSV 다운로드 탭 */}
          <TabsContent value="download" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-sm mb-3">Bizno API 정보</h4>
                {renderFieldCheckboxes(
                  biznoFields,
                  selectedBiznoFields,
                  setSelectedBiznoFields
                )}
              </div>

              <div>
                <h4 className="font-medium text-sm mb-3">크롤링 정보</h4>
                {renderFieldCheckboxes(
                  crawlFields,
                  selectedCrawlFields,
                  setSelectedCrawlFields
                )}
              </div>

              <div>
                <h4 className="font-medium text-sm mb-3">통신판매업 정보</h4>
                {renderFieldCheckboxes(
                  teleFields,
                  selectedTeleFields,
                  setSelectedTeleFields
                )}
              </div>

              <div>
                <h4 className="font-medium text-sm mb-3">업종매핑 정보</h4>
                {renderFieldCheckboxes(
                  mappingFields,
                  selectedMappingFields,
                  setSelectedMappingFields
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={handleDownloadCSV}
                disabled={isLoading}
                className="gap-2"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {isLoading ? '다운로드 중...' : 'CSV 다운로드'}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* 메일 발송 탭 */}
          <TabsContent value="email" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-sm mb-3">Bizno API 정보</h4>
                {renderFieldCheckboxes(
                  biznoFields,
                  selectedBiznoFields,
                  setSelectedBiznoFields
                )}
              </div>

              <div>
                <h4 className="font-medium text-sm mb-3">크롤링 정보</h4>
                {renderFieldCheckboxes(
                  crawlFields,
                  selectedCrawlFields,
                  setSelectedCrawlFields
                )}
              </div>

              <div>
                <h4 className="font-medium text-sm mb-3">통신판매업 정보</h4>
                {renderFieldCheckboxes(
                  teleFields,
                  selectedTeleFields,
                  setSelectedTeleFields
                )}
              </div>

              <div>
                <h4 className="font-medium text-sm mb-3">업종매핑 정보</h4>
                {renderFieldCheckboxes(
                  mappingFields,
                  selectedMappingFields,
                  setSelectedMappingFields
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">이메일 주소</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={handleSendEmail}
                disabled={isLoading || !email.trim()}
                className="gap-2"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {isLoading ? '발송 중...' : '메일 발송'}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
