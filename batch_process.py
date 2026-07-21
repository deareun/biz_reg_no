#!/usr/bin/env python3
"""
batch_process.py
사업자번호 일괄 조회 배치 처리
- bizno API 제외 (일일 한도 절약)
- crawl + 통신판매업(gov) + 가맹사업(ftc, DB) + 업종매핑(LLM) 수행
- 체크포인트 저장으로 중단 시 이어하기 가능
- 완료 후 CSV 파일 생성 (Excel 한글 호환 BOM)

실행: python batch_process.py
      python batch_process.py --no-mapping   (업종매핑 제외)
      python batch_process.py --workers 8    (동시 처리 수 변경)
"""

import os
import sys
import csv
import json
import time
import threading
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

# 프로젝트 루트로 이동
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from app import (
    app, query_gov, query_ftc,
    perform_category_mapping, extract_company_name, format_business_number,
)
from bizno_scraper import crawl_bizno

# ─── 통신판매업 API 필드 (English → Korean) ──────────────────────────
TELE_MAP = {
    "bzmnNm": "사업자명", "bzmnRgsSttusSeNm": "등록상태",
    "lctnAddr": "지번주소", "lctnRnAddr": "도로명주소",
    "dclrDate": "신고일자", "telno": "전화번호", "domncn": "도메인",
    "ntslMthdCn": "판매방식", "ntslPrdlstCn": "판매물품",
    "operSttusCdNm": "운영상태", "corpYnNm": "법인여부",
    "crno": "법인등록번호", "ctpvNm": "시도명",
    "rprsvEmladr": "대표이메일",
}

# ─── 기본 설정 ────────────────────────────────────────────────────────
INPUT_FILE = "batch_biz_brn_list.txt"
CHECKPOINT_FILE = "batch_checkpoint.json"
SAVE_EVERY = 20  # N건마다 체크포인트 저장

# ─── 스레드 공유 상태 ─────────────────────────────────────────────────
_lock = threading.Lock()
_checkpoint: dict = {}
_completed = 0
_total = 0
_start_time = 0.0


def load_brno_list() -> list[str]:
    with open(INPUT_FILE, encoding="utf-8") as f:
        lines = [ln.strip().replace("-", "").replace(" ", "") for ln in f if ln.strip()]
    numbers = [n for n in lines if n.isdigit() and len(n) == 10]
    # 중복 제거 (순서 유지)
    seen: set[str] = set()
    unique = []
    for n in numbers:
        if n not in seen:
            unique.append(n)
            seen.add(n)
    print(f"사업자번호 로드: {len(unique)}개 (원본 {len(lines)}행)")
    return unique


def load_checkpoint() -> dict:
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, encoding="utf-8") as f:
                data = json.load(f)
            print(f"체크포인트 로드: {len(data)}건 기완료")
            return data
        except Exception as e:
            print(f"체크포인트 로드 실패 (초기화): {e}")
    return {}


def save_checkpoint(data: dict) -> None:
    try:
        with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        print(f"[경고] 체크포인트 저장 실패: {e}")


def process_one(brno: str, perform_mapping: bool) -> dict:
    """단일 사업자번호 조회 (크롤링 + gov + ftc + 매핑)"""
    try:
        with app.app_context():
            crawl_result = crawl_bizno(brno)
            gov_result = query_gov(brno)
            ftc_result = query_ftc(brno)
            company_name = extract_company_name(None, crawl_result, gov_result)

            mapping = {}
            mapping_error = None
            if perform_mapping and company_name:
                mapping, mapping_error = perform_category_mapping(
                    brno, company_name,
                    None,  # bizno_result 제외
                    crawl_result, gov_result, ftc_result,
                )
                if mapping_error:
                    print(f"[매핑 실패] {brno}: {mapping_error}")

        result = {
            "brno": brno,
            "brno_formatted": format_business_number(brno),
            "company_name": company_name,
            "crawl": crawl_result,
            "api": {"gov": gov_result},
            "ftc": ftc_result,
            "mapping": mapping,
        }
        if mapping_error:
            result["mapping_error"] = mapping_error
        return result

    except Exception as e:
        print(f"\n[오류] {brno}: {e}")
        return {
            "brno": brno,
            "brno_formatted": format_business_number(brno),
            "company_name": "",
            "crawl": {"success": False, "found": False, "error": str(e)},
            "api": {"gov": {"success": False, "found": False, "error": str(e)}},
            "ftc": {"success": False, "found": False, "error": str(e)},
            "mapping": {},
            "error": str(e),
        }


def _gov_val(gov_item: dict, *keys: str) -> str:
    """gov 항목에서 값 추출 (한글 키 우선, 영어 키 fallback)"""
    for k in keys:
        ko = TELE_MAP.get(k, k)
        if ko in gov_item:
            return str(gov_item[ko] or "")
        if k in gov_item:
            return str(gov_item[k] or "")
    return ""


def build_csv_row(result: dict) -> dict:
    crawl = result.get("crawl") or {}
    search = crawl.get("search") or {}
    detail = crawl.get("detail") or {}
    cat = detail.get("국세청산업분류") or {}
    if not isinstance(cat, dict):
        cat = {}

    gov = (result.get("api") or {}).get("gov") or {}
    gov_items = gov.get("items") or []
    gi = gov_items[0] if gov_items else {}

    ftc = result.get("ftc") or {}
    ftc_brands = ftc.get("브랜드") or []
    ftc_brand = ftc_brands[0] if ftc_brands else {}
    ftc_hq = ftc.get("가맹본부") or {}

    mapping = result.get("mapping") or {}
    mct = mapping.get("mct_ry_cd") or {}
    hpsn = mapping.get("hpsn_mct_zcd") or {}

    return {
        "사업자번호": result.get("brno_formatted", ""),
        "상호명": result.get("company_name", ""),
        # crawl
        "crawl_사업자상태": str(search.get("사업자상태") or ""),
        "crawl_주소": str(search.get("주소") or detail.get("주소") or ""),
        "crawl_업태": str(detail.get("업태") or ""),
        "crawl_종목": str(detail.get("종목") or ""),
        "crawl_산업분류_대": str(cat.get("대분류") or ""),
        "crawl_산업분류_중": str(cat.get("중분류") or ""),
        "crawl_산업분류_소": str(cat.get("소분류") or ""),
        "crawl_산업분류_세": str(cat.get("세분류") or ""),
        "crawl_산업분류_세세": str(cat.get("세세분류") or ""),
        # gov (통신판매업)
        "gov_사업자명": _gov_val(gi, "bzmnNm"),
        "gov_등록상태": _gov_val(gi, "bzmnRgsSttusSeNm"),
        "gov_도로명주소": _gov_val(gi, "lctnRnAddr"),
        "gov_신고일자": _gov_val(gi, "dclrDate"),
        "gov_판매방식": _gov_val(gi, "ntslMthdCn"),
        "gov_판매물품": _gov_val(gi, "ntslPrdlstCn"),
        "gov_운영상태": _gov_val(gi, "operSttusCdNm"),
        "gov_도메인": _gov_val(gi, "domncn"),
        # ftc (가맹사업)
        "ftc_법인명": str(ftc_hq.get("법인명") or ""),
        "ftc_브랜드명": str(ftc_brand.get("브랜드명") or ""),
        "ftc_산업대분류": str(ftc_brand.get("산업대분류") or ""),
        "ftc_산업중분류": str(ftc_brand.get("산업중분류") or ""),
        "ftc_주요상품": str(ftc_brand.get("주요상품") or ""),
        # 업종매핑
        "mapping_가맹점업종코드": str(mct.get("code") or ""),
        "mapping_가맹점업종명": str(mct.get("name") or ""),
        "mapping_초개인화업종코드": str(hpsn.get("code") or ""),
        "mapping_초개인화업종명": str(hpsn.get("name") or ""),
        "mapping_매핑사유": str(mapping.get("reasoning") or ""),
    }


CSV_COLUMNS = [
    "사업자번호", "상호명",
    "crawl_사업자상태", "crawl_주소", "crawl_업태", "crawl_종목",
    "crawl_산업분류_대", "crawl_산업분류_중", "crawl_산업분류_소",
    "crawl_산업분류_세", "crawl_산업분류_세세",
    "gov_사업자명", "gov_등록상태", "gov_도로명주소", "gov_신고일자",
    "gov_판매방식", "gov_판매물품", "gov_운영상태", "gov_도메인",
    "ftc_법인명", "ftc_브랜드명", "ftc_산업대분류", "ftc_산업중분류", "ftc_주요상품",
    "mapping_가맹점업종코드", "mapping_가맹점업종명",
    "mapping_초개인화업종코드", "mapping_초개인화업종명", "mapping_매핑사유",
]


def export_csv(data: dict, output_path: str) -> None:
    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for result in data.values():
            writer.writerow(build_csv_row(result))
    size_kb = os.path.getsize(output_path) // 1024
    print(f"\nCSV 저장 완료: {output_path}  ({len(data)}건, {size_kb:,} KB)")


def main() -> None:
    global _checkpoint, _completed, _total, _start_time

    parser = argparse.ArgumentParser()
    parser.add_argument("--no-mapping", action="store_true", help="업종매핑 제외")
    parser.add_argument("--workers", type=int, default=5, help="동시 처리 수 (기본 5)")
    parser.add_argument("--reset", action="store_true", help="체크포인트 초기화 후 처음부터")
    args = parser.parse_args()

    perform_mapping = not args.no_mapping
    workers = args.workers

    print(f"\n{'='*55}")
    print(f"배치 조회 시작")
    print(f"  업종매핑: {'포함' if perform_mapping else '제외'}")
    print(f"  동시 처리: {workers}개")
    print(f"{'='*55}\n")

    brno_list = load_brno_list()
    _total = len(brno_list)

    if args.reset and os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)
        print("체크포인트 초기화\n")

    _checkpoint = load_checkpoint()
    pending = [b for b in brno_list if b not in _checkpoint]
    already_done = len(_checkpoint)
    print(f"처리 대상: {len(pending)}건  (완료: {already_done}건)\n")

    if not pending:
        print("모든 건이 이미 처리되었습니다.")
    else:
        _completed = already_done
        _start_time = time.time()

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(process_one, brno, perform_mapping): brno
                for brno in pending
            }
            for future in as_completed(futures):
                brno = futures[future]
                try:
                    result = future.result()
                except Exception as e:
                    result = {
                        "brno": brno,
                        "brno_formatted": format_business_number(brno),
                        "company_name": "", "crawl": {}, "api": {}, "ftc": {},
                        "mapping": {}, "error": str(e),
                    }

                with _lock:
                    _checkpoint[brno] = result
                    _completed += 1

                    elapsed = time.time() - _start_time
                    done_in_session = _completed - already_done
                    rate = done_in_session / elapsed if elapsed > 0 else 0
                    remaining_sec = (_total - _completed) / rate if rate > 0 else 0

                    mct_code = (result.get("mapping") or {}).get("mct_ry_cd", {}) or {}
                    mct_disp = mct_code.get("code", "-") if isinstance(mct_code, dict) else "-"
                    name_disp = (result.get("company_name") or "")[:16]

                    print(
                        f"[{_completed:>4}/{_total}] "
                        f"{result.get('brno_formatted',''):>12}  "
                        f"{name_disp:<16}  "
                        f"매핑:{mct_disp:>7}  "
                        f"남은시간:{remaining_sec/60:>5.1f}분"
                    )

                    if _completed % SAVE_EVERY == 0:
                        save_checkpoint(_checkpoint)

        save_checkpoint(_checkpoint)
        elapsed_total = time.time() - _start_time
        print(f"\n처리 완료: {len(pending)}건 / {elapsed_total/60:.1f}분 소요")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_csv = f"batch_result_{ts}.csv"
    export_csv(_checkpoint, output_csv)

    # 성공/오류 통계
    ok = sum(1 for r in _checkpoint.values() if not r.get("error"))
    err = len(_checkpoint) - ok
    mapped = sum(
        1 for r in _checkpoint.values()
        if (r.get("mapping") or {}).get("mct_ry_cd", {}).get("code")
    )
    print(f"\n통계: 성공 {ok}건 / 오류 {err}건 / 매핑완료 {mapped}건")
    print(f"체크포인트: {CHECKPOINT_FILE}")
    print(f"결과 CSV:  {output_csv}")


if __name__ == "__main__":
    main()
