import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import NavLinks from '@/components/nav-links';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '사업자번호 일괄 조회',
  description: '사업자번호를 조회하여 사업자 정보를 확인하세요.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <div className="flex h-screen bg-gray-50">
          {/* 사이드바 */}
          <aside className="w-56 bg-white border-r border-gray-100 flex flex-col py-6 gap-6 shadow-sm">
            {/* 로고 */}
            <div className="px-5">
              <h1 className="text-base font-bold text-primary leading-tight">사업자조회</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">Business Lookup System</p>
            </div>

            {/* 구분선 */}
            <div className="border-t border-gray-100" />

            {/* 네비게이션 */}
            <div className="px-3 flex-1">
              <NavLinks />
            </div>

            {/* 하단 정보 */}
            <div className="px-5 pt-4 border-t border-gray-100 text-[11px] text-muted-foreground space-y-0.5">
              <p>© 2024 Business Lookup</p>
              <p>v1.0.0</p>
            </div>
          </aside>

          {/* 메인 콘텐츠 */}
          <main className="flex-1 overflow-auto bg-gray-50">
            <div className="p-8 max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>

        {/* 토스트 알림 */}
        <Toaster />
      </body>
    </html>
  );
}
