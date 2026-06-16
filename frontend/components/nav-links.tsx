'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, ClipboardList } from 'lucide-react'

const sections = [
  {
    title: '사업자번호',
    items: [
      { href: '/inquiry', label: '조회하기', icon: Search },
      { href: '/history', label: '조회이력', icon: ClipboardList },
    ],
  },
]

export default function NavLinks() {
  const pathname = usePathname()
  return (
    <nav className="space-y-6">
      {sections.map(section => (
        <div key={section.title}>
          <p className="text-[11px] font-medium text-muted-foreground px-2 mb-1.5 tracking-wide">
            {section.title}
          </p>
          <div className="space-y-0.5">
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-gray-100 text-gray-800 font-semibold'
                      : 'text-muted-foreground hover:bg-gray-100/70 hover:text-gray-800 font-medium'
                  }`}
                >
                  <Icon
                    className={`h-[18px] w-[18px] flex-shrink-0 ${
                      active ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
