import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BIZNO_BASE = "https://www.bizno.net"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def _normalize_digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _get_table_cell(soup: BeautifulSoup, label: str):
    for th in soup.find_all("th"):
        if th.get_text(strip=True) == label:
            return th.find_next_sibling("td")
    return None


def _parse_industry_classification(td) -> dict[str, str]:
    if not td:
        return {}

    result = {}
    for paragraph in td.find_all("p"):
        text = paragraph.get_text(strip=True)
        if " : " in text:
            key, value = text.split(" : ", 1)
            result[key.strip()] = value.strip()
        elif text:
            result[f"항목{len(result) + 1}"] = text
    return result


def _parse_search_post(post) -> dict:
    link = post.select_one("a[href*='/article/']")
    titles = post.select_one(".titles")
    h4 = titles.select_one("h4") if titles else None
    h5_list = titles.select("h5") if titles else []
    address = post.select_one(".details p")

    representative = h5_list[0].get_text(strip=True) if len(h5_list) > 0 else ""
    industry_brief = h5_list[1].get_text(strip=True) if len(h5_list) > 1 else ""

    href = link.get("href", "") if link else ""
    article_path = href if href.startswith("/") else f"/{href.lstrip('/')}"

    return {
        "상호명": h4.get_text(strip=True) if h4 else "",
        "대표자명": representative,
        "업종(목록)": industry_brief,
        "주소": address.get_text(" ", strip=True) if address else "",
        "article_path": article_path,
        "article_url": urljoin(BIZNO_BASE, article_path),
    }


def _parse_detail_page(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")

    mail_order_td = _get_table_cell(soup, "통신판매업번호")
    industry_td = _get_table_cell(soup, "국세청산업분류")
    business_type_td = _get_table_cell(soup, "업 태")
    business_item_td = _get_table_cell(soup, "종 목")

    detail = {}

    if mail_order_td:
        value = mail_order_td.get_text(" ", strip=True)
        if value:
            detail["통신판매업번호"] = value

    industry = _parse_industry_classification(industry_td)
    if industry:
        detail["국세청산업분류"] = industry

    if business_type_td:
        value = business_type_td.get_text(" ", strip=True)
        if value:
            detail["업태"] = value

    if business_item_td:
        value = business_item_td.get_text(" ", strip=True)
        if value:
            detail["종목"] = value

    return detail


def search_bizno(session: requests.Session, brno: str) -> dict:
    response = session.get(
        f"{BIZNO_BASE}/",
        params={"query": brno},
        timeout=20,
    )
    response.raise_for_status()
    response.encoding = "utf-8"

    soup = BeautifulSoup(response.text, "html.parser")
    posts = soup.select(".post-list .single-post")
    if not posts:
        return {"found": False, "items": []}

    items = [_parse_search_post(post) for post in posts]

    brno_digits = _normalize_digits(brno)
    matched = None
    for item in items:
        article_digits = _normalize_digits(item["article_path"])
        if article_digits == brno_digits or article_digits.endswith(brno_digits):
            matched = item
            break

    if matched is None and len(items) == 1:
        matched = items[0]

    return {"found": True, "items": items, "matched": matched}


def fetch_detail(session: requests.Session, article_path: str) -> dict:
    url = urljoin(BIZNO_BASE, article_path)
    response = session.get(url, timeout=20)
    response.raise_for_status()
    response.encoding = "utf-8"
    return _parse_detail_page(response.text)


def crawl_bizno(brno: str) -> dict:
    session = _session()

    try:
        search_result = search_bizno(session, brno)
    except requests.RequestException as exc:
        return {"success": False, "error": f"비즈노 검색 실패: {exc}"}

    if not search_result["found"]:
        return {
            "success": True,
            "found": False,
            "message": "비즈노 사이트에서 검색 결과가 없습니다.",
        }

    matched = search_result.get("matched")
    if not matched:
        return {
            "success": True,
            "found": False,
            "multiple": True,
            "message": "검색 결과가 여러 건이나 사업자번호와 정확히 일치하는 항목이 없습니다.",
            "search_items": [
                {k: v for k, v in item.items() if k != "article_path"}
                for item in search_result["items"]
            ],
        }

    try:
        detail = fetch_detail(session, matched["article_path"])
    except requests.RequestException as exc:
        return {"success": False, "error": f"비즈노 상세 페이지 조회 실패: {exc}"}

    search_preview = {k: v for k, v in matched.items() if k != "article_path"}

    if not detail:
        return {
            "success": True,
            "found": True,
            "search": search_preview,
            "detail": {},
            "message": "상세 페이지에서 업종 관련 정보를 찾지 못했습니다.",
        }

    return {
        "success": True,
        "found": True,
        "search": search_preview,
        "detail": detail,
    }
