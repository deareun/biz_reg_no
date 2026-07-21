'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Pencil, ArrowUp, Download, HelpCircle } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

/* ---------- 통신판매업 필드 한글 매핑 ---------- */
const TELECOM_FIELD_MAPPING: Record<string, string> = {
  bzmnNm: '사업자명', bzmnRgsSttusSeNm: '등록상태', lctnAddr: '지번주소',
  lctnRnAddr: '도로명주소', dclrDate: '신고일자', telno: '전화번호',
  domncn: '도메인', ntslMthdCn: '판매방식', ntslPrdlstCn: '판매물품',
  operSttusCdNm: '운영상태', corpYnNm: '법인여부', crno: '법인등록번호',
  ctpvNm: '시도명', rprsvEmladr: '대표이메일', prcsDeptNm: '처리부서명',
  prmmiYr: '허가개시년도', lctnRnOzip: '우편번호',
}
const BIZNO_FIELDS = [
  { value: '상호명', label: '상호명' }, { value: '사업자등록번호', label: '사업자등록번호' },
  { value: '사업자상태', label: '사업자상태' }, { value: '사업장명', label: '사업장명' },
  { value: '대표자명', label: '대표자명' }, { value: '사업장주소', label: '사업장주소' },
]
const CRAWL_FIELDS = [
  { value: '상호명', label: '상호명' }, { value: '주소', label: '주소' },
  { value: '사업자상태', label: '사업자상태' }, { value: '업태', label: '업태' },
  { value: '종목', label: '종목' }, { value: '국세청산업분류_대분류', label: '산업분류(대)' },
  { value: '국세청산업분류_중분류', label: '산업분류(중)' }, { value: '국세청산업분류_소분류', label: '산업분류(소)' },
  { value: '국세청산업분류_세분류', label: '산업분류(세)' }, { value: '국세청산업분류_세세분류', label: '산업분류(세세)' },
]
const TELE_FIELDS = [
  { value: 'bzmnNm', label: '사업자명' }, { value: 'bzmnRgsSttusSeNm', label: '등록상태' },
  { value: 'lctnAddr', label: '지번주소' }, { value: 'lctnRnAddr', label: '도로명주소' },
  { value: 'dclrDate', label: '신고일자' }, { value: 'telno', label: '전화번호' },
  { value: 'domncn', label: '도메인' }, { value: 'ntslMthdCn', label: '판매방식' },
  { value: 'ntslPrdlstCn', label: '판매물품' }, { value: 'operSttusCdNm', label: '운영상태' },
  { value: 'corpYnNm', label: '법인여부' }, { value: 'crno', label: '법인등록번호' },
  { value: 'ctpvNm', label: '시도명' }, { value: 'rprsvEmladr', label: '대표이메일' },
  { value: 'prcsDeptNm', label: '처리부서명' }, { value: 'prmmiYr', label: '허가개시년도' },
  { value: 'lctnRnOzip', label: '우편번호' },
]
const MAPPING_FIELDS = [
  { value: 'mct_ry_cd', label: '가맹점업종코드' }, { value: 'mct_ry_nm', label: '가맹점업종명' },
  { value: 'hpsn_mct_zcd', label: '초개인화업종코드' }, { value: 'hpsn_mct_nm', label: '초개인화업종명' },
]

/* ---------- 필터 파라미터 타입 ---------- */
interface FilterParams {
  brno: string; company: string; dateFrom: string; dateTo: string
  biznoSt: string[]; crawlSt: string[]; govSt: string[]; ftcSt: string[]
}

/* ---------- 순수 필터 함수 (컴포넌트 외부) ---------- */
function getStatusStr(success?: boolean, found?: boolean) {
  if (success === false) return '오류'
  if (success && found) return '조회됨'
  if (success && !found) return '없음'
  return ''
}

function filterRecords(records: any[], f: FilterParams): any[] {
  const brnoQ = f.brno.replace(/\D/g, '')
  const companyQ = f.company.toLowerCase().trim()
  return records.filter(r => {
    if (brnoQ && !(r.brno || '').includes(brnoQ) && !(r.brno_formatted || '').replace(/\D/g, '').includes(brnoQ)) return false
    if (companyQ && !(r.company_name || '').toLowerCase().includes(companyQ)) return false
    if (f.dateFrom || f.dateTo) {
      const d = new Date(r.query_date)
      if (f.dateFrom && d < new Date(f.dateFrom)) return false
      if (f.dateTo) { const to = new Date(f.dateTo); to.setHours(23, 59, 59, 999); if (d > to) return false }
    }
    if (f.biznoSt.length > 0 && !f.biznoSt.includes(getStatusStr(r.api?.bizno?.success, r.api?.bizno?.found))) return false
    if (f.crawlSt.length > 0 && !f.crawlSt.includes(getStatusStr(r.crawl?.success, r.crawl?.found))) return false
    if (f.govSt.length > 0 && !f.govSt.includes(getStatusStr(r.api?.gov?.success, r.api?.gov?.found))) return false
    if (f.ftcSt.length > 0 && !f.ftcSt.includes(getStatusStr(r.ftc?.success, r.ftc?.found))) return false
    return true
  })
}

function getStatusNumeric(success?: boolean, found?: boolean) {
  if (success === false) return 0
  if (success && found) return 2
  if (success && !found) return 1
  return -1
}

/* ---------- 헬퍼 ---------- */
function formatDate(iso: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

/* ---------- UI 컴포넌트들 ---------- */
function StatusDot({ success, found }: { success?: boolean; found?: boolean }) {
  if (success === false) return <span style={{ color: '#999' }}>● 오류</span>
  if (success && found) return <span style={{ color: '#10b981' }}>● 조회됨</span>
  if (success && !found) return <span style={{ color: '#999' }}>○ 없음</span>
  return <span style={{ color: '#ccc' }}>-</span>
}

function KVTable({ data }: { data: Record<string, any> }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
      <tbody>
        {Object.entries(data).map(([k, v]) => (
          <tr key={k}>
            <th style={{ width: '35%', color: '#8b8b94', fontWeight: 500, background: '#f5f5f4', padding: '3px 6px', borderBottom: '1px solid #ebe9f1', textAlign: 'left', fontSize: '0.75rem' }}>{k}</th>
            <td style={{ padding: '3px 6px', borderBottom: '1px solid #ebe9f1', wordBreak: 'break-word' }}>
              {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SourceBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ebe9f1', borderRadius: 8, padding: 10, height: '100%' }}>
      <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: 6, color: 'oklch(0.457 0.24 277.023)' }}>{title}</div>
      {children}
    </div>
  )
}

function DetailContent({ record }: { record: any }) {
  const brno = record.brno || ''
  const api = record.api || {}
  const crawl = record.crawl
  const ftc = record.ftc

  const biznoBlock = () => {
    const src = api.bizno
    if (!src) return <p style={{ color: '#8b8b94', textAlign: 'center' }}>조회 안 됨</p>
    if (!src.success) return <p style={{ color: '#dc2626' }}>{src.error || '조회 실패'}</p>
    if (!src.found) return <p style={{ color: '#8b8b94', textAlign: 'center' }}>검색 결과 없음</p>
    const matched = (src.items || []).filter((item: any) =>
      (item['사업자등록번호'] || item.bizno || '').replace(/\D/g, '') === brno
    )
    if (matched.length === 0) return <p style={{ color: '#8b8b94', textAlign: 'center' }}>조회값 없음</p>
    return <>{matched.map((item: any, i: number) => <KVTable key={i} data={item} />)}</>
  }

  const govBlock = () => {
    const src = api.gov
    if (!src) return <p style={{ color: '#8b8b94', textAlign: 'center' }}>조회 안 됨</p>
    if (!src.success) return <p style={{ color: '#dc2626' }}>{src.error || '조회 실패'}</p>
    if (!src.found) return <p style={{ color: '#8b8b94', textAlign: 'center' }}>검색 결과 없음</p>
    const items = (src.items || []).map((item: any) => {
      const m: Record<string, any> = {}
      Object.entries(item).forEach(([k, v]) => { m[TELECOM_FIELD_MAPPING[k] || k] = v })
      return m
    })
    return <>{items.map((item: any, i: number) => <KVTable key={i} data={item} />)}</>
  }

  const crawlBlock = () => {
    if (!crawl) return <p style={{ color: '#8b8b94', textAlign: 'center' }}>조회 안 됨</p>
    if (!crawl.success) return <p style={{ color: '#dc2626' }}>{crawl.error || '조회 실패'}</p>
    if (!crawl.found) return <p style={{ color: '#8b8b94', textAlign: 'center' }}>검색 결과 없음</p>
    if (crawl.search) {
      const cb = (crawl.search['사업자번호'] || crawl.search.bizno || '').replace(/\D/g, '')
      if (cb && cb !== brno) return <p style={{ color: '#8b8b94', textAlign: 'center' }}>조회값 없음</p>
    }
    const search = crawl.search || {}
    const detail = crawl.detail || {}
    const detailRows: Record<string, any> = {}
    const catOrder = ['대분류', '중분류', '소분류', '세분류', '세세분류']
    const cat = detail['국세청산업분류']
    if (cat && typeof cat === 'object') {
      catOrder.forEach(c => { if (cat[c]) detailRows[`국세청산업분류 - ${c}`] = cat[c] })
    }
    Object.entries(detail).forEach(([k, v]) => { if (k !== '국세청산업분류') detailRows[k] = v })
    return (
      <>
        {Object.keys(search).length > 0 && <><div style={{ fontSize: '0.75rem', color: '#8b8b94', fontWeight: 600, marginBottom: 4 }}>검색 결과</div><KVTable data={search} /></>}
        {Object.keys(detailRows).length > 0 && <><div style={{ fontSize: '0.75rem', color: '#8b8b94', fontWeight: 600, margin: '8px 0 4px' }}>상세 정보</div><KVTable data={detailRows} /></>}
      </>
    )
  }

  const ftcBlock = () => {
    if (!ftc) return <p style={{ color: '#8b8b94', textAlign: 'center' }}>조회 안 됨</p>
    if (!ftc.success) return <p style={{ color: '#dc2626' }}>{ftc.error || '조회 실패'}</p>
    if (!ftc.found) return <p style={{ color: '#8b8b94', textAlign: 'center' }}>검색 결과 없음</p>
    const 본부 = ftc['가맹본부'] || {}
    const 브랜드 = ftc['브랜드'] || []
    return (
      <>
        <KVTable data={{ 법인명: 본부['법인명'] || '-', 가맹본부관리번호: 본부['가맹본부관리번호'] || '-' }} />
        {브랜드.map((b: any, i: number) => (
          <div key={i} style={{ marginTop: 8, padding: 8, background: '#f5f5f4', borderRadius: 6 }}>
            <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#8b8b94', marginBottom: 6 }}>브랜드 ({i + 1}/{브랜드.length}개)</div>
            <KVTable data={{ 브랜드관리번호: b['브랜드관리번호'] || '-', 브랜드명: b['브랜드명'] || '-', 산업대분류: b['산업대분류'] || '-', 산업중분류: b['산업중분류'] || '-', 주요상품: b['주요상품'] || '-', 가맹개시일자: b['가맹개시일자'] || '-' }} />
          </div>
        ))}
      </>
    )
  }

  return (
    <div style={{ padding: 12, background: '#f5f5f4', borderTop: '1px solid #ebe9f1' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: 'auto 1fr', gap: 8, minHeight: 180 }}>
        <div style={{ gridColumn: 1, gridRow: 1 }}><SourceBlock title="Bizno API">{biznoBlock()}</SourceBlock></div>
        <div style={{ gridColumn: 2, gridRow: '1 / 3' }}><SourceBlock title="통신판매업">{govBlock()}</SourceBlock></div>
        <div style={{ gridColumn: 1, gridRow: 2 }}><SourceBlock title="Bizno 크롤링">{crawlBlock()}</SourceBlock></div>
        <div style={{ gridColumn: 3, gridRow: '1 / 3' }}><SourceBlock title="가맹사업정보">{ftcBlock()}</SourceBlock></div>
      </div>
    </div>
  )
}

function StatusDropdown({ statuses, onChange }: { statuses: string[]; onChange: (s: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const options = ['오류', '조회됨', '없음']

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const toggle = (v: string) => onChange(statuses.includes(v) ? statuses.filter(s => s !== v) : [...statuses, v])
  const label = statuses.length === 0 ? '모두' : `${statuses.length}개 선택`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: '#fff', color: '#1a1a24', border: '1px solid #ebe9f1', borderRadius: 6,
        padding: '8px 12px', fontSize: '0.875rem', height: 38, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', width: '100%',
      }}>
        <span>{label}</span><span style={{ fontSize: '0.65rem', opacity: 0.6, marginLeft: 'auto' }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, background: '#fff',
          border: '1px solid #ebe9f1', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 200, minWidth: 140, marginTop: 6,
        }}>
          {options.map(opt => (
            <label key={opt} onClick={e => e.stopPropagation()} style={{
              display: 'flex', alignItems: 'center', padding: '10px 16px',
              cursor: 'pointer', fontSize: '0.875rem',
              background: statuses.includes(opt) ? '#f5f3ff' : 'transparent',
            }}>
              <input type="checkbox" checked={statuses.includes(opt)} onChange={() => toggle(opt)} style={{ marginRight: 8 }} />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function MappingModal({ categories, mappingType, onSelect, onClose }: {
  categories: Record<string, string>; mappingType: string;
  onSelect: (code: string, name: string) => void; onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const title = mappingType === 'mct_ry_cd' ? '가맹점업종기준' : '초개인화업종기준'
  const entries = Object.entries(categories).filter(([code, name]) => {
    const q = search.toLowerCase()
    return !q || code.toLowerCase().includes(q) || name.toLowerCase().includes(q)
  })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, padding: 24, maxWidth: 500, width: '90%', maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px rgba(0,0,0,0.15)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '1.125rem', fontWeight: 700 }}>업종 선택 - {title}</h3>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="검색..." autoFocus
          style={{ padding: '8px 12px', border: '1px solid #ebe9f1', borderRadius: 6, fontSize: '0.875rem', marginBottom: 12 }} />
        <div style={{ overflowY: 'auto', maxHeight: 300, border: '1px solid #ebe9f1', borderRadius: 6, marginBottom: 12 }}>
          {entries.length === 0
            ? <div style={{ padding: '12px 16px', color: '#8b8b94' }}>검색 결과가 없습니다.</div>
            : entries.map(([code, name]) => (
              <div key={code}
                onClick={() => { if (window.confirm('해당 변경사항을 저장하겠습니까?')) onSelect(code, name) }}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.875rem', borderBottom: '1px solid #ebe9f1' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >{code} - {name}</div>
            ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#f5f5f4', color: '#1a1a24', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: '0.875rem', cursor: 'pointer' }}>취소</button>
        </div>
      </div>
    </div>
  )
}

function DataModal({ records, onClose }: { records: any[]; onClose: () => void }) {
  const [excludeErrors, setExcludeErrors] = useState(false)
  const [biznoSel, setBiznoSel] = useState<string[]>(BIZNO_FIELDS.map(f => f.value))
  const [crawlSel, setCrawlSel] = useState<string[]>(CRAWL_FIELDS.map(f => f.value))
  const [teleSel, setTeleSel] = useState<string[]>(TELE_FIELDS.map(f => f.value))
  const [mappingSel, setMappingSel] = useState<string[]>(MAPPING_FIELDS.map(f => f.value))
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem('dataPreferences') || 'null')
      if (!prefs) return
      if (prefs.bizno_fields) setBiznoSel(prefs.bizno_fields)
      if (prefs.crawl_fields) setCrawlSel(prefs.crawl_fields)
      if (prefs.tele_fields) setTeleSel(prefs.tele_fields)
      if (prefs.mapping_fields) setMappingSel(prefs.mapping_fields)
      if (prefs.exclude_errors !== undefined) setExcludeErrors(prefs.exclude_errors)
    } catch { /* ignore */ }
  }, [])

  const savePrefs = () => localStorage.setItem('dataPreferences', JSON.stringify({ bizno_fields: biznoSel, crawl_fields: crawlSel, tele_fields: teleSel, mapping_fields: mappingSel, exclude_errors: excludeErrors }))

  const getExportData = () => excludeErrors
    ? records.filter(r => r.api?.bizno?.success !== false || r.api?.gov?.success !== false || r.crawl?.success !== false)
    : records

  const handleCSV = async () => {
    const data = getExportData()
    if (!data.length) { alert('내보낼 데이터가 없습니다.'); return }
    if (!biznoSel.length && !crawlSel.length && !teleSel.length && !mappingSel.length) { alert('선택된 필드가 없습니다.'); return }
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/generate-csv`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, bizno_fields: biznoSel, tele_fields: teleSel, crawl_fields: crawlSel, mapping_fields: mappingSel }),
      })
      if (!resp.ok) { alert('CSV 생성 실패: ' + resp.statusText); return }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `business_lookup_${Date.now()}.csv`
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); document.body.removeChild(a)
      savePrefs(); alert('CSV 다운로드 완료')
    } catch (e: any) { alert('오류: ' + e.message) } finally { setLoading(false) }
  }

  const handleEmail = async () => {
    if (!email.trim()) { alert('메일 주소를 입력해주세요.'); return }
    const emails = email.split(';').map(e => e.trim()).filter(e => e.includes('@'))
    if (!emails.length) { alert('유효한 메일 주소가 없습니다.'); return }
    const data = getExportData()
    if (!data.length) { alert('발송할 데이터가 없습니다.'); return }
    if (!biznoSel.length && !crawlSel.length && !teleSel.length && !mappingSel.length) { alert('선택된 필드가 없습니다.'); return }
    setLoading(true)
    let ok = 0, fail = 0
    try {
      for (const em of emails) {
        const resp = await fetch(`${API_BASE}/api/send-email`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: em, data, bizno_fields: biznoSel, tele_fields: teleSel, crawl_fields: crawlSel, mapping_fields: mappingSel }),
        })
        ;(await resp.json()).success ? ok++ : fail++
      }
      savePrefs()
      alert(fail === 0 ? `메일 발송 완료 (${ok}명, ${data.length}건)` : `발송 결과: 성공 ${ok}명, 실패 ${fail}명`)
      if (!fail) onClose()
    } catch (e: any) { alert('오류: ' + e.message) } finally { setLoading(false) }
  }

  const toggleField = (arr: string[], val: string, set: (a: string[]) => void) =>
    set(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])

  const FieldGroup = ({ title, fields, sel, setSel }: { title: string; fields: { value: string; label: string }[]; sel: string[]; setSel: (a: string[]) => void }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 500, fontSize: '0.8rem' }}>{title}</span>
        <label style={{ fontSize: '0.75rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={sel.length === fields.length} onChange={e => setSel(e.target.checked ? fields.map(f => f.value) : [])} style={{ marginRight: 4 }} />전체 선택
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {fields.map(f => (
          <label key={f.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
            <input type="checkbox" checked={sel.includes(f.value)} onChange={() => toggleField(sel, f.value, setSel)} />{f.label}
          </label>
        ))}
      </div>
    </div>
  )

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    background: 'oklch(0.457 0.24 277.023)', color: '#f5f3ff', border: 'none',
    borderRadius: 6, padding: '8px 16px', fontSize: '0.875rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
  })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, padding: 24, maxWidth: 620, width: '90%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 25px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: '1.125rem', fontWeight: 700 }}>조회 결과 받기</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#8b8b94' }}>✕</button>
        </div>
        <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #ebe9f1' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
            <input type="checkbox" checked={excludeErrors} onChange={e => setExcludeErrors(e.target.checked)} />오류건 제외
          </label>
        </div>
        <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #ebe9f1' }}>
          <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', marginBottom: 12 }}>조회 데이터 선택</label>
          <FieldGroup title="Bizno API" fields={BIZNO_FIELDS} sel={biznoSel} setSel={setBiznoSel} />
          <FieldGroup title="Bizno 크롤링" fields={CRAWL_FIELDS} sel={crawlSel} setSel={setCrawlSel} />
          <FieldGroup title="통신판매업 API" fields={TELE_FIELDS} sel={teleSel} setSel={setTeleSel} />
        </div>
        <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #ebe9f1' }}>
          <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', marginBottom: 12 }}>업종매핑 결과</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {MAPPING_FIELDS.map(f => (
              <label key={f.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
                <input type="checkbox" checked={mappingSel.includes(f.value)} onChange={() => toggleField(mappingSel, f.value, setMappingSel)} />{f.label}
              </label>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', marginBottom: 8 }}>📧 메일 수신 주소</label>
          <input type="text" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="email@example.com; email2@example.com (세미콜론으로 구분)"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #ebe9f1', borderRadius: 6, fontSize: '0.875rem', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={handleCSV} disabled={loading} style={btnStyle(loading)}>📥 CSV 다운로드</button>
          <button onClick={handleEmail} disabled={loading} style={btnStyle(loading)}>📧 메일 발송</button>
          <button onClick={onClose} style={{ background: '#f5f5f4', color: '#1a1a24', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: '0.875rem', cursor: 'pointer' }}>닫기</button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   메인 페이지
   ============================================================ */
export default function HistoryPage() {
  const [allRecords, setAllRecords] = useState<any[]>([])
  const [displayRecords, setDisplayRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [sortCol, setSortCol] = useState<string | null>('query_date')
  const [sortAsc, setSortAsc] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 100
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  /* 필터 상태 */
  const [filterBrno, setFilterBrno] = useState('')
  const [filterCompany, setFilterCompany] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [biznoSt, setBiznoSt] = useState<string[]>([])
  const [crawlSt, setCrawlSt] = useState<string[]>([])
  const [govSt, setGovSt] = useState<string[]>([])
  const [ftcSt, setFtcSt] = useState<string[]>([])

  /* 현재 필터 파라미터 ref (항상 최신값) */
  const filterRef = useRef<FilterParams>({ brno: '', company: '', dateFrom: '', dateTo: '', biznoSt: [], crawlSt: [], govSt: [], ftcSt: [] })
  filterRef.current = { brno: filterBrno, company: filterCompany, dateFrom: filterDateFrom, dateTo: filterDateTo, biznoSt, crawlSt, govSt, ftcSt }

  /* 모달 */
  const [showDataModal, setShowDataModal] = useState(false)
  const [mappingModal, setMappingModal] = useState<{ recordId: number; type: string } | null>(null)
  const [categories, setCategories] = useState<{ mct_ry_cd: Record<string, string>; hpsn_mct_zcd: Record<string, string> }>({ mct_ry_cd: {}, hpsn_mct_zcd: {} })
  const categoriesLoaded = useRef(false)

  /* ---- 데이터 로드 ---- */
  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/history`)
      const data = await resp.json()
      if (!data.success) return
      const records: any[] = (data.records || []).sort(
        (a: any, b: any) => new Date(b.query_date).getTime() - new Date(a.query_date).getTime()
      )
      setAllRecords(records)
      setDisplayRecords(filterRecords(records, filterRef.current))
      setCurrentPage(1)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  /* ---- 카테고리 로드 ---- */
  const loadCategories = async () => {
    if (categoriesLoaded.current) return
    try {
      const resp = await fetch(`${API_BASE}/api/categories`)
      const data = await resp.json()
      if (data.success) { setCategories({ mct_ry_cd: data.mct_ry_cd || {}, hpsn_mct_zcd: data.hpsn_mct_zcd || {} }); categoriesLoaded.current = true }
    } catch (e) { console.error(e) }
  }

  /* ---- 필터 적용 ---- */
  const applyCurrentFilter = (records = allRecords) => setDisplayRecords(filterRecords(records, filterRef.current))

  const doFilter = () => { applyCurrentFilter(); setCurrentPage(1) }

  const doReset = () => {
    setFilterBrno(''); setFilterCompany(''); setFilterDateFrom(''); setFilterDateTo(''); setDateRange(undefined)
    setBiznoSt([]); setCrawlSt([]); setGovSt([]); setFtcSt([])
    setDisplayRecords(allRecords)
    setSelectedIds(new Set())
    setCurrentPage(1)
  }

  /* 상태 드롭다운: 변경 즉시 필터 재적용 */
  const handleBiznoSt = (s: string[]) => { setBiznoSt(s); setDisplayRecords(filterRecords(allRecords, { ...filterRef.current, biznoSt: s })) }
  const handleCrawlSt = (s: string[]) => { setCrawlSt(s); setDisplayRecords(filterRecords(allRecords, { ...filterRef.current, crawlSt: s })) }
  const handleGovSt = (s: string[]) => { setGovSt(s); setDisplayRecords(filterRecords(allRecords, { ...filterRef.current, govSt: s })) }
  const handleFtcSt = (s: string[]) => { setFtcSt(s); setDisplayRecords(filterRecords(allRecords, { ...filterRef.current, ftcSt: s })) }

  /* ---- 정렬 ---- */
  const doSort = (col: string) => {
    const asc = sortCol === col ? !sortAsc : true
    setSortCol(col); setSortAsc(asc)
    const sorted = [...allRecords].sort((a, b) => {
      let va: any, vb: any
      if (col === 'bizno_status') { va = getStatusNumeric(a.api?.bizno?.success, a.api?.bizno?.found); vb = getStatusNumeric(b.api?.bizno?.success, b.api?.bizno?.found) }
      else if (col === 'crawl_status') { va = getStatusNumeric(a.crawl?.success, a.crawl?.found); vb = getStatusNumeric(b.crawl?.success, b.crawl?.found) }
      else if (col === 'gov_status') { va = getStatusNumeric(a.api?.gov?.success, a.api?.gov?.found); vb = getStatusNumeric(b.api?.gov?.success, b.api?.gov?.found) }
      else if (col === 'ftc_status') { va = getStatusNumeric(a.ftc?.success, a.ftc?.found); vb = getStatusNumeric(b.ftc?.success, b.ftc?.found) }
      else if (col === 'mct_ry_cd_status') { va = a.mapping?.mct_ry_cd?.code ? 1 : 0; vb = b.mapping?.mct_ry_cd?.code ? 1 : 0 }
      else if (col === 'hpsn_mct_zcd_status') { va = a.mapping?.hpsn_mct_zcd?.code ? 1 : 0; vb = b.mapping?.hpsn_mct_zcd?.code ? 1 : 0 }
      else if (col === 'query_date') { va = new Date(a.query_date).getTime(); vb = new Date(b.query_date).getTime() }
      else if (col === 'brno_formatted') { va = parseInt((a.brno || '').replace(/\D/g, '')) || 0; vb = parseInt((b.brno || '').replace(/\D/g, '')) || 0 }
      else { va = String(a[col] || ''); vb = String(b[col] || ''); return asc ? va.localeCompare(vb, 'ko') : vb.localeCompare(va, 'ko') }
      return asc ? va - vb : vb - va
    })
    setAllRecords(sorted)
    setDisplayRecords(filterRecords(sorted, filterRef.current))
  }

  /* ---- 행 펼치기 ---- */
  const toggleRow = (id: number) => setExpandedRows(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  /* ---- 체크박스 ---- */
  const allSelected = displayRecords.length > 0 && displayRecords.every(r => selectedIds.has(r.id))
  const someSelected = displayRecords.some(r => selectedIds.has(r.id))
  const toggleSelectAll = () => allSelected ? setSelectedIds(new Set()) : setSelectedIds(new Set(displayRecords.map(r => r.id)))
  const toggleSelect = (id: number) => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  /* ---- 삭제 ---- */
  const deleteRecord = async (id: number) => {
    if (!window.confirm('이 기록을 삭제하시겠습니까?')) return
    try {
      const data = await (await fetch(`${API_BASE}/api/history/${id}`, { method: 'DELETE' })).json()
      if (data.success) loadHistory(); else alert('삭제 실패: ' + (data.error || '알 수 없는 오류'))
    } catch { alert('삭제 중 오류 발생') }
  }

  const deleteSelected = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    if (!window.confirm(`${ids.length}개 항목을 삭제하시겠습니까?`)) return
    try {
      const data = await (await fetch(`${API_BASE}/api/history/delete-multiple`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ record_ids: ids }),
      })).json()
      if (data.success) { alert(`${data.deleted_count}개 삭제되었습니다.`); setSelectedIds(new Set()); loadHistory() }
      else alert('삭제 실패: ' + (data.error || '알 수 없는 오류'))
    } catch { alert('삭제 중 오류 발생') }
  }

  const deleteOld = async () => {
    if (!window.confirm('3개월 이상 경과한 모든 기록을 삭제하시겠습니까?')) return
    try {
      const data = await (await fetch(`${API_BASE}/api/history/delete-old`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: 90 }),
      })).json()
      if (data.success) { alert(data.message); loadHistory() }
      else alert('삭제 실패: ' + (data.error || '알 수 없는 오류'))
    } catch { alert('삭제 중 오류 발생') }
  }

  /* ---- 매핑 저장 ---- */
  const saveMapping = async (recordId: number, type: string, code: string, name: string) => {
    try {
      const data = await (await fetch(`${API_BASE}/api/update-mapping`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: recordId, [type]: { code, name } }),
      })).json()
      if (data.success) {
        const update = (records: any[]) => records.map(r => r.id === recordId ? { ...r, mapping: { ...(r.mapping || {}), [type]: { code, name }, reasoning: '[사용자 수기입력건]' } } : r)
        setAllRecords(update); setDisplayRecords(update)
        setMappingModal(null)
      } else alert('매핑 저장 실패: ' + data.error)
    } catch { alert('매핑 저장 중 오류') }
  }

  const sortIcon = (col: string) => sortCol !== col
    ? <span style={{ opacity: 0.4, fontSize: '0.7rem' }}>↕</span>
    : <span style={{ color: 'oklch(0.457 0.24 277.023)', fontSize: '0.7rem' }}>{sortAsc ? '▲' : '▼'}</span>

  const thStyle: React.CSSProperties = { padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#8b8b94', fontSize: '0.8125rem', whiteSpace: 'nowrap' }
  const tdStyle: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #ebe9f1', height: 32, fontSize: '0.8125rem' }

  const columns = [
    { col: 'brno_formatted', label: '사업자번호' },
    { col: 'company_name', label: '상호명' },
    { col: 'query_date', label: '조회일자' },
    { col: 'bizno_status', label: 'Bizno API' },
    { col: 'crawl_status', label: 'Bizno 크롤링' },
    { col: 'gov_status', label: '통신판매업' },
    { col: 'ftc_status', label: '가맹사업' },
    { col: 'mct_ry_cd_status', label: '가맹점업종기준' },
    { col: 'hpsn_mct_zcd_status', label: '초개인화업종기준' },
  ]

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif', fontSize: '85%' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 700 }}>조회 이력</h1>
        <p style={{ margin: 0, color: '#8b8b94', fontSize: '0.875rem' }}>최근 3개월 이내 조회 기록</p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #ebe9f1', borderRadius: 10, padding: 16 }}>
        {/* 헤더 액션 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#8b8b94' }}>
            이력 목록 ({allRecords.length}건, {displayRecords.length}건 표시중)
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => { if (!allRecords.length) { alert('조회 결과가 없습니다.'); return } setShowDataModal(true) }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'oklch(0.457 0.24 277.023)', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500 }}>
              <Download style={{ width: 16, height: 16 }} />
              자료받기
            </button>
            <button onClick={deleteOld}
              style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: '0.875rem', cursor: 'pointer' }}>
              3개월 경과건 일괄 삭제
            </button>
            {selectedIds.size > 0 && (
              <button onClick={deleteSelected}
                style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: '0.875rem', cursor: 'pointer' }}>
                선택 항목 삭제 ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* 필터 */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', padding: 16, background: '#f5f5f4', borderRadius: 8, marginBottom: 16 }}>
          {[
            { label: '사업자번호', val: filterBrno, set: setFilterBrno, ph: '사업자번호' },
            { label: '상호명', val: filterCompany, set: setFilterCompany, ph: '상호명' },
          ].map(({ label, val, set, ph }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 140, flex: 1 }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{label}</label>
              <input value={val} onChange={e => set(e.target.value)} onKeyDown={e => e.key === 'Enter' && doFilter()} placeholder={ph}
                style={{ padding: '8px 10px', border: '1px solid #ebe9f1', borderRadius: 6, fontSize: '0.875rem', height: 38, background: '#fff' }} />
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>조회 기간</label>
            <Popover>
              <PopoverTrigger asChild>
                <button style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  border: '1px solid #ebe9f1', borderRadius: 6, fontSize: '0.875rem',
                  height: 38, background: '#fff', cursor: 'pointer', minWidth: 220, textAlign: 'left',
                }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b8b94" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span style={{ color: dateRange?.from ? '#1a1a24' : '#8b8b94', fontSize: '0.875rem' }}>
                    {dateRange?.from
                      ? `${dateRange.from.toLocaleDateString('ko-KR')}${dateRange.to ? ' ~ ' + dateRange.to.toLocaleDateString('ko-KR') : ''}`
                      : '기간 선택'}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={(range) => {
                    setDateRange(range)
                    const toStr = (d: Date) => d.toISOString().split('T')[0]
                    setFilterDateFrom(range?.from ? toStr(range.from) : '')
                    setFilterDateTo(range?.to ? toStr(range.to) : '')
                  }}
                  numberOfMonths={2}
                  disabled={(date) => date > new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>
          {[
            { label: 'Bizno API', st: biznoSt, h: handleBiznoSt },
            { label: 'Bizno 크롤링', st: crawlSt, h: handleCrawlSt },
            { label: '통신판매업', st: govSt, h: handleGovSt },
            { label: '가맹사업', st: ftcSt, h: handleFtcSt },
          ].map(({ label, st, h }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 120 }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{label}</label>
              <StatusDropdown statuses={st} onChange={h} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end' }}>
            <button onClick={doFilter} style={{ background: 'oklch(0.457 0.24 277.023)', color: '#f5f3ff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: '0.875rem', height: 38, cursor: 'pointer' }}>검색</button>
            <button onClick={doReset} style={{ background: '#e5e5e4', color: '#1a1a24', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: '0.875rem', height: 38, cursor: 'pointer' }}>초기화</button>
          </div>
        </div>

        {/* 테이블 */}
        {loading ? (
          <div style={{ textAlign: 'center', color: '#8b8b94', padding: 24 }}>로딩 중...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', background: '#fff', border: '1px solid #ebe9f1', borderRadius: 10, overflow: 'hidden' }}>
              <thead style={{ background: '#f5f5f4', borderBottom: '1px solid #ebe9f1' }}>
                <tr>
                  <th style={{ ...thStyle, width: 30 }}>
                    <input type="checkbox" checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                      onChange={toggleSelectAll} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  </th>
                  <th style={{ ...thStyle, width: 40, textAlign: 'center' }}>No</th>
                  {columns.map(({ col, label }) => (
                    <th key={col} style={{ ...thStyle, cursor: 'pointer' }} onClick={() => doSort(col)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{label} {sortIcon(col)}</span>
                    </th>
                  ))}
                  <th style={{ ...thStyle, width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {displayRecords.length === 0 ? (
                  <tr><td colSpan={12} style={{ textAlign: 'center', color: '#8b8b94', padding: 24 }}>이력이 없습니다.</td></tr>
                ) : displayRecords.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((r, rowIdx) => {
                  const isExp = expandedRows.has(r.id)
                  const mapping = r.mapping || {}
                  const mctDisp = mapping.mct_ry_cd?.code
                    ? <div>{mapping.mct_ry_cd.code}<br /><span style={{ color: '#8b8b94' }}>{mapping.mct_ry_cd.name}</span></div>
                    : <span style={{ color: '#8b8b94' }}>없음</span>
                  const hpsnDisp = mapping.hpsn_mct_zcd?.code
                    ? <div>{mapping.hpsn_mct_zcd.code}<br /><span style={{ color: '#8b8b94' }}>{mapping.hpsn_mct_zcd.name}</span></div>
                    : <span style={{ color: '#8b8b94' }}>없음</span>

                  return (
                    <>
                      <tr key={r.id} style={{ background: selectedIds.has(r.id) ? '#f5f3ff' : undefined }}>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', color: '#8b8b94' }}>
                          {(currentPage - 1) * PAGE_SIZE + rowIdx + 1}
                        </td>
                        <td style={tdStyle}>{r.brno_formatted || r.brno}</td>
                        <td style={tdStyle}>{r.company_name || '-'}</td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(r.query_date)}</td>
                        <td style={tdStyle}><StatusDot success={r.api?.bizno?.success} found={r.api?.bizno?.found} /></td>
                        <td style={tdStyle}><StatusDot success={r.crawl?.success} found={r.crawl?.found} /></td>
                        <td style={tdStyle}><StatusDot success={r.api?.gov?.success} found={r.api?.gov?.found} /></td>
                        <td style={tdStyle}><StatusDot success={r.ftc?.success} found={r.ftc?.found} /></td>
                        <td style={{ ...tdStyle, cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => { loadCategories(); setMappingModal({ recordId: r.id, type: 'mct_ry_cd' }) }}
                          title="클릭하여 편집">
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                            <Pencil style={{ width: 11, height: 11, color: '#8b8b94', flexShrink: 0, marginTop: 3 }} />
                            {mctDisp}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => { loadCategories(); setMappingModal({ recordId: r.id, type: 'hpsn_mct_zcd' }) }}
                          title="클릭하여 편집">
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                            <Pencil style={{ width: 11, height: 11, color: '#8b8b94', flexShrink: 0, marginTop: 3 }} />
                            {hpsnDisp}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                            {(mapping.mct_ry_cd?.code || mapping.hpsn_mct_zcd?.code) && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }} title="매핑사유">
                                    <HelpCircle style={{ width: 16, height: 16, color: '#c4c4c4' }} />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 text-sm whitespace-pre-wrap" side="top">
                                  <p style={{ fontWeight: 600, fontSize: '0.75rem', color: '#8b8b94', marginBottom: 4 }}>매핑사유</p>
                                  <p>{mapping.reasoning || '사유 없음'}</p>
                                </PopoverContent>
                              </Popover>
                            )}
                            <button onClick={() => toggleRow(r.id)} style={{ background: 'transparent', color: '#8b8b94', border: '1px solid #ebe9f1', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {isExp ? '▲' : '▼'}
                            </button>
                            <button onClick={() => deleteRecord(r.id)} style={{ background: 'transparent', color: '#dc2626', border: '1px solid #ebe9f1', width: 28, height: 28, borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExp && (
                        <tr key={`detail-${r.id}`}>
                          <td colSpan={12} style={{ padding: 0, border: 'none' }}>
                            <DetailContent record={r} />
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {!loading && displayRecords.length > PAGE_SIZE && (() => {
          const totalPages = Math.ceil(displayRecords.length / PAGE_SIZE)
          return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16 }}>
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
                style={{ padding: '4px 10px', border: '1px solid #ebe9f1', borderRadius: 6, background: '#fff', cursor: currentPage === 1 ? 'default' : 'pointer', opacity: currentPage === 1 ? 0.4 : 1, fontSize: '0.8125rem' }}>
                «
              </button>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                style={{ padding: '4px 10px', border: '1px solid #ebe9f1', borderRadius: 6, background: '#fff', cursor: currentPage === 1 ? 'default' : 'pointer', opacity: currentPage === 1 ? 0.4 : 1, fontSize: '0.8125rem' }}>
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce<(number | string)[]>((acc, p, i, arr) => {
                  if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) acc.push('...')
                  acc.push(p); return acc
                }, [])
                .map((p, i) => p === '...'
                  ? <span key={`ellipsis-${i}`} style={{ padding: '0 4px', color: '#8b8b94' }}>…</span>
                  : <button key={p} onClick={() => setCurrentPage(p as number)}
                      style={{ padding: '4px 10px', border: '1px solid #ebe9f1', borderRadius: 6, background: currentPage === p ? 'oklch(0.457 0.24 277.023)' : '#fff', color: currentPage === p ? '#fff' : '#1a1a24', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: currentPage === p ? 600 : 400 }}>
                      {p}
                    </button>
                )}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                style={{ padding: '4px 10px', border: '1px solid #ebe9f1', borderRadius: 6, background: '#fff', cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.4 : 1, fontSize: '0.8125rem' }}>
                ›
              </button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
                style={{ padding: '4px 10px', border: '1px solid #ebe9f1', borderRadius: 6, background: '#fff', cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.4 : 1, fontSize: '0.8125rem' }}>
                »
              </button>
              <span style={{ fontSize: '0.8125rem', color: '#8b8b94', marginLeft: 8 }}>
                {currentPage} / {totalPages} 페이지
              </span>
            </div>
          )
        })()}
      </div>

      {showDataModal && <DataModal records={displayRecords.length > 0 ? displayRecords : allRecords} onClose={() => setShowDataModal(false)} />}

      {mappingModal && (
        <MappingModal
          categories={categories[mappingModal.type as 'mct_ry_cd' | 'hpsn_mct_zcd'] || {}}
          mappingType={mappingModal.type}
          onSelect={(code, name) => saveMapping(mappingModal.recordId, mappingModal.type, code, name)}
          onClose={() => setMappingModal(null)}
        />
      )}

      <button
        onClick={() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })}
        title="맨 위로"
        style={{ position: 'fixed', bottom: 28, right: 28, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 100 }}
      >
        <ArrowUp style={{ width: 18, height: 18, color: '#6b7280' }} />
      </button>
    </div>
  )
}
