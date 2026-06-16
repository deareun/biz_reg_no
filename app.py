import os
import re
import csv
import io
import json
import queue
import smtplib
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

from bizno_scraper import crawl_bizno
from models import db, QueryHistory, FtcBrandInfo

try:
    import google.generativeai as genai
except ImportError:
    genai = None

load_dotenv()

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///query_history.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CORS(app)
db.init_app(app)

with app.app_context():
    db.create_all()

    # 새로운 컬럼 추가 (마이그레이션)
    try:
        import sqlalchemy as sa
        inspector = sa.inspect(db.engine)
        columns = [col['name'] for col in inspector.get_columns('query_history')]

        if 'mct_ry_cd_result' not in columns:
            with db.engine.begin() as conn:
                conn.execute(sa.text(
                    "ALTER TABLE query_history ADD COLUMN mct_ry_cd_result JSON"
                ))

        if 'hpsn_mct_zcd_result' not in columns:
            with db.engine.begin() as conn:
                conn.execute(sa.text(
                    "ALTER TABLE query_history ADD COLUMN hpsn_mct_zcd_result JSON"
                ))
    except Exception as e:
        # 이미 존재하거나 다른 DB에서는 실패할 수 있으므로 무시
        pass

BIZNO_API_KEY = os.getenv("bizno_API_Key", "")
GOV_API_KEY_ENCODED = os.getenv("gov_API_key_encoded", "")
GOV_API_KEY_DECODED = os.getenv("gov_API_key_decoded", "")
FTC_API_KEY = os.getenv("ftc_API_key", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

BIZNO_URL = "https://bizno.net/api/fapi"
GOV_URL = "https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3"
FTC_URL = "https://franchise.ftc.go.kr/api/search.do"

GOV_FIELD_LABELS = {
    "brno": "사업자등록번호",
    "corpNm": "법인명",
    "bplcNm": "사업장명",
    "rprsvNm": "대표자명",
    "rprsvRrn": "대표자주민번호",
    "bplcTelno": "사업장전화번호",
    "bplcFaxno": "사업장팩스번호",
    "bplcAddr": "사업장주소",
    "bplcZip": "사업장우편번호",
    "prmmiMnno": "인허가관리번호",
    "opnSn": "개방일련번호",
    "opnSvcId": "개방서비스ID",
    "opnSvcNm": "개방서비스명",
    "opnDt": "개방일자",
    "trnmNm": "업종명",
    "dclrInstNm": "신고기관명",
    "dclrInstCd": "신고기관코드",
    "dclrDt": "신고일자",
    "sttusNm": "상태명",
    "sttusCd": "상태코드",
    "siteUrl": "사이트URL",
    "siteNm": "사이트명",
    "mnfctYn": "제조여부",
    "mnfctNm": "제조명",
}

TELECOM_FIELD_MAPPING = {
    "bzmnNm": "사업자명",
    "bzmnRgsSttusSeNm": "등록상태",
    "lctnAddr": "지번주소",
    "lctnRnAddr": "도로명주소",
    "dclrDate": "신고일자",
    "telno": "전화번호",
    "domncn": "도메인",
    "ntslMthdCn": "판매방식",
    "ntslPrdlstCn": "판매물품",
    "operSttusCdNm": "운영상태",
    "corpYnNm": "법인여부",
    "crno": "법인등록번호",
    "ctpvNm": "시도명",
    "rprsvEmladr": "대표이메일",
    "prcsDeptNm": "처리부서명",
    "prmmiYr": "허가개시년도",
    "lctnRnOzip": "우편번호",
}


def parse_business_numbers(raw: str) -> list[str]:
    parts = re.split(r"[\s,;]+", raw.strip())
    numbers = []
    seen = set()
    for part in parts:
        digits = re.sub(r"\D", "", part)
        if len(digits) == 10 and digits not in seen:
            numbers.append(digits)
            seen.add(digits)
    return numbers


def format_business_number(digits: str) -> str:
    return f"{digits[:3]}-{digits[3:5]}-{digits[5:]}"


def format_date(date_str: str) -> str:
    """ISO 형식 또는 기타 형식의 날짜를 yyyy.mm.dd 형식으로 변환"""
    if not date_str:
        return ""

    # 이미 yyyy.mm.dd 형식이면 반환
    if isinstance(date_str, str) and len(date_str) == 10 and date_str[4] == '.' and date_str[7] == '.':
        return date_str

    try:
        # ISO 형식 (YYYY-MM-DD 또는 YYYY-MM-DDTHH:MM:SS)
        if isinstance(date_str, str):
            date_str = date_str.split('T')[0]  # T 이후 제거
            if '-' in date_str:
                parts = date_str.split('-')
                if len(parts) == 3:
                    return f"{parts[0]}.{parts[1]}.{parts[2]}"
            # YYYYMMDD 형식
            elif len(date_str) >= 8 and date_str[:8].isdigit():
                return f"{date_str[:4]}.{date_str[4:6]}.{date_str[6:8]}"
        return str(date_str)
    except Exception:
        return str(date_str) if date_str else ""


def load_categories():
    """category.txt에서 업종코드 로드"""
    categories = {
        'mct_ry_cd': {},  # 가맹점원장 기준 - {코드: 업종명}
        'hpsn_mct_zcd': {}        # 초개인화 기준 - {코드: 업종명}
    }

    try:
        category_path = os.path.join(os.path.dirname(__file__), 'category.txt')
        if not os.path.exists(category_path):
            print(f"category.txt를 찾을 수 없습니다: {category_path}")
            return categories

        with open(category_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # MCT_RY_CD 섹션과 HPSN 섹션 분리 ('--- ' 기준)
        sections = content.split('--- ')

        if len(sections) >= 2:
            # MCT_RY_CD 섹션 (가맹점원장 기준)
            mct_section = sections[1].strip().split('\n')
            for line in mct_section[1:]:  # 첫 줄(헤더) 제외
                line = line.strip()
                if not line or line.startswith('MCT_RY_CD'):
                    continue
                # CSV 형식: 첫 번째 값은 코드, 두 번째 값은 업종명
                parts = line.split(',')
                if len(parts) >= 2:
                    code = parts[0].strip()
                    name = parts[1].strip()
                    # '기타'로 시작하는 업종만 제외 (금융-기타 같은 경우는 포함)
                    if code and code[0].isdigit() and not name.startswith('기타'):
                        categories['mct_ry_cd'][code] = name

            # HPSN 섹션 (초개인화 기준)
            if len(sections) >= 3:
                hpsn_mct_zcd_section = sections[2].strip().split('\n')
                for line in hpsn_mct_zcd_section:
                    line = line.strip()
                    if not line or line.startswith('HPSN_') or line.startswith('초개인화'):
                        continue
                    # CSV 형식: 첫 번째 값은 코드, 여덟 번째 값은 업종명
                    parts = line.split(',')
                    if len(parts) >= 8:
                        code = parts[0].strip()
                        name = parts[7].strip()
                        # '기타'로 시작하는 업종만 제외 (금융-기타 같은 경우는 포함)
                        if code and code[0].isalpha() and not name.startswith('기타'):
                            categories['hpsn_mct_zcd'][code] = name

            print(f"카테고리 로딩 완료: MCT_RY_CD {len(categories['mct_ry_cd'])}개, HPSN {len(categories['hpsn_mct_zcd'])}개")

    except Exception as e:
        print(f"카테고리 로딩 실패: {e}")

    return categories


# 카테고리 로드 (전역 변수)
CATEGORIES = load_categories()


def query_bizno(brno: str) -> dict:
    if not BIZNO_API_KEY:
        return {"success": False, "error": "bizno_API_Key가 .env에 설정되지 않았습니다."}

    params = {
        "key": BIZNO_API_KEY,
        "gb": "1",
        "q": brno,
        "type": "json",
        "status": "N",
        "page": "1",
        "pagecnt": "10",
    }

    try:
        response = requests.get(BIZNO_URL, params=params, timeout=20)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        return {"success": False, "error": f"Bizno API 요청 실패: {exc}"}
    except ValueError:
        return {"success": False, "error": "Bizno API 응답을 JSON으로 파싱할 수 없습니다."}

    if data.get("resultCode") != 0:
        return {
            "success": False,
            "error": data.get("resultMsg", "Bizno API 오류"),
            "raw": data,
        }

    items = [item for item in data.get("items", []) if item]
    if not items:
        return {"success": True, "found": False, "message": "검색 결과가 없습니다.", "raw": data}

    normalized = []
    for item in items:
        normalized.append(
            {
                "상호명": item.get("company", ""),
                "사업자등록번호": item.get("bno", ""),
                "법인등록번호": item.get("cno", ""),
                "사업자상태": item.get("bstt", ""),
                "사업자상태코드": item.get("bsttcd", ""),
                "과세유형": item.get("taxtype", ""),
                "폐업일": item.get("EndDt", ""),
            }
        )

    return {
        "success": True,
        "found": True,
        "total_count": data.get("totalCount", len(normalized)),
        "items": normalized,
        "raw": data,
    }


def query_gov(brno: str) -> dict:
    if not GOV_API_KEY_DECODED and not GOV_API_KEY_ENCODED:
        return {"success": False, "error": "gov_API_key가 .env에 설정되지 않았습니다."}

    params = {
        "pageNo": "1",
        "numOfRows": "100",
        "resultType": "json",
        "brno": brno,
    }

    try:
        if GOV_API_KEY_DECODED:
            params["serviceKey"] = GOV_API_KEY_DECODED
            response = requests.get(GOV_URL, params=params, timeout=20)
        else:
            query = "&".join(f"{key}={value}" for key, value in params.items())
            url = f"{GOV_URL}?serviceKey={GOV_API_KEY_ENCODED}&{query}"
            response = requests.get(url, timeout=20)
        if response.status_code == 403:
            return {
                "success": False,
                "error": (
                    "공공데이터 API 접근 거부(403). "
                    "해당 API 활용신청 여부와 인증키를 확인해 주세요."
                ),
                "status_code": 403,
            }
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        return {"success": False, "error": f"공공데이터 API 요청 실패: {exc}"}
    except ValueError:
        return {"success": False, "error": "공공데이터 API 응답을 JSON으로 파싱할 수 없습니다."}

    if "response" in data:
        body = data.get("response", {}).get("body", {})
        header = data.get("response", {}).get("header", {})
        result_code = header.get("resultCode", "")
        result_msg = header.get("resultMsg", "")
        total_count = body.get("totalCount", 0)
        raw_items = body.get("items")
    else:
        result_code = data.get("resultCode", "")
        result_msg = data.get("resultMsg", "")
        total_count = data.get("totalCount", 0)
        raw_items = data.get("items")

    if result_code and result_code not in ("00", "0"):
        return {
            "success": False,
            "error": result_msg or "공공데이터 API 오류",
            "result_code": result_code,
            "raw": data,
        }

    if not raw_items:
        return {
            "success": True,
            "found": False,
            "message": "통신판매사업자 등록 정보가 없습니다.",
            "total_count": total_count,
            "raw": data,
        }

    if isinstance(raw_items, dict):
        raw_items = [raw_items]

    items = []
    for item in raw_items:
        labeled = {}
        for key, value in item.items():
            if value in (None, ""):
                continue
            label = GOV_FIELD_LABELS.get(key, key)
            labeled[label] = value
        items.append(labeled)

    return {
        "success": True,
        "found": True,
        "total_count": total_count or len(items),
        "items": items,
        "raw": data,
    }


def query_ftc(brno: str) -> dict:
    """DB에서 FTC 브랜드 정보 조회 (2025년 기준, 없으면 2024/2023)"""
    try:
        # 2025년부터 최신 데이터 우선 조회
        for year in [2025, 2024, 2023]:
            items = FtcBrandInfo.query.filter_by(brno=brno, jng_biz_crtra_yr=year).all()
            if items:
                # 가맹본부 정보 (첫 항목에서 추출)
                first_item = items[0]
                headquarters = {
                    "법인명": first_item.corp_nm,
                    "가맹본부관리번호": first_item.jng_hdqrtrs_mnno,
                }

                # 브랜드 정보
                brands = []
                for item in items:
                    brands.append({
                        "브랜드관리번호": item.brand_mnno,
                        "브랜드명": item.brand_nm,
                        "산업대분류": item.induty_lclas_nm,
                        "산업중분류": item.induty_mlsfc_nm,
                        "주요상품": item.majr_gds_nm,
                        "가맹개시일자": item.jng_biz_strt_date,
                    })

                return {
                    "success": True,
                    "found": True,
                    "year": year,
                    "가맹본부": headquarters,
                    "브랜드": brands,
                }

        # 데이터 없음
        return {
            "success": True,
            "found": False,
            "message": "가맹사업정보가 없습니다.",
        }
    except Exception as e:
        return {"success": False, "error": f"FTC 데이터 조회 실패: {str(e)}"}


def extract_company_name(bizno_result, crawl_result, gov_result) -> str:
    """상호명 추출: bizno > crawl > gov 순서로 첫 번째 값 반환"""
    # bizno API에서 추출
    if bizno_result and bizno_result.get("success") and bizno_result.get("items"):
        try:
            items = bizno_result.get("items", [])
            if items and isinstance(items, list):
                return items[0].get("상호명", "")
        except (KeyError, IndexError, TypeError):
            pass

    # crawl에서 추출
    if crawl_result and crawl_result.get("success") and crawl_result.get("search"):
        try:
            return crawl_result.get("search", {}).get("상호명", "")
        except (KeyError, TypeError):
            pass

    # gov에서 추출
    if gov_result and gov_result.get("success") and gov_result.get("items"):
        try:
            items = gov_result.get("items", [])
            if items and isinstance(items, list):
                return items[0].get("법인명", "")
        except (KeyError, IndexError, TypeError):
            pass

    return ""


def perform_category_mapping(brno: str, company_name: str, bizno_result: dict, crawl_result: dict,
                            gov_result: dict, ftc_result: dict) -> dict:
    """Gemini API를 사용하여 업종 매핑 수행"""
    if not company_name or not GEMINI_API_KEY or not genai:
        return {}

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(GEMINI_MODEL)

        # 데이터 추출
        crawl_info = crawl_result.get('search', {}) if crawl_result else {}
        crawl_detail = crawl_result.get('detail', {}) if crawl_result else {}
        industry_category = crawl_detail.get('국세청산업분류', {}) if isinstance(crawl_detail.get('국세청산업분류'), dict) else {}

        gov_items = gov_result.get('items', []) if gov_result else []
        gov_info = gov_items[0] if gov_items else {}

        ftc_items = ftc_result.get('브랜드', []) if ftc_result else []
        ftc_info = ftc_items[0] if ftc_items else {}

        # 테이블 형태의 데이터 구성
        table_data = f"""사업자번호|상호명|국세청산업분류_대분류|중분류|소분류|세분류|세세분류|통신판매업_판매물품|가맹사업_산업대분류|중분류|소분류|주요상품값
{brno}|{company_name}|{industry_category.get('대분류', '')}|{industry_category.get('중분류', '')}|{industry_category.get('소분류', '')}|{industry_category.get('세분류', '')}|{industry_category.get('세세분류', '')}|{gov_info.get('판매물품', '')}|{ftc_info.get('산업대분류', '')}|{ftc_info.get('산업중분류', '')}|{ftc_info.get('주요상품', '')}|"""

        # Category 데이터를 프롬프트에 포함
        mct_ry_cd_list = '\n'.join([f"  {code}: {name}" for code, name in CATEGORIES['mct_ry_cd'].items()])
        hpsn_mct_zcd_list = '\n'.join([f"  {code}: {name}" for code, name in CATEGORIES['hpsn_mct_zcd'].items()])

        prompt = f"""다음 사업 정보를 분석하여 최적의 가맹점업종 코드를 매핑하세요.
무조건 1개씩 선택해야 합니다. NULL값이나 빈 값은 허용되지 않습니다.

[사업 정보]
{table_data}

[가맹점업종기준 코드 (mct_ry_cd) - 전체 {len(CATEGORIES['mct_ry_cd'])}개]
{', '.join([f'{code}({name})' for code, name in CATEGORIES['mct_ry_cd'].items()])}

[초개인화업종기준 코드 (hpsn_mct_zcd) - 전체 {len(CATEGORIES['hpsn_mct_zcd'])}개]
{', '.join([f'{code}({name})' for code, name in CATEGORIES['hpsn_mct_zcd'].items()])}

위의 사업 정보를 바탕으로 category.txt의 코드를 참고하여 최적의 업종을 매핑하세요.
국세청 산업분류, 가맹사업 정보, 통신판매 물품 등을 종합적으로 고려하세요.

**중요**: 반드시 아래 규칙을 따르세요:
1. mct_ry_cd와 hpsn_mct_zcd 모두 정확히 1개씩만 선택하세요
2. 완전히 확실하지 않으면 가장 가능성 높은 것을 선택하세요
3. null, 빈 값, 미지정은 허용되지 않습니다
4. 선택할 수 없으면 기본값으로 일반적인 업종을 선택하세요

응답 형식 (JSON):
{{
  "mct_ry_cd": {{"code": "CODE", "name": "업종명"}},
  "hpsn_mct_zcd": {{"code": "CODE", "name": "업종명"}},
  "reasoning": "매핑 이유"
}}

주의:
- 반드시 위의 코드 목록에서만 선택하세요
- code는 숫자만 입력하세요
- name도 정확히 입력하세요
- JSON 형식을 정확히 지키세요"""

        response = model.generate_content(prompt)
        result_text = response.text.strip()

        print(f"[매핑] {brno} - {company_name}")
        print(f"[prompt] : {prompt}")
        print(f"LLM 응답: {result_text[:200]}...")

        # JSON 추출 시도
        try:
            # ```json ... ``` 형식이 있으면 제거
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0].strip()
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0].strip()

            mapping_result = json.loads(result_text)

            # 결과 검증
            if mapping_result.get('mct_ry_cd'):
                mct_code = mapping_result['mct_ry_cd'].get('code')
                if mct_code and mct_code not in CATEGORIES['mct_ry_cd']:
                    print(f"경고: mct_ry_cd 코드 {mct_code}가 카테고리에 없음")
                    mapping_result['mct_ry_cd']['name'] = CATEGORIES['mct_ry_cd'].get(mct_code, mapping_result['mct_ry_cd'].get('name'))

            if mapping_result.get('hpsn_mct_zcd'):
                hpsn_code = mapping_result['hpsn_mct_zcd'].get('code')
                if hpsn_code and hpsn_code not in CATEGORIES['hpsn_mct_zcd']:
                    print(f"경고: hpsn_mct_zcd 코드 {hpsn_code}가 카테고리에 없음")
                    mapping_result['hpsn_mct_zcd']['name'] = CATEGORIES['hpsn_mct_zcd'].get(hpsn_code, mapping_result['hpsn_mct_zcd'].get('name'))

            print(f"매핑 결과: {mapping_result}")
            return mapping_result
        except json.JSONDecodeError as e:
            print(f"JSON 파싱 실패: {result_text}")
            print(f"파싱 에러: {e}")
            return {}

    except Exception as e:
        print(f"업종매핑 실패: {e}")
        import traceback
        traceback.print_exc()
        return {}




def lookup_one(brno: str, perform_mapping: bool = False) -> dict:
    from datetime import datetime

    # 3개월 이내 조회 기록 확인 (앱 컨텍스트 필요)
    is_cached = False
    bizno_result = None
    gov_result = None
    crawl_result = None
    ftc_result = None
    company_name = None
    query_date = None

    try:
        recent_record = QueryHistory.get_recent_by_brno(brno)
        if recent_record:
            is_cached = True
            record_dict = recent_record.to_dict()
            bizno_result = record_dict.get("api", {}).get("bizno")
            gov_result = record_dict.get("api", {}).get("gov")
            crawl_result = record_dict.get("crawl")
            ftc_result = record_dict.get("ftc")
            company_name = record_dict.get("company_name")
            query_date = record_dict.get("query_date")

    except Exception as e:
        print(f"DB 조회 실패 (캐시): {e}")

    # 캐시에 없으면 새로 조회
    if not is_cached:
        bizno_result = query_bizno(brno)
        gov_result = query_gov(brno)
        crawl_result = crawl_bizno(brno)
        ftc_result = query_ftc(brno)
        company_name = extract_company_name(bizno_result, crawl_result, gov_result)
        query_date = datetime.utcnow().isoformat()

        # DB에 저장
        try:
            history = QueryHistory(
                brno=brno,
                brno_formatted=format_business_number(brno),
                company_name=company_name,
                bizno_result=bizno_result,
                gov_result=gov_result,
                crawl_result=crawl_result,
                ftc_result=ftc_result,
            )
            db.session.add(history)
            db.session.commit()
        except Exception as e:
            print(f"DB 저장 실패: {e}")
            db.session.rollback()

    # 업종매핑 수행 (필요한 경우)
    mapping = None
    if perform_mapping and company_name:
        mapping = perform_category_mapping(brno, company_name, bizno_result, crawl_result,
                                          gov_result, ftc_result)

        # 매핑 결과를 DB에 저장 (캐시 여부 상관없이 항상 저장)
        if mapping:
            try:
                history = QueryHistory.query.filter_by(brno=brno).order_by(QueryHistory.query_date.desc()).first()
                if history:
                    history.mct_ry_cd_result = mapping.get('mct_ry_cd')
                    history.hpsn_mct_zcd_result = mapping.get('hpsn_mct_zcd')
                    db.session.commit()
                    print(f"매핑 결과 저장 완료: {brno} (캐시여부: {is_cached})")
            except Exception as e:
                print(f"매핑 결과 저장 실패: {e}")
                db.session.rollback()

    result = {
        "brno": brno,
        "brno_formatted": format_business_number(brno),
        "company_name": company_name,
        "query_date": query_date,
        "is_cached": is_cached,
        "api": {
            "bizno": bizno_result,
            "gov": gov_result,
        },
        "crawl": crawl_result,
        "ftc": ftc_result,
    }

    if mapping:
        result["mapping"] = mapping

    return result


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/history")
def history():
    return render_template("history.html")




@app.get("/api/history")
def get_history():
    """조회 이력 조회 (최신순 정렬)"""
    records = QueryHistory.query.order_by(QueryHistory.query_date.desc()).all()
    return jsonify({
        "success": True,
        "count": len(records),
        "records": [r.to_dict() for r in records]
    })


@app.post("/api/history/delete-old")
def delete_old_history():
    """3개월 경과 기록 일괄 삭제"""
    days = request.json.get("days", 90) if request.json else 90
    deleted_count = QueryHistory.delete_old_records(days)
    return jsonify({
        "success": True,
        "deleted_count": deleted_count,
        "message": f"{deleted_count}건의 {days}일 이상 경과 기록이 삭제되었습니다."
    })


@app.delete("/api/history/<int:record_id>")
def delete_history_record(record_id):
    """개별 이력 삭제"""
    record = QueryHistory.query.get(record_id)
    if not record:
        return jsonify({"success": False, "error": "기록을 찾을 수 없습니다."}), 404

    try:
        db.session.delete(record)
        db.session.commit()
        return jsonify({"success": True, "message": "삭제되었습니다."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.post("/api/history/delete-multiple")
def delete_multiple_history():
    """선택 항목 일괄 삭제"""
    payload = request.get_json(silent=True) or {}
    record_ids = payload.get("record_ids", [])

    if not record_ids:
        return jsonify({"success": False, "error": "삭제할 항목이 없습니다."}), 400

    try:
        deleted_count = 0
        for record_id in record_ids:
            record = QueryHistory.query.get(record_id)
            if record:
                db.session.delete(record)
                deleted_count += 1

        db.session.commit()
        return jsonify({
            "success": True,
            "deleted_count": deleted_count,
            "message": f"{deleted_count}건의 기록이 삭제되었습니다."
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


def _lookup_with_context(brno: str, perform_mapping: bool = False) -> dict:
    """앱 컨텍스트 내에서 lookup_one 실행"""
    with app.app_context():
        return lookup_one(brno, perform_mapping)


@app.post("/api/lookup")
def lookup():
    payload = request.get_json(silent=True) or {}
    raw_input = payload.get("business_numbers", "")
    perform_mapping = payload.get("perform_category_mapping", False)
    numbers = parse_business_numbers(raw_input)

    if not numbers:
        return jsonify({"success": False, "error": "유효한 사업자등록번호가 없습니다. (10자리 숫자)"}), 400

    if len(numbers) > 100:
        return jsonify({"success": False, "error": "한 번에 최대 100개까지 조회할 수 있습니다."}), 400

    results = []
    with ThreadPoolExecutor(max_workers=min(len(numbers), 5)) as executor:
        futures = {executor.submit(_lookup_with_context, brno, perform_mapping): brno for brno in numbers}
        for future in as_completed(futures):
            results.append(future.result())

    results.sort(key=lambda item: numbers.index(item["brno"]))

    return jsonify({"success": True, "count": len(results), "results": results})


@app.post("/api/lookup-stream")
def lookup_stream():
    from flask import Response, stream_with_context

    payload = request.get_json(silent=True) or {}
    raw_input = payload.get("business_numbers", "")
    perform_mapping = payload.get("perform_category_mapping", False)
    numbers = parse_business_numbers(raw_input)

    sse_headers = {
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    }

    if not numbers:
        def err_gen():
            yield f"data: {json.dumps({'type': 'error', 'message': '유효한 사업자등록번호가 없습니다.'})}\n\n"
        return Response(stream_with_context(err_gen()), content_type='text/event-stream', headers=sse_headers)

    if len(numbers) > 100:
        def err_gen():
            yield f"data: {json.dumps({'type': 'error', 'message': '한 번에 최대 100개까지 조회할 수 있습니다.'})}\n\n"
        return Response(stream_with_context(err_gen()), content_type='text/event-stream', headers=sse_headers)

    event_q = queue.Queue()

    def thread_wrapper(brno):
        event_q.put({'type': 'processing', 'brno': brno})
        try:
            result = _lookup_with_context(brno, perform_mapping)
        except Exception as e:
            result = {'brno': brno, 'success': False, 'error': str(e)}
        event_q.put({'type': 'result', 'brno': brno, 'result': result})

    def generate():
        yield f"data: {json.dumps({'type': 'start', 'total': len(numbers)})}\n\n"
        completed = 0
        total = len(numbers)

        with ThreadPoolExecutor(max_workers=min(total, 5)) as executor:
            for brno in numbers:
                executor.submit(thread_wrapper, brno)

            while completed < total:
                try:
                    event = event_q.get(timeout=120)
                    yield f"data: {json.dumps(event)}\n\n"
                    if event.get('type') == 'result':
                        completed += 1
                except queue.Empty:
                    yield f"data: {json.dumps({'type': 'error', 'message': '일부 항목 조회 시간 초과'})}\n\n"
                    break

        yield f"data: {json.dumps({'type': 'done', 'completed': completed, 'total': total})}\n\n"

    return Response(stream_with_context(generate()), content_type='text/event-stream', headers=sse_headers)


@app.get("/api/categories")
def get_categories():
    """업종 카테고리 데이터 조회"""
    return jsonify({
        "success": True,
        "mct_ry_cd": CATEGORIES.get('mct_ry_cd', {}),
        "hpsn_mct_zcd": CATEGORIES.get('hpsn_mct_zcd', {})
    })


@app.post("/api/update-mapping")
def update_mapping():
    """매핑 결과 수동 업데이트"""
    payload = request.get_json(silent=True) or {}
    record_id = payload.get("record_id")
    mct_ry_cd = payload.get("mct_ry_cd")
    hpsn_mct_zcd = payload.get("hpsn_mct_zcd")

    if not record_id:
        return jsonify({"success": False, "error": "record_id가 필요합니다."}), 400

    try:
        record = QueryHistory.query.get(record_id)
        if not record:
            return jsonify({"success": False, "error": "기록을 찾을 수 없습니다."}), 404

        # 매핑 결과 업데이트
        if mct_ry_cd:
            record.mct_ry_cd_result = mct_ry_cd
        if hpsn_mct_zcd:
            record.hpsn_mct_zcd_result = hpsn_mct_zcd

        db.session.commit()
        return jsonify({
            "success": True,
            "message": "매핑이 업데이트되었습니다.",
            "updated_record": record.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.get("/api/ftc/search")
def ftc_search():
    """FTC 브랜드 정보 조회"""
    brno = request.args.get('brno', '').strip()

    if not brno or len(brno) != 10 or not brno.isdigit():
        return jsonify({"success": False, "error": "유효한 사업자번호가 아닙니다. (10자리 숫자)"}), 400

    # 2025년 데이터 우선, 없으면 2024, 2023 순서로 조회
    results = []
    for year in [2025, 2024, 2023]:
        items = FtcBrandInfo.query.filter_by(brno=brno, jng_biz_crtra_yr=year).all()
        if items:
            results = items
            selected_year = year
            break
    else:
        selected_year = None

    if not results:
        return jsonify({
            "success": True,
            "found": False,
            "brno": brno,
            "message": "해당 사업자번호의 가맹정보가 없습니다."
        }), 200

    # 결과를 브랜드명 기준으로 정렬
    results.sort(key=lambda x: x.brand_nm or '')

    # 응답 포맷
    formatted_results = []
    for item in results:
        formatted_results.append({
            '법인명': item.corp_nm,
            '사업자번호': item.brno,
            '법인등록번호': item.crno,
            '가맹본부대표자명': item.jng_hdqrtrs_reprсv_nm,
            '브랜드관리번호': item.brand_mnno,
            '가맹본부관리번호': item.jng_hdqrtrs_mnno,
            '브랜드명': item.brand_nm,
            '산업대분류': item.induty_lclas_nm,
            '산업중분류': item.induty_mlsfc_nm,
            '주요상품': item.majr_gds_nm,
            '가맹사업개시일자': item.jng_biz_strt_date,
        })

    return jsonify({
        "success": True,
        "found": True,
        "brno": brno,
        "조회년도": selected_year,
        "count": len(formatted_results),
        "results": formatted_results
    }), 200




@app.post("/api/send-email")
def send_email():
    """조회 결과를 CSV로 생성하여 이메일 발송"""
    payload = request.get_json(silent=True) or {}
    email_address = payload.get("email", "").strip()
    data = payload.get("data", [])
    bizno_fields = payload.get("bizno_fields", [])
    tele_fields = payload.get("tele_fields", [])
    crawl_fields = payload.get("crawl_fields", [])
    mapping_fields = payload.get("mapping_fields", [])

    if not email_address:
        return jsonify({"success": False, "error": "메일 주소가 필요합니다."}), 400

    if not data:
        return jsonify({"success": False, "error": "조회 데이터가 필요합니다."}), 400

    try:
        # CSV 생성
        csv_buffer = io.StringIO()

        # 컬럼명 생성 (사업자번호는 항상 첫 컬럼)
        columns = ["사업자번호"]
        if bizno_fields:
            columns.extend([f"bizno_{field}" for field in bizno_fields])
        if crawl_fields:
            columns.extend([f"crawl_{field}" for field in crawl_fields])
        if tele_fields:
            columns.extend([f"tele_{field}" for field in tele_fields])
        if mapping_fields:
            columns.extend([f"mapping_{field}" for field in mapping_fields])

        writer = csv.DictWriter(csv_buffer, fieldnames=columns)
        writer.writeheader()

        # 데이터 작성
        for item in data:
            row = {
                "사업자번호": item.get("brno_formatted", item.get("brno", ""))
            }

            # Bizno API 데이터
            if bizno_fields and item.get("api", {}).get("bizno", {}).get("items"):
                bizno_items = item["api"]["bizno"]["items"]
                if bizno_items:
                    bizno_data = bizno_items[0]
                    for field in bizno_fields:
                        row[f"bizno_{field}"] = bizno_data.get(field, "")

            # 크롤링 데이터 (search + detail)
            if crawl_fields:
                crawl_info = item.get("crawl", {})
                # search 데이터 (상호명, 주소 등)
                search_data = crawl_info.get("search", {})
                # detail 데이터 (국세청산업분류, 업태, 종목 등)
                detail_data = crawl_info.get("detail", {})

                for field in crawl_fields:
                    # 필드가 search에 있으면 우선 사용
                    if field in search_data:
                        row[f"crawl_{field}"] = search_data.get(field, "")
                    # 국세청산업분류_* 형태면 detail 객체에서 추출
                    elif field.startswith("국세청산업분류_") and "국세청산업분류" in detail_data:
                        industry_dict = detail_data["국세청산업분류"]
                        if isinstance(industry_dict, dict):
                            key = field.replace("국세청산업분류_", "")
                            row[f"crawl_{field}"] = str(industry_dict.get(key, ""))
                        else:
                            row[f"crawl_{field}"] = ""
                    # 그 외 detail 데이터
                    else:
                        row[f"crawl_{field}"] = str(detail_data.get(field, ""))

            # 통신판매업 데이터 (gov)
            if tele_fields and item.get("api", {}).get("gov", {}).get("items"):
                gov_items = item["api"]["gov"]["items"]
                if gov_items:
                    gov_data = gov_items[0]
                    for field in tele_fields:
                        row[f"tele_{field}"] = gov_data.get(field, "")

            # 업종매핑 데이터
            if mapping_fields and item.get("mapping"):
                mapping_data = item["mapping"]
                for field in mapping_fields:
                    if field == "mct_ry_cd" and mapping_data.get("mct_ry_cd"):
                        row[f"mapping_mct_ry_cd"] = mapping_data["mct_ry_cd"].get("code", "")
                    elif field == "mct_ry_nm" and mapping_data.get("mct_ry_cd"):
                        row[f"mapping_mct_ry_nm"] = mapping_data["mct_ry_cd"].get("name", "")
                    elif field == "hpsn_mct_zcd" and mapping_data.get("hpsn_mct_zcd"):
                        row[f"mapping_hpsn_mct_zcd"] = mapping_data["hpsn_mct_zcd"].get("code", "")
                    elif field == "hpsn_mct_nm" and mapping_data.get("hpsn_mct_zcd"):
                        row[f"mapping_hpsn_mct_nm"] = mapping_data["hpsn_mct_zcd"].get("name", "")

            writer.writerow(row)

        csv_content = csv_buffer.getvalue()
        csv_buffer.close()

        # 이메일 발송
        smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USERNAME", "")
        smtp_password = os.getenv("SMTP_PASSWORD", "")
        from_email = os.getenv("SMTP_FROM_EMAIL", smtp_user)

        if not smtp_user or not smtp_password:
            return jsonify({"success": False, "error": "이메일 서버 설정이 필요합니다."}), 500

        msg = MIMEMultipart()
        msg['From'] = from_email
        msg['To'] = email_address
        msg['Subject'] = f"[사업자번호 조회] 조회결과 - {datetime.now().strftime('%Y-%m-%d %H:%M')}"

        body = "조회 결과를 첨부파일로 보내드립니다."
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        # CSV 첨부 (utf-8-sig: Excel 한글 인식용 BOM, octet-stream: 보안메일 호환)
        csv_bytes = csv_content.encode('utf-8-sig')
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"business_registration_no_{len(data)}_{timestamp}.csv"
        csv_attachment = MIMEApplication(csv_bytes, _subtype='octet-stream')
        csv_attachment.add_header('Content-Disposition', 'attachment', filename=filename)
        msg.attach(csv_attachment)

        # SMTP로 발송
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)

        return jsonify({"success": True, "message": "메일이 발송되었습니다."})

    except smtplib.SMTPException as e:
        return jsonify({"success": False, "error": f"이메일 발송 실패: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": f"오류 발생: {str(e)}"}), 500


@app.post("/api/generate-csv")
def generate_csv():
    """조회 결과를 CSV로 생성하여 다운로드"""
    from flask import send_file

    payload = request.get_json(silent=True) or {}
    data = payload.get("data", [])
    bizno_fields = payload.get("bizno_fields", [])
    tele_fields = payload.get("tele_fields", [])
    crawl_fields = payload.get("crawl_fields", [])
    mapping_fields = payload.get("mapping_fields", [])

    if not data:
        return jsonify({"success": False, "error": "조회 데이터가 필요합니다."}), 400

    try:
        csv_buffer = io.StringIO()

        columns = ["사업자번호"]
        if bizno_fields:
            columns.extend([f"bizno_{field}" for field in bizno_fields])
        if crawl_fields:
            columns.extend([f"crawl_{field}" for field in crawl_fields])
        if tele_fields:
            columns.extend([f"tele_{field}" for field in tele_fields])
        if mapping_fields:
            columns.extend([f"mapping_{field}" for field in mapping_fields])

        writer = csv.DictWriter(csv_buffer, fieldnames=columns)
        writer.writeheader()

        for item in data:
            row = {
                "사업자번호": item.get("brno_formatted", item.get("brno", ""))
            }

            if bizno_fields and item.get("api", {}).get("bizno", {}).get("items"):
                bizno_items = item["api"]["bizno"]["items"]
                if bizno_items:
                    bizno_data = bizno_items[0]
                    for field in bizno_fields:
                        row[f"bizno_{field}"] = bizno_data.get(field, "")

            if crawl_fields:
                crawl_info = item.get("crawl", {})
                search_data = crawl_info.get("search", {})
                detail_data = crawl_info.get("detail", {})

                for field in crawl_fields:
                    if field in search_data:
                        row[f"crawl_{field}"] = search_data.get(field, "")
                    elif field.startswith("국세청산업분류_") and "국세청산업분류" in detail_data:
                        industry_dict = detail_data["국세청산업분류"]
                        if isinstance(industry_dict, dict):
                            key = field.replace("국세청산업분류_", "")
                            row[f"crawl_{field}"] = str(industry_dict.get(key, ""))
                        else:
                            row[f"crawl_{field}"] = ""
                    else:
                        row[f"crawl_{field}"] = str(detail_data.get(field, ""))

            if tele_fields and item.get("api", {}).get("gov", {}).get("items"):
                gov_items = item["api"]["gov"]["items"]
                if gov_items:
                    gov_data = gov_items[0]
                    for field in tele_fields:
                        row[f"tele_{field}"] = gov_data.get(field, "")

            if mapping_fields and item.get("mapping"):
                mapping_data = item["mapping"]
                for field in mapping_fields:
                    if field == "mct_ry_cd" and mapping_data.get("mct_ry_cd"):
                        row[f"mapping_mct_ry_cd"] = mapping_data["mct_ry_cd"].get("code", "")
                    elif field == "mct_ry_nm" and mapping_data.get("mct_ry_cd"):
                        row[f"mapping_mct_ry_nm"] = mapping_data["mct_ry_cd"].get("name", "")
                    elif field == "hpsn_mct_zcd" and mapping_data.get("hpsn_mct_zcd"):
                        row[f"mapping_hpsn_mct_zcd"] = mapping_data["hpsn_mct_zcd"].get("code", "")
                    elif field == "hpsn_mct_nm" and mapping_data.get("hpsn_mct_zcd"):
                        row[f"mapping_hpsn_mct_nm"] = mapping_data["hpsn_mct_zcd"].get("name", "")

            writer.writerow(row)

        csv_content = csv_buffer.getvalue()
        csv_buffer.close()

        csv_bytes = io.BytesIO(csv_content.encode('utf-8-sig'))
        csv_bytes.seek(0)

        return send_file(
            csv_bytes,
            mimetype='text/csv; charset=utf-8',
            as_attachment=True,
            download_name=f"business_lookup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        )

    except Exception as e:
        import traceback
        error_msg = f"CSV 생성 오류: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
