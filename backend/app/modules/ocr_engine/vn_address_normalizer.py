import csv
import difflib
import json
import logging
import pathlib
import re
import threading
import unicodedata
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_DATA_DIR = pathlib.Path(__file__).resolve().parent / "data"
_LEGACY_CSV_PATH = _DATA_DIR / "gso_legacy_2025_01_04.csv"
_NEW_2025_JSON_PATH = _DATA_DIR / "nested_divisions_2025.json"

_INDEX_LOCK = threading.Lock()
_CACHED_INDEX: Optional["_VNAddressIndex"] = None

# Explicit administrative prefixes (checked case-insensitively on raw or accent-stripped text)
_PROVINCE_PREFIX_RE = re.compile(
    r"^(?:thành\s*phố|thanh\s*pho|tp\.?|tỉnh|tinh)(?=\s|[0-9A-Za-zÀ-ỹ]|$)\s*",
    re.IGNORECASE,
)
_DISTRICT_PREFIX_RE = re.compile(
    r"^(?:thành\s*phố|thanh\s*pho|tp\.?|thị\s*xã|thi\s*xa|tx\.?|quận|quan|q\.?|huyện|huyen|h\.?)(?=\s|\d|$)\s*",
    re.IGNORECASE,
)
_WARD_PREFIX_RE = re.compile(
    r"^(?:phường|phuong|p\.?|thị\s*trấn|thi\s*tran|tt\.?|đặc\s*khu|dac\s*khu|xã|x\.?|xa(?=\s))(?:(?=\s|\d|$))\s*",
    re.IGNORECASE,
)

# Short prefixes that require caution on plain letters without dot/digit/whitespace
_STRICT_PROVINCE_PREFIX_RE = re.compile(
    r"^(?:(?:thành\s*phố|thanh\s*pho|tỉnh|tinh)\s+|tp\.?\s*)",
    re.IGNORECASE,
)
_STRICT_DISTRICT_PREFIX_RE = re.compile(
    r"^(?:(?:thành\s*phố|thanh\s*pho|thị\s*xã|thi\s*xa|quận|quan|huyện|huyen)\s+|(?:tp|tx|q|h)\.\s*|(?=[qQ]\d)(?:[qQ]))",
    re.IGNORECASE,
)
_STRICT_WARD_PREFIX_RE = re.compile(
    r"^(?:(?:phường|phuong|thị\s*trấn|thi\s*tran|đặc\s*khu|dac\s*khu|xã)\s+|(?:p|x|tt)\.\s*|(?=[pP]\d)(?:[pP]))",
    re.IGNORECASE,
)

# Leading hamlet / village / street cues that must NOT be rewritten as wards/districts
_SUB_WARD_CUE_RE = re.compile(
    r"^(?:số|so|sn|nhà|nha|đường|duong|ngõ|ngo|ngách|ngach|hẻm|hem|kiệt|kiet|"
    r"thôn|thon|ấp|ap|xóm|xom|bản|ban|buôn|buon|làng|lang|tổ|to|khu\s*phố|kp\.?|"
    r"khu\s*vực|kv\.?|khối|khoi|cụm|cum|kđt|kdt|chung\s*cư|cc)\b",
    re.IGNORECASE,
)

# Canonical administrative level prefixes in official datasets
_CANON_PREFIXES = (
    "Thành phố ",
    "Tỉnh ",
    "Thị xã ",
    "Quận ",
    "Huyện ",
    "Thị trấn ",
    "Phường ",
    "Xã ",
    "Đặc khu ",
)

# Sub-ward administrative unit prefixes (hamlet, village, residential group, street)
# frequently corrupted by OCR diacritic loss on tiny/blurry text (e.g. "Ấp 4" -> "Áp 4" / "Ap 4").
_SUB_WARD_UNIT_RULES: Tuple[Tuple[re.Pattern[str], str], ...] = (
    # "Ấp" never exists as "Áp"/"Ap"/"Âp" as a Vietnamese administrative sub-ward prefix
    (re.compile(r"^([aáàảãạâấầẩẫậ]p)(?=\s+(?:\d|[A-Za-zÀ-ỹ]))", re.IGNORECASE), "Ấp"),
    (re.compile(r"^(th[oôồổỗộơờởỡợ]n)(?=\s+(?:\d|[A-Za-zÀ-ỹ]))", re.IGNORECASE), "Thôn"),
    (re.compile(r"^(x[oóòỏõọôốồổỗộ]m)(?=\s+(?:\d|[A-Za-zÀ-ỹ]))", re.IGNORECASE), "Xóm"),
    # Only normalize "Tô"/"To" -> "Tổ" before a number or "dân phố" / "DP" (protects street names like "Tô Hiệu")
    (re.compile(r"^(t[oôốồổỗộơờởỡợ])(?=\s+(?:\d+|d[aâ]n\s*ph[oốô]|dp\b))", re.IGNORECASE), "Tổ"),
    (re.compile(r"^(khu\s+ph[oốôồổỗộ])(?=\s+(?:\d|[A-Za-zÀ-ỹ]))", re.IGNORECASE), "Khu phố"),
    (re.compile(r"^(khu\s+v[uưựực]c)(?=\s+(?:\d|[A-Za-zÀ-ỹ]))", re.IGNORECASE), "Khu vực"),
    (re.compile(r"^(kh[oốôồổỗộ]i)(?=\s+\d)", re.IGNORECASE), "Khối"),
    (re.compile(r"^(đ[oộôồổỗộ]i)(?=\s+\d)", re.IGNORECASE), "Đội"),
    (re.compile(r"^([sS][oôốồổỗộ])(?=\s+(?:nh[aà]\s*)?\d)", re.IGNORECASE), "Số"),
    (re.compile(r"^(ng[oõốồổỗộ])(?=\s+\d)", re.IGNORECASE), "Ngõ"),
    (re.compile(r"^(ng[aá]ch)(?=\s+\d)", re.IGNORECASE), "Ngách"),
    (re.compile(r"^(h[eẻ]m)(?=\s+\d)", re.IGNORECASE), "Hẻm"),
    (re.compile(r"^([dđ][uư][oơờớởỡợ]ng)(?=\s+(?:\d|[A-Za-zÀ-ỹ]))", re.IGNORECASE), "Đường"),
)

_PROVINCE_ALIASES: Dict[str, str] = {
    "hcm": "Thành phố Hồ Chí Minh",
    "tp hcm": "Thành phố Hồ Chí Minh",
    "tphcm": "Thành phố Hồ Chí Minh",
    "tp ho chi minh": "Thành phố Hồ Chí Minh",
    "sai gon": "Thành phố Hồ Chí Minh",
    "thua thien hue": "Thành phố Huế",
    "tinh thua thien hue": "Thành phố Huế",
    "ba ria vung tau": "Tỉnh Bà Rịa - Vũng Tàu",
    "br vt": "Tỉnh Bà Rịa - Vũng Tàu",
    "brvt": "Tỉnh Bà Rịa - Vũng Tàu",
    "tp ha noi": "Thành phố Hà Nội",
    "hn": "Thành phố Hà Nội",
    "tp hai phong": "Thành phố Hải Phòng",
    "tp da nang": "Thành phố Đà Nẵng",
    "tp can tho": "Thành phố Cần Thơ",
    "phan rang thap cham": "Thành phố Phan Rang - Tháp Chàm",
    "dac lac": "Tỉnh Đắk Lắk",
    "dac lak": "Tỉnh Đắk Lắk",
    "dac nong": "Tỉnh Đắk Nông",
}


def _collapse_ws(text: str) -> str:
    return " ".join((text or "").split())


def _strip_accents_lower(text: str) -> str:
    text = (text or "").replace("đ", "d").replace("Đ", "d")
    decomposed = unicodedata.normalize("NFD", text.casefold())
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def _clean_canonical_name(name: str) -> str:
    cleaned = _collapse_ws(name)
    if cleaned.startswith("xã "):
        cleaned = "Xã " + cleaned[3:]
    elif cleaned.startswith("phường "):
        cleaned = "Phường " + cleaned[7:]
    elif cleaned.startswith("thị trấn "):
        cleaned = "Thị trấn " + cleaned[9:]
    return cleaned


def _split_canonical_prefix(full_name: str) -> Tuple[str, str]:
    cleaned = _clean_canonical_name(full_name)
    for pref in _CANON_PREFIXES:
        if cleaned.startswith(pref):
            return pref.strip(), cleaned[len(pref):].strip()
    return "", cleaned


@dataclass(frozen=True)
class _DivisionEntry:
    full: str
    short: str
    ascii_full: str
    ascii_short: str
    lower_full: str
    lower_short: str


def _make_entry(full_name: str) -> _DivisionEntry:
    cleaned = _clean_canonical_name(full_name)
    _, short = _split_canonical_prefix(cleaned)
    return _DivisionEntry(
        full=cleaned,
        short=short,
        ascii_full=_strip_accents_lower(cleaned).replace("-", " "),
        ascii_short=_strip_accents_lower(short).replace("-", " "),
        lower_full=cleaned.casefold(),
        lower_short=short.casefold(),
    )


def _strip_segment_prefix(seg: str, level: str) -> Tuple[str, bool, str]:
    """
    Strip optional administrative prefix from `seg` for matching.
    Returns (core_text, had_prefix, detected_prefix_hint).
    level in {'province', 'district', 'ward'}.
    """
    raw = _collapse_ws(seg)
    if not raw:
        return "", False, ""

    if level == "province":
        m = _STRICT_PROVINCE_PREFIX_RE.match(raw)
        if m:
            hint = _strip_accents_lower(m.group(0)).strip(" .")
            core = raw[m.end():].strip(" .-")
            return (core or raw), True, hint
        # Handle "TP.HCM" / "TP.HN" where '.' immediately precedes chars
        if re.match(r"^tp\.?\s*", raw, re.IGNORECASE):
            m2 = re.match(r"^tp\.?\s*", raw, re.IGNORECASE)
            if m2 and len(raw) > m2.end():
                return raw[m2.end():].strip(" .-"), True, "tp"
    elif level == "district":
        m = _STRICT_DISTRICT_PREFIX_RE.match(raw)
        if m:
            hint = _strip_accents_lower(m.group(0)).strip(" .")
            core = raw[m.end():].strip(" .-")
            return (core or raw), True, hint
    elif level == "ward":
        m = _STRICT_WARD_PREFIX_RE.match(raw)
        if m:
            hint = _strip_accents_lower(m.group(0)).strip(" .")
            core = raw[m.end():].strip(" .-")
            return (core or raw), True, hint
        # Unaccented "Xa <name>" when not starting with hamlet cue
        m_xa = re.match(r"^xa\s+(.+)$", raw, re.IGNORECASE)
        if m_xa:
            return m_xa.group(1).strip(), True, "xa"

    return raw, False, ""


class _VNAddressIndex:
    def __init__(self) -> None:
        self.provinces_by_ascii: Dict[str, _DivisionEntry] = {}
        self.all_province_entries: List[_DivisionEntry] = []

        # legacy: prov_full -> list of district entries & dist_full -> list of ward entries
        self.legacy_districts_by_prov: Dict[str, List[_DivisionEntry]] = {}
        self.legacy_wards_by_prov_dist: Dict[Tuple[str, str], List[_DivisionEntry]] = {}

        # 2025 2-tier: prov_full -> list of ward entries
        self.new2025_wards_by_prov: Dict[str, List[_DivisionEntry]] = {}

        self._load_datasets()

    def _register_province(self, entry: _DivisionEntry) -> None:
        if entry.ascii_short not in self.provinces_by_ascii:
            self.provinces_by_ascii[entry.ascii_short] = entry
            self.all_province_entries.append(entry)
        self.provinces_by_ascii.setdefault(entry.ascii_full, entry)

    def _load_datasets(self) -> None:
        if _NEW_2025_JSON_PATH.is_file():
            try:
                with open(_NEW_2025_JSON_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                for p in data:
                    p_entry = _make_entry(str(p.get("name") or ""))
                    if not p_entry.full:
                        continue
                    self._register_province(p_entry)
                    ward_map: Dict[str, _DivisionEntry] = {}
                    for w in p.get("wards") or []:
                        w_entry = _make_entry(str(w.get("name") or ""))
                        if w_entry.full:
                            ward_map.setdefault(w_entry.full, w_entry)
                    self.new2025_wards_by_prov[p_entry.full] = list(ward_map.values())
            except Exception as exc:
                logger.warning("Failed loading nested_divisions_2025.json: %s", exc)

        if _LEGACY_CSV_PATH.is_file():
            try:
                dist_seen: Dict[str, Dict[str, _DivisionEntry]] = {}
                ward_seen: Dict[Tuple[str, str], Dict[str, _DivisionEntry]] = {}
                with open(_LEGACY_CSV_PATH, "r", encoding="utf-8-sig", newline="") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        p_raw = _collapse_ws(row.get("Tỉnh Thành Phố") or "")
                        d_raw = _collapse_ws(row.get("Quận Huyện") or "")
                        w_raw = _collapse_ws(row.get("Phường Xã") or "")
                        if not p_raw:
                            continue
                        p_entry = _make_entry(p_raw)
                        self._register_province(p_entry)
                        if not d_raw:
                            continue
                        d_entry = _make_entry(d_raw)
                        dist_seen.setdefault(p_entry.full, {}).setdefault(d_entry.full, d_entry)
                        if w_raw:
                            w_entry = _make_entry(w_raw)
                            ward_seen.setdefault((p_entry.full, d_entry.full), {}).setdefault(w_entry.full, w_entry)

                for p_full, d_dict in dist_seen.items():
                    self.legacy_districts_by_prov[p_full] = list(d_dict.values())
                for key, w_dict in ward_seen.items():
                    self.legacy_wards_by_prov_dist[key] = list(w_dict.values())
            except Exception as exc:
                logger.warning("Failed loading gso_legacy_2025_01_04.csv: %s", exc)

        # Register aliases pointing to canonical province entries
        for alias, target_full in _PROVINCE_ALIASES.items():
            target_entry = self.provinces_by_ascii.get(_strip_accents_lower(target_full))
            if target_entry is not None:
                self.provinces_by_ascii.setdefault(alias, target_entry)

    def match_province(
        self,
        segment: str,
        confidence: Optional[float] = None,
    ) -> Optional[Tuple[_DivisionEntry, bool]]:
        raw = _collapse_ws(segment)
        if not raw:
            return None
        core, had_prefix, hint = _strip_segment_prefix(raw, "province")
        ascii_raw = _collapse_ws(_strip_accents_lower(raw).replace(".", " ").replace("-", " "))
        ascii_core = _collapse_ws(_strip_accents_lower(core).replace(".", " ").replace("-", " "))

        # Direct alias check (e.g., "TP.HCM", "HCM", "Thừa Thiên Huế", "Bà Rịa Vũng Tàu")
        if ascii_raw in self.provinces_by_ascii:
            entry = self.provinces_by_ascii[ascii_raw]
            explicit_tp = had_prefix or ascii_raw.startswith("tp") or ascii_raw.startswith("tinh")
            return entry, explicit_tp
        if ascii_core in self.provinces_by_ascii:
            entry = self.provinces_by_ascii[ascii_core]
            return entry, had_prefix

        matched = _match_entry(core, self.all_province_entries, confidence=confidence, allow_short_numeric=False)
        if matched is None:
            return None
        return matched, had_prefix

    def match_entry_in_list(
        self,
        segment: str,
        level: str,
        entries: List[_DivisionEntry],
        confidence: Optional[float] = None,
    ) -> Optional[Tuple[_DivisionEntry, bool, float]]:
        if not entries:
            return None
        raw = _collapse_ws(segment)
        if not raw:
            return None
        core, had_prefix, _ = _strip_segment_prefix(raw, level)
        if not had_prefix and _SUB_WARD_CUE_RE.match(raw):
            # Do not overwrite street/hamlet/village segments unless an admin prefix was present
            return None

        score_entry = _match_entry_with_score(
            core,
            entries,
            confidence=confidence,
            allow_short_numeric=had_prefix,
        )
        if score_entry is None:
            return None
        entry, score = score_entry
        return entry, had_prefix, score


def _match_entry(
    core_query: str,
    entries: List[_DivisionEntry],
    confidence: Optional[float] = None,
    allow_short_numeric: bool = False,
) -> Optional[_DivisionEntry]:
    res = _match_entry_with_score(
        core_query,
        entries,
        confidence=confidence,
        allow_short_numeric=allow_short_numeric,
    )
    return res[0] if res else None


def _match_entry_with_score(
    core_query: str,
    entries: List[_DivisionEntry],
    confidence: Optional[float] = None,
    allow_short_numeric: bool = False,
) -> Optional[Tuple[_DivisionEntry, float]]:
    q_clean = _collapse_ws(core_query)
    if not q_clean or not entries:
        return None

    q_lower = q_clean.casefold()
    q_ascii = _collapse_ws(_strip_accents_lower(q_clean).replace("-", " "))
    if not q_ascii:
        return None

    # 1. Exact accented match
    for ent in entries:
        if q_lower == ent.lower_short or q_lower == ent.lower_full:
            return ent, 1.0

    # 2. Exact accent-stripped match (breaks ties using accented character similarity)
    ascii_matches = [
        ent for ent in entries
        if q_ascii == ent.ascii_short or q_ascii == ent.ascii_full
    ]
    if ascii_matches:
        if len(ascii_matches) == 1:
            return ascii_matches[0], 0.98
        best_ent = max(
            ascii_matches,
            key=lambda e: difflib.SequenceMatcher(None, q_lower, e.lower_short).ratio(),
        )
        return best_ent, 0.98

    # Guard against matching very short/numeric strings (e.g. "Ấp 4", "Tổ 2") unless prefixed
    if q_ascii.isdigit() and not allow_short_numeric:
        return None
    if len(q_ascii) < 4:
        return None

    # 3. Bounded fuzzy matching (repairs 1-2 OCR char typos like Hoài Đúc / Vũng Liềm / Lệ Thủy)
    low_conf = confidence is not None and confidence < 85.0
    min_ratio = 0.82 if low_conf else 0.87
    q_words = q_ascii.split()

    scored: List[Tuple[float, _DivisionEntry]] = []
    for ent in entries:
        cand_len = len(ent.ascii_short)
        # Avoid over-correcting distinct pre-merger historical communes that differ only
        # by a trailing consonant (e.g. 'Thiệu Phú' vs 'Thiệu Phúc', 'Tân Phú' vs 'Tân Phúc')
        ent_words = ent.ascii_short.split()
        if not low_conf and len(q_words) == len(ent_words) and cand_len != len(q_ascii):
            continue
        if abs(cand_len - len(q_ascii)) > 2:
            continue
        r_ascii = difflib.SequenceMatcher(None, q_ascii, ent.ascii_short).ratio()
        if r_ascii < min_ratio:
            continue
        r_acc = difflib.SequenceMatcher(None, q_lower, ent.lower_short).ratio()
        combined = 0.80 * r_ascii + 0.20 * r_acc
        scored.append((combined, ent))

    if not scored:
        return None

    scored.sort(key=lambda t: t[0], reverse=True)
    best_score, best_ent = scored[0]
    if len(scored) > 1:
        second_score, _ = scored[1]
        # Require clear margin if there's another very close candidate with different ASCII core
        if (best_score - second_score) < 0.03 and scored[1][1].ascii_short != best_ent.ascii_short:
            return None

    return best_ent, best_score


def _format_entry_output(entry: _DivisionEntry, had_prefix: bool) -> str:
    return entry.full if had_prefix else entry.short


def _match_prefix_case(matched_text: str, canonical: str) -> str:
    if matched_text.isupper() and len(matched_text) >= 2:
        return canonical.upper()
    if matched_text and matched_text[0].islower():
        return canonical[0].lower() + canonical[1:]
    return canonical


def _normalize_sub_ward_segment(segment: str) -> str:
    """
    Repair common Vietnamese sub-ward unit diacritic loss (e.g., 'Áp 4' / 'Ap 4' -> 'Ấp 4',
    'Thon Tiền Lệ' -> 'Thôn Tiền Lệ', 'To 5' -> 'Tổ 5') while leaving proper names intact.
    """
    cleaned = _collapse_ws(segment)
    if not cleaned:
        return cleaned
    for pattern, canonical in _SUB_WARD_UNIT_RULES:
        m = pattern.match(cleaned)
        if m:
            repl = _match_prefix_case(m.group(1), canonical)
            return repl + cleaned[m.end():]
    return cleaned


def _expand_abbreviated_admin_prefix(segment: str, level: str) -> str:
    """Expand abbreviated Vietnamese admin prefixes like 'X.', 'P.', 'TT.', 'H.', 'Q.', 'TX.' when unmatched."""
    raw = _collapse_ws(segment)
    if not raw:
        return raw
    if level == "ward":
        rules = (
            (r"^x\.\s*", "Xã "),
            (r"^p\.\s*", "Phường "),
            (r"^tt\.\s*", "Thị trấn "),
        )
    elif level == "district":
        rules = (
            (r"^h\.\s*", "Huyện "),
            (r"^q\.\s*", "Quận "),
            (r"^tx\.\s*", "Thị xã "),
            (r"^tp\.\s*", "Thành phố "),
        )
    else:
        return raw
    for pat, repl in rules:
        m = re.match(pat, raw, flags=re.IGNORECASE)
        if m:
            rest = raw[m.end():].strip()
            if rest:
                return f"{repl}{rest}"
    return raw


def _get_index() -> _VNAddressIndex:
    global _CACHED_INDEX
    if _CACHED_INDEX is not None:
        return _CACHED_INDEX
    with _INDEX_LOCK:
        if _CACHED_INDEX is None:
            _CACHED_INDEX = _VNAddressIndex()
        return _CACHED_INDEX


def normalize_vietnamese_address(
    address: Optional[str],
    confidence: Optional[float] = None,
) -> Optional[str]:
    """
    Normalize a comma-separated Vietnamese administrative address using official
    GSO (63-province 3-tier legacy) and NSO (34-province 2-tier 2025) datasets.
    - Repairs missing/corrupted Vietnamese diacritics and minor OCR character typos
      in Province, District, and Ward/Commune names.
    - Preserves prefix style (e.g. 'Tiền Yên, Hoài Đức, Hà Nội' stays short while
      'Xã Trung Nghia, H. Vũng Liềm, Tỉnh Vĩnh Long' -> 'Xã Trung Nghĩa, Huyện Vũng Liêm, Tỉnh Vĩnh Long').
    - Preserves leading street numbers, hamlets, villages, and residential groups untouched.
    """
    if address is None or not isinstance(address, str):
        return address

    raw_clean = _collapse_ws(address)
    if not raw_clean:
        return address

    parts = [_collapse_ws(p) for p in raw_clean.split(",") if _collapse_ws(p)]
    if not parts:
        return raw_clean

    idx = _get_index()
    prov_match = idx.match_province(parts[-1], confidence=confidence)
    if prov_match is None:
        return ", ".join(parts)

    prov_entry, prov_had_prefix = prov_match
    normalized_tail: List[str] = [_format_entry_output(prov_entry, prov_had_prefix)]

    if len(parts) == 1:
        return normalized_tail[0]

    prev_seg = parts[-2]
    _, prev_had_ward_prefix, ward_hint = _strip_segment_prefix(prev_seg, "ward")
    _, prev_had_dist_prefix, dist_hint = _strip_segment_prefix(prev_seg, "district")
    prefer_ward_2025 = bool(
        prev_had_ward_prefix and ward_hint in ("phuong", "p", "xa", "x", "thi tran", "tt", "dac khu")
    ) and not bool(prev_had_dist_prefix and dist_hint in ("quan", "q", "huyen", "h", "thi xa", "tx"))

    legacy_dists = idx.legacy_districts_by_prov.get(prov_entry.full, [])
    new_wards = idx.new2025_wards_by_prov.get(prov_entry.full, [])

    dist_match = (
        None
        if prefer_ward_2025
        else idx.match_entry_in_list(prev_seg, "district", legacy_dists, confidence=confidence)
    )
    ward2025_match = idx.match_entry_in_list(prev_seg, "ward", new_wards, confidence=confidence)

    use_legacy_3tier = False
    if dist_match is not None and ward2025_match is not None:
        # If len >= 3, check whether parts[-3] looks like a ward inside this legacy district
        if len(parts) >= 3:
            cand_wards = idx.legacy_wards_by_prov_dist.get((prov_entry.full, dist_match[0].full), [])
            w3 = idx.match_entry_in_list(parts[-3], "ward", cand_wards, confidence=confidence)
            if w3 is not None:
                use_legacy_3tier = True
            else:
                use_legacy_3tier = dist_match[2] >= ward2025_match[2]
        else:
            use_legacy_3tier = dist_match[2] >= ward2025_match[2]
    elif dist_match is not None:
        use_legacy_3tier = True
    elif ward2025_match is not None:
        use_legacy_3tier = False

    consumed_from_right = 1
    if use_legacy_3tier and dist_match is not None:
        dist_entry, dist_had_prefix, _ = dist_match
        normalized_tail.insert(0, _format_entry_output(dist_entry, dist_had_prefix))
        consumed_from_right = 2

        if len(parts) >= 3:
            ward_seg = parts[-3]
            cand_wards = idx.legacy_wards_by_prov_dist.get((prov_entry.full, dist_entry.full), [])
            ward_match = idx.match_entry_in_list(ward_seg, "ward", cand_wards, confidence=confidence)
            if ward_match is not None:
                ward_entry, ward_had_prefix, _ = ward_match
                normalized_tail.insert(0, _format_entry_output(ward_entry, ward_had_prefix))
                consumed_from_right = 3
            else:
                expanded_ward = _expand_abbreviated_admin_prefix(ward_seg, "ward")
                if expanded_ward != ward_seg:
                    normalized_tail.insert(0, expanded_ward)
                    consumed_from_right = 3
    elif ward2025_match is not None:
        ward_entry, ward_had_prefix, _ = ward2025_match
        normalized_tail.insert(0, _format_entry_output(ward_entry, ward_had_prefix))
        consumed_from_right = 2
    elif len(parts) >= 2:
        expanded_prev = _expand_abbreviated_admin_prefix(prev_seg, "ward" if prefer_ward_2025 else "district")
        if expanded_prev != prev_seg:
            normalized_tail.insert(0, expanded_prev)
            consumed_from_right = 2

    prefix_parts = [_normalize_sub_ward_segment(p) for p in parts[: len(parts) - consumed_from_right]]
    return ", ".join(prefix_parts + normalized_tail)
