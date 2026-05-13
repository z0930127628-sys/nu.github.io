"""
Taiwan government eco-certified restaurants & hotels
Data: greenliving.moenv.gov.tw (環境部 淨零綠生活)
"""
import httpx, math, time, warnings
warnings.filterwarnings("ignore", message="Unverified HTTPS request")

BASE = "https://greenliving.moenv.gov.tw/newPublic/APIs"
_cache: dict = {}
_TTL = 86400  # 24-hour in-memory cache

HOTEL_CO2 = {"金": 7, "銀": 9, "銅": 11}
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GreenTravel/1.0)"}


def _haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def _fetch(key: str, url: str, params: dict | None = None) -> list:
    now = time.time()
    if key in _cache and now - _cache[key]["ts"] < _TTL:
        return _cache[key]["data"]
    async with httpx.AsyncClient(timeout=30, verify=False) as c:
        r = await c.get(url, params=params or {}, headers=_HEADERS)
        d = r.json()
    items = d.get("Detail", [])
    _cache[key] = {"data": items, "ts": now}
    return items


async def get_nearby_eco_restaurants(lat: float, lng: float,
                                     radius_km: float = 2.0, limit: int = 10):
    raw = await _fetch("restaurants", f"{BASE}/RestaurantGIS")
    nearby = []
    for r in raw:
        rlat, rlng = r.get("Latitude"), r.get("Longitude")
        if not (rlat and rlng):
            continue
        dist = _haversine(lat, lng, float(rlat), float(rlng))
        if dist > radius_km:
            continue
        pics = r.get("RestPicList", [])
        nearby.append({
            "id":            r.get("Id"),
            "name":          r.get("Name", ""),
            "lat":           float(rlat),
            "lng":           float(rlng),
            "photo":         pics[0].get("RestUrl", "") if pics else "",
            "cert_no":       r.get("RestNo", ""),
            "category":      "veggie",
            "co2_per_meal":  1.2,
            "category_label":"環保餐食認證",
            "distance_km":   round(dist, 2),
            "is_eco_certified": True,
        })
    nearby.sort(key=lambda x: x["distance_km"])
    return nearby[:limit]


async def get_nearby_eco_hotels(lat: float, lng: float,
                                radius_km: float = 5.0, limit: int = 8):
    raw = await _fetch("hotels", f"{BASE}/HotelsGIS", {"h": 2})
    nearby = []
    for r in raw:
        rlat, rlng = r.get("Lat"), r.get("Lon")
        if not (rlat and rlng):
            continue
        dist = _haversine(lat, lng, float(rlat), float(rlng))
        if dist > radius_km:
            continue
        memo = r.get("Memo", "")
        cert = "金" if "金" in memo else ("銀" if "銀" in memo else "銅")
        nearby.append({
            "id":            r.get("Num"),
            "name":          r.get("Name", "").strip(),
            "lat":           float(rlat),
            "lng":           float(rlng),
            "photo":         r.get("ImgByte", ""),
            "cert_label":    memo or f"{cert}級環保旅宿",
            "co2_per_night": HOTEL_CO2[cert],
            "category":      "eco",
            "category_label":f"{cert}級環保旅宿",
            "distance_km":   round(dist, 2),
            "is_eco_certified": True,
        })
    nearby.sort(key=lambda x: x["distance_km"])
    return nearby[:limit]
