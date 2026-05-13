"""
碳排計算服務
資料來源：環境部國家溫室氣體排放清冊
https://www.cca.gov.tw
"""
import math

TRANSPORT_FACTORS = {
    "walking":  0,
    "cycling":  0,
    "mrt":      41,
    "train":    41,
    "hsr":      27,
    "bus":      68,
    "scooter":  91,
    "car":      170,
    "taxi":     170,
}

HOTEL_FACTORS = {
    "camping":   2,
    "hostel":    6,
    "eco":       8,
    "standard": 12,
    "business": 18,
    "luxury":   25,
}

FOOD_FACTORS = {
    "vegan":    0.8,
    "veggie":   1.2,
    "seafood":  2.8,
    "general":  2.5,
    "meat":     3.5,
    "fastfood": 3.2,
}

def calc_transport(distance_km, mode, units=1):
    return round(distance_km * TRANSPORT_FACTORS.get(mode, 0) * units / 1000, 2)

def calc_hotel(hotel_type, nights):
    return round(HOTEL_FACTORS.get(hotel_type, 12) * nights, 2)

def calc_food(food_type, meals):
    return round(FOOD_FACTORS.get(food_type, 2.5) * meals, 2)

def trees_needed(co2_kg):
    return max(1, math.ceil(co2_kg / 12))

def trip_score(co2_kg, car_co2):
    if car_co2 == 0:
        return 100
    ratio = co2_kg / car_co2
    return max(0, min(100, int(100 - (ratio - 1) * 30)))