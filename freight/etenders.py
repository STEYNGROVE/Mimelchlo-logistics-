"""Read National Treasury's public OCDS release packages."""
import re
import time
from datetime import date, datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

import json

ENDPOINT = "https://ocds-api.etenders.gov.za/api/OCDSReleases"
MAX_BYTES = 8_000_000
PAGE_SIZE = 2
SOURCE = "national-treasury-ocds"
PROVINCES = (
    "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo",
    "Mpumalanga", "Northern Cape", "North West", "Western Cape",
)
FREIGHT = re.compile(
    r"\b(?:freight|haulage|cartage|linehaul|road freight|"
    r"transport(?:ation)? of (?:goods|coal|materials|cargo|containers|"
    r"equipment|produce|fuel|water|commodities)|bulk transport|"
    r"cargo transport|container transport)\b", re.IGNORECASE,
)


def page_url(start, end, page):
    return ENDPOINT + "?" + urlencode({
        "dateFrom": start.isoformat(), "dateTo": end.isoformat(),
        "PageNumber": page, "PageSize": PAGE_SIZE,
    })


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url):
    request = Request(url, headers={
        "Accept": "application/json", "User-Agent": "NexusFreightHunter/1.0",
    })
    opener = build_opener(NoRedirect)
    for attempt in range(3):
        try:
            with opener.open(request, timeout=15) as response:
                payload = response.read(MAX_BYTES + 1)
            if len(payload) > MAX_BYTES:
                raise ValueError("Treasury response exceeds the size limit")
            return json.loads(payload)
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
            retry = error.headers.get("Retry-After")
            # Defer to a later run when the publisher requests a longer pause.
            if retry and (not retry.isdecimal() or len(retry) > 2 or int(retry) > 15):
                raise
            time.sleep(max(int(retry or 0), 2 ** attempt))
        except (URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def timestamp(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Invalid OCDS timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("OCDS timestamp lacks an offset")
    return parsed.astimezone(timezone.utc).isoformat(timespec="microseconds")


def normalize(raw, url):
    if not isinstance(raw, dict) or not isinstance(raw.get("ocid"), str):
        raise ValueError("Invalid OCDS release")
    tender = raw.get("tender")
    if not isinstance(tender, dict):
        return None
    title = tender.get("title") or ""
    description = tender.get("description") or ""
    if not isinstance(title, str) or not isinstance(description, str):
        raise ValueError("Invalid OCDS tender text")
    match = FREIGHT.search(f"{title}\n{description}")
    if not match or not title.strip() or not raw["ocid"].strip():
        return None
    deadline = tender.get("tenderPeriod") or {}
    source_status = tender.get("status") or None
    regions = set()
    for item in tender.get("items") or []:
        if isinstance(item, dict):
            address = item.get("deliveryAddress") or {}
            region = address.get("region")
            if region in PROVINCES:
                regions.add(region)
    return {
        "reference": raw["ocid"], "title": title.strip(), "source_url": url,
        "province": next(iter(regions)) if len(regions) == 1 else None,
        "published_at": timestamp(raw.get("date")),
        "closes_at": timestamp(deadline.get("endDate")),
        "source_status": source_status, "release_id": raw.get("id"),
        "buyer": (raw.get("buyer") or {}).get("name"),
        "match_evidence": match.group(0),
    }


def read_page(start: date, end: date, page: int, read=fetch):
    url = page_url(start, end, page)
    payload = read(url)
    if not isinstance(payload, dict) or not isinstance(payload.get("releases"), list):
        raise ValueError("Invalid OCDS release package")
    releases = payload["releases"]
    if len(releases) > PAGE_SIZE:
        raise ValueError("Treasury returned more releases than requested")
    links = payload.get("links") or {}
    if not isinstance(links, dict):
        raise ValueError("Invalid OCDS pagination links")
    more = bool(links.get("next"))
    if more:
        from urllib.parse import parse_qs
        actual = urlsplit(links["next"])
        expected = urlsplit(page_url(start, end, page + 1))
        if (actual.scheme, actual.netloc, actual.path, parse_qs(actual.query)) != (
            expected.scheme, expected.netloc, expected.path, parse_qs(expected.query)
        ) or not releases:
            raise ValueError("Unexpected OCDS next-page link")
    return releases, more, url
