"""
碳索世界 綠遨遊 — 後端主程式
FastAPI + Google Maps + TDX
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
import math, os
from urllib.parse import quote
from dotenv import load_dotenv
load_dotenv()

MAPS_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

from services.carbon import (
    calc_transport, calc_hotel, calc_food,
    trees_needed, trip_score,
    HOTEL_FACTORS, FOOD_FACTORS, TRANSPORT_FACTORS
)
from services.google_maps import get_directions, geocode
from services.tdx import detect_city, get_spots, get_hotels
from services.google_places import search_hotels, search_restaurants
from services.eco_certified import get_nearby_eco_restaurants, get_nearby_eco_hotels

app = FastAPI(title="碳索世界 API 🌿")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# ── 資料模型 ──────────────────────────────────────────

class TripRequest(BaseModel):
    origin: str
    destination: str
    passengers: int = 1

class HotelRequest(BaseModel):
    hotel_type: str
    nights: int
    city: Optional[str] = ""

class FoodRequest(BaseModel):
    food_type: str
    meals: int

# ── API 路由 ──────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "碳索世界後端啟動成功 🌿"}

@app.post("/api/trip")
async def calc_trip(req: TripRequest):
    """
    計算旅程碳排
    串接 Google Maps 取得真實路線
    """
    passengers = req.passengers

    # 6 路並行查詢
    import asyncio
    rail_data, bus_data, driving_data, bike_data, walk_data = await asyncio.gather(
        get_directions(req.origin, req.destination, "transit", "rail"),
        get_directions(req.origin, req.destination, "transit", "bus"),
        get_directions(req.origin, req.destination, "driving"),
        get_directions(req.origin, req.destination, "bicycling"),
        get_directions(req.origin, req.destination, "walking"),
    )

    any_data = rail_data or bus_data or driving_data or bike_data
    if not any_data:
        return {"error": "找不到路線，請確認地點名稱"}

    options = []
    seen_types = set()   # 去重：避免同標籤出現兩次

    def make_map_url(polyline: str) -> str:
        return f"/api/route-map?polyline={quote(polyline)}" if polyline else ""

    def make_gmaps_url(origin: str, dest: str, mode: str = "transit") -> str:
        from urllib.parse import quote as q
        return f"https://www.google.com/maps/dir/{q(origin + ' 台灣')}/{q(dest + ' 台灣')}/?travelmode={mode}"

    def add_transit(data):
        if not data:
            return
        steps     = data["steps"]
        total_co2 = round(sum(
            calc_transport(s["distance_km"], s["mode"], passengers)
            for s in steps
        ), 2)
        has_hsr   = any(s["mode"] == "hsr"   for s in steps)
        has_train = any(s["mode"] == "train"  for s in steps)
        has_mrt   = any(s["mode"] == "mrt"    for s in steps)
        has_bus   = any(s["mode"] == "bus"    for s in steps)

        # 按搭乘順序組合標籤（最多三種主要交通）
        parts = []
        if has_train: parts.append("台鐵")
        if has_hsr:   parts.append("高鐵")
        if has_mrt:   parts.append("捷運")
        if has_bus and not (has_train or has_hsr or has_mrt):
            parts.append("公車")

        if parts:
            label = " ＋ ".join(parts)
            # 圖示用最主要的交通工具
            icon = "🚄" if has_hsr else ("🚆" if has_train else ("🚇" if has_mrt else "🚌"))
        else:
            label, icon = "大眾運輸", "🚌"

        # 純公車路線
        if has_bus and not has_hsr and not has_train and not has_mrt:
            label, icon = "公車", "🚌"

        if label in seen_types:
            return
        seen_types.add(label)

        options.append({
            "type":         label,
            "icon":         icon,
            "carbon_kg":    total_co2,
            "carbon_per":   round(total_co2 / passengers, 2),
            "cost_twd":     estimate_transit_cost(data["total_distance_km"], passengers),
            "duration_min": data["total_duration_min"],
            "distance_km":  data["total_distance_km"],
            "steps":        steps,
            "note":         f"{passengers} 人・Google Maps",
            "map_url":      make_map_url(data.get("polyline", "")),
            "gmaps_url":    make_gmaps_url(req.origin, req.destination, "transit"),
        })

    add_transit(rail_data)

    # 公車：只在與鐵路明顯不同（差 > 15 分）才加
    if bus_data and rail_data:
        if abs(bus_data["total_duration_min"] - rail_data["total_duration_min"]) > 15:
            add_transit(bus_data)
    elif bus_data:
        add_transit(bus_data)

    # 參考距離（給汽機車 / 腳踏車 / 走路用）
    ref      = driving_data or rail_data or bus_data
    ref_dist = ref["total_distance_km"]
    ref_dur  = driving_data["total_duration_min"] if driving_data else round(ref["total_duration_min"] * 0.65)
    ref_poly = (driving_data or ref).get("polyline", "")
    ref_steps = driving_data["steps"] if driving_data else []

    # 汽車
    cars    = math.ceil(passengers / 5)
    car_co2 = round(calc_transport(ref_dist, "car", cars), 2)
    options.append({
        "type":         "汽車",
        "icon":         "🚗",
        "carbon_kg":    car_co2,
        "carbon_per":   round(car_co2 / passengers, 2),
        "cost_twd":     round(ref_dist * 3.5) * cars,
        "duration_min": ref_dur,
        "distance_km":  ref_dist,
        "steps":        ref_steps,
        "note":         f"需要 {cars} 台車" + ("（距離估算）" if not driving_data else ""),
        "map_url":      make_map_url(ref_poly),
        "gmaps_url":    make_gmaps_url(req.origin, req.destination, "driving"),
    })

    # 機車
    scooters = math.ceil(passengers / 2)
    sc_co2   = round(calc_transport(ref_dist, "scooter", scooters), 2)
    options.append({
        "type":         "機車",
        "icon":         "🛵",
        "carbon_kg":    sc_co2,
        "carbon_per":   round(sc_co2 / passengers, 2),
        "cost_twd":     round(ref_dist * 1.5) * scooters,
        "duration_min": round(ref_dur * 1.1),
        "distance_km":  ref_dist,
        "steps":        [],
        "note":         f"需要 {scooters} 台機車",
        "map_url":      "",
        "gmaps_url":    make_gmaps_url(req.origin, req.destination, "driving"),
    })

    # 腳踏車（Google Maps bicycling 回傳）
    if bike_data and bike_data["total_duration_min"] <= 180:  # 上限 3 小時
        options.append({
            "type":         "腳踏車",
            "icon":         "🚲",
            "carbon_kg":    0,
            "carbon_per":   0,
            "cost_twd":     0,
            "duration_min": bike_data["total_duration_min"],
            "distance_km":  bike_data["total_distance_km"],
            "steps":        bike_data["steps"],
            "note":         "零碳排",
            "map_url":      make_map_url(bike_data.get("polyline", "")),
            "gmaps_url":    make_gmaps_url(req.origin, req.destination, "bicycling"),
        })

    # 走路（限 90 分鐘以內）
    if walk_data and walk_data["total_duration_min"] <= 90:
        options.append({
            "type":         "走路",
            "icon":         "🚶",
            "carbon_kg":    0,
            "carbon_per":   0,
            "cost_twd":     0,
            "duration_min": walk_data["total_duration_min"],
            "distance_km":  walk_data["total_distance_km"],
            "steps":        walk_data["steps"],
            "note":         "零碳排",
            "map_url":      make_map_url(walk_data.get("polyline", "")),
            "gmaps_url":    make_gmaps_url(req.origin, req.destination, "walking"),
        })

    # 按每人碳排排序
    options.sort(key=lambda x: x["carbon_per"])

    # 基準：自駕碳排（用來計算評分）
    car_co2    = next((o["carbon_kg"] for o in options if o["type"] == "汽車"), 0)
    best_co2   = options[0]["carbon_kg"] if options else 0
    score      = trip_score(best_co2, car_co2)

    # 取目的地座標 → 判斷城市
    dest_geo   = await geocode(req.destination)
    city       = detect_city(
        dest_geo["address"] if dest_geo else "",
        req.destination
    )

    # 抓景點
    spots = await get_spots(city)

    dest_lat = dest_geo["lat"] if dest_geo else None
    dest_lng = dest_geo["lng"] if dest_geo else None

    return {
        "route":        f"{req.origin} → {req.destination}",
        "passengers":   passengers,
        "options":      options,
        "summary": {
            "best_option":  options[0]["type"] if options else "",
            "best_co2":     best_co2,
            "car_co2":      car_co2,
            "trees":        trees_needed(best_co2),
            "score":        score,
        },
        "spots":   spots,
        "city":    city,
        "dest_lat": dest_lat,
        "dest_lng": dest_lng,
        "sources": {
            "routes":  "Google Maps Directions API",
            "carbon":  "環境部國家溫室氣體排放清冊",
            "spots":   "TDX 觀光署景點 API",
        }
    }

@app.post("/api/hotel")
async def calc_hotel_api(req: HotelRequest):
    """計算住宿碳排"""
    co2 = calc_hotel(req.hotel_type, req.nights)
    hotels = await get_hotels(req.city) if req.city else []
    return {
        "hotel_type": req.hotel_type,
        "nights":     req.nights,
        "carbon_kg":  co2,
        "cost_est":   estimate_hotel_cost(req.hotel_type, req.nights),
        "trees":      trees_needed(co2),
        "nearby":     hotels,
        "source":     "行政院環保署旅宿碳排資料",
    }

@app.post("/api/food")
async def calc_food_api(req: FoodRequest):
    """計算飲食碳排"""
    co2 = calc_food(req.food_type, req.meals)
    return {
        "food_type": req.food_type,
        "meals":     req.meals,
        "carbon_kg": co2,
        "source":    "農委會食物碳足跡資料庫",
    }

@app.get("/api/factors")
def get_factors():
    """取得所有碳排係數"""
    return {
        "transport": TRANSPORT_FACTORS,
        "hotel":     HOTEL_FACTORS,
        "food":      FOOD_FACTORS,
        "sources": {
            "transport": "環境部國家溫室氣體排放清冊",
            "hotel":     "行政院環保署旅宿碳排資料",
            "food":      "農委會食物碳足跡資料庫",
        }
    }

# ── 工具函式 ──────────────────────────────────────────

def estimate_transit_cost(distance_km, passengers):
    return round(distance_km * 2.0) * passengers

def estimate_hotel_cost(hotel_type, nights):
    costs = {
        "camping": 500, "hostel": 800, "eco": 1200,
        "standard": 1800, "business": 3000, "luxury": 6000,
    }
    return costs.get(hotel_type, 1800) * nights

# ── Places 搜尋 ───────────────────────────────────────

@app.get("/api/nearby-hotels")
async def nearby_hotels(lat: float, lng: float, radius: int = 3000):
    """搜尋目的地附近旅館，依 price_level 對應碳排類別"""
    return {"hotels": await search_hotels(lat, lng, radius)}

@app.get("/api/nearby-restaurants")
async def nearby_restaurants(lat: float, lng: float, radius: int = 1500):
    """搜尋目的地附近餐廳，依類型對應飲食碳排類別"""
    return {"restaurants": await search_restaurants(lat, lng, radius)}

@app.get("/api/eco-hotels")
async def eco_hotels_api(lat: float, lng: float, radius: float = 5.0):
    """環境部認證環保旅宿（綠色旅宿）"""
    return {"hotels": await get_nearby_eco_hotels(lat, lng, radius)}

@app.get("/api/eco-restaurants")
async def eco_restaurants_api(lat: float, lng: float, radius: float = 2.0):
    """環境部認證環保餐食"""
    return {"restaurants": await get_nearby_eco_restaurants(lat, lng, radius)}

@app.get("/api/place-photo")
async def place_photo(ref: str, maxwidth: int = 400):
    """代理 Google Places 照片，避免在前端暴露 API Key"""
    import httpx
    url = (
        f"https://maps.googleapis.com/maps/api/place/photo"
        f"?maxwidth={maxwidth}&photo_reference={ref}&key={MAPS_KEY}"
    )
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, timeout=10, follow_redirects=True)
    return Response(content=resp.content, media_type=resp.headers.get("content-type","image/jpeg"))

# ── 地圖代理 ──────────────────────────────────────────

@app.get("/api/route-map")
async def get_route_map(polyline: str, w: int = 356, h: int = 160):
    """代理 Google Maps Static API，避免在前端暴露 API Key"""
    import httpx
    url = (
        "https://maps.googleapis.com/maps/api/staticmap"
        f"?size={w}x{h}"
        f"&path=color:0x2d5e3aff|weight:4|enc:{polyline}"
        f"&maptype=roadmap"
        f"&key={MAPS_KEY}"
    )
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, timeout=15)
    return Response(content=resp.content, media_type="image/png")

# ── 靜態檔案 ──────────────────────────────────────────
app.mount("/", StaticFiles(directory="static", html=True), name="static")