'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-4xl font-bold">사업자번호 조회 시스템</h1>
        <p className="mb-8 text-gray-600">사업자번호를 조회하고 업종을 매핑합니다.</p>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Link
            href="/inquiry"
            className="block rounded-lg border border-gray-200 bg-white p-6 shadow hover:shadow-lg"
          >
            <h2 className="mb-2 text-2xl font-semibold">🔍 조회하기</h2>
            <p className="text-gray-600">사업자번호로 정보를 조회합니다.</p>
          </Link>

          <Link
            href="/history"
            className="block rounded-lg border border-gray-200 bg-white p-6 shadow hover:shadow-lg"
          >
            <h2 className="mb-2 text-2xl font-semibold">📋 조회이력</h2>
            <p className="text-gray-600">과거 조회 이력을 확인합니다.</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
