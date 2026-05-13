"""
Google Places API — 附近旅館 & 餐廳搜尋
資料來源：Google Places Nearby Search API
"""
import httpx, os
from dotenv import load_dotenv
load_dotenv()

KEY = os.getenv("GOOGLE_MAPS_API_KEY")

# price_level → 住宿碳排類別
PRICE_TO_HOTEL = {
    0: "hostel",    # 免費/背包
    1: "hostel",    # 便宜
    2: "standard",  # 中等
    3: "business",  # 貴
    4: "luxury",    # 非常貴
}

# Google Places type → 飲食碳排類別
TYPE_TO_FOOD = {
    "vegan_restaurant":        "vegan",
    "vegetarian_restaurant":   "veggie",
    "seafood_restaurant":      "seafood",
    "fast_food_restaurant":    "fastfood",
    "hamburger_restaurant":    "fastfood",
    "steak_house":             "meat",
    "barbecue_restaurant":     "meat",
    "korean_restaurant":       "meat",
}

HOTEL_LABEL = {
    "camping": "露營", "hostel": "民宿/背包客棧",
    "eco": "環保旅館", "standard": "一般旅館",
    "business": "商務飯店", "luxury": "五星飯店",
}
HOTEL_CO2 = {
    "camping": 2, "hostel": 6, "eco": 8,
    "standard": 12, "business": 18, "luxury": 25,
}
FOOD_LABEL = {
    "vegan": "有機素食", "veggie": "素食",
    "seafood": "海鮮", "general": "一般餐食",
    "meat": "葷食", "fastfood": "速食",
}
FOOD_CO2 = {
    "vegan": 0.8, "veggie": 1.2, "seafood": 2.8,
    "general": 2.5, "meat": 3.5, "fastfood": 3.2,
}


async def _nearby(lat, lng, place_type, radius, keyword=""):
    params = {
        "location":  f"{lat},{lng}",
        "radius":    radius,
        "type":      place_type,
        "language":  "zh-TW",
        "key":       KEY,
    }
    if keyword:
        params["keyword"] = keyword

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
            params=params, timeout=10,
        )
        data = resp.json()

    if data.get("status") not in ("OK", "ZERO_RESULTS"):
        return []
    return data.get("results", [])


def _infer_hotel_category(name: str, price_level) -> str:
    """名稱關鍵字推斷 + price_level fallback"""
    if price_level is not None:
        return PRICE_TO_HOTEL.get(price_level, "standard")
    n = name
    if any(k in n for k in ["民宿", "背包", "青旅", "青年旅", "Hostel", "hostel"]):
        return "hostel"
    if any(k in n for k in ["露營", "營地", "Camp", "camp"]):
        return "camping"
    if any(k in n for k in ["環保", "綠色", "永續", "Eco", "eco"]):
        return "eco"
    if any(k in n for k in [
        "五星", "君悅", "晶華", "喜來登", "萬豪", "洲際", "文華", "寒舍",
        "麗池", "麗緻", "W飯店", "Four Seasons", "Regent", "Grand Hyatt"
    ]):
        return "luxury"
    if any(k in n for k in [
        "商務", "凱撒", "漢來", "遠東", "老爺", "六福", "劍橋", "福華",
        "國賓", "長榮桂冠", "慕軒", "薆悅", "英迪格", "Indigo"
    ]):
        return "business"
    return "standard"


async def search_hotels(lat: float, lng: float, radius: int = 3000):
    results = await _nearby(lat, lng, "lodging", radius)
    hotels = []
    for r in results[:10]:
        raw_price = r.get("price_level")          # None if missing
        category  = _infer_hotel_category(r.get("name", ""), raw_price)
        hotels.append({
            "place_id":       r.get("place_id"),
            "name":           r.get("name"),
            "address":        r.get("vicinity", ""),
            "rating":         r.get("rating"),
            "user_ratings_total": r.get("user_ratings_total", 0),
            "price_level":    raw_price,
            "category":       category,
            "category_label": HOTEL_LABEL[category],
            "co2_per_night":  HOTEL_CO2[category],
            "photo":          _photo_url(r),
        })
    return hotels


async def search_restaurants(lat: float, lng: float, radius: int = 1500):
    results = await _nearby(lat, lng, "restaurant", radius)
    restaurants = []
    for r in results[:12]:
        types  = r.get("types", [])
        # 從 types 列表找對應的飲食碳排類別
        category = "general"
        for t in types:
            if t in TYPE_TO_FOOD:
                category = TYPE_TO_FOOD[t]
                break

        restaurants.append({
            "place_id": r.get("place_id"),
            "name":     r.get("name"),
            "address":  r.get("vicinity", ""),
            "rating":   r.get("rating"),
            "types":    types[:3],
            "category": category,
            "category_label": FOOD_LABEL[category],
            "co2_per_meal":   FOOD_CO2[category],
            "photo":    _photo_url(r),
        })
    return restaurants


def _photo_url(place: dict) -> str:
    photos = place.get("photos")
    if not photos:
        return ""
    ref = photos[0].get("photo_reference", "")
    return f"/api/place-photo?ref={ref}" if ref else ""
