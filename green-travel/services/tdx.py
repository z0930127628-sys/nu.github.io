"""
TDX 交通資料流通服務平台
https://tdx.transportdata.tw
"""
import httpx, os
from dotenv import load_dotenv
from datetime import datetime, timedelta
load_dotenv()

CLIENT_ID     = os.getenv("TDX_CLIENT_ID")
CLIENT_SECRET = os.getenv("TDX_CLIENT_SECRET")
TDX_AUTH      = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token"
TDX_BASE      = "https://tdx.transportdata.tw/api/basic/v2"

_cache = {"token": None, "expires_at": None}

CITY_MAP = {
    "臺北市": ["臺北", "台北"], "新北市": ["新北", "板橋"],
    "桃園市": ["桃園", "中壢"], "臺中市": ["臺中", "台中"],
    "臺南市": ["臺南", "台南"], "高雄市": ["高雄", "鳳山"],
    "花蓮縣": ["花蓮"],         "宜蘭縣": ["宜蘭", "羅東"],
    "屏東縣": ["屏東", "恆春"], "嘉義市": ["嘉義"],
    "南投縣": ["南投", "埔里", "清境", "日月潭"],
    "苗栗縣": ["苗栗"],         "彰化縣": ["彰化"],
    "雲林縣": ["雲林", "斗六"], "基隆市": ["基隆"],
    "新竹市": ["新竹"],         "臺東縣": ["臺東", "台東"],
    "澎湖縣": ["澎湖"],
}

async def get_token():
    now = datetime.now()
    if _cache["token"] and _cache["expires_at"] > now:
        return _cache["token"]
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            TDX_AUTH,
            data={"grant_type": "client_credentials", "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        data = resp.json()
    _cache["token"]      = data["access_token"]
    _cache["expires_at"] = now + timedelta(seconds=data["expires_in"] - 60)
    return _cache["token"]

def detect_city(address, keyword=""):
    for city, keywords in CITY_MAP.items():
        if any(kw in address or kw in keyword for kw in keywords):
            return city
    return "臺北市"

async def get_spots(city, top=5):
    token = await get_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TDX_BASE}/Tourism/ScenicSpot",
            params={"$filter": f"City eq '{city}'", "$top": top, "$format": "JSON"},
            headers={"Authorization": f"Bearer {token}"}, timeout=10,
        )
        data = resp.json()
    if not isinstance(data, list):
        return []
    return [{"name": s.get("ScenicSpotName",""), "address": s.get("Address",""),
             "ticket": s.get("TicketInfo",""), "travel": s.get("TravelInfo",""),
             "desc": (s.get("Description","") or "")[:60]} for s in data if s.get("ScenicSpotName")]

async def get_hotels(city, top=5):
    token = await get_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TDX_BASE}/Tourism/Hotel",
            params={"$filter": f"City eq '{city}'", "$top": top, "$format": "JSON"},
            headers={"Authorization": f"Bearer {token}"}, timeout=10,
        )
        data = resp.json()
    if not isinstance(data, list):
        return []
    return [{"name": h.get("HotelName",""), "address": h.get("Address",""),
             "grade": h.get("Grade",""), "phone": h.get("Phone","")} for h in data if h.get("HotelName")]