"""
Google Maps API
資料來源：Google Maps Directions API + Geocoding API
"""
import httpx, os
from dotenv import load_dotenv
load_dotenv()

KEY = os.getenv("GOOGLE_MAPS_API_KEY")

TRANSIT_MAP = {
    "SUBWAY": "mrt", "RAIL": "train", "HEAVY_RAIL": "train",
    "HIGH_SPEED_TRAIN": "hsr", "BUS": "bus", "TRAM": "bus",
}

async def get_directions(origin, destination, mode="transit", transit_mode_filter="rail|bus"):
    params = {
        "origin":      f"{origin} 台灣",
        "destination": f"{destination} 台灣",
        "mode":        mode,
        "language":    "zh-TW",
        "region":      "TW",
        "key":         KEY,
    }
    if mode == "transit":
        params["transit_mode"] = transit_mode_filter

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://maps.googleapis.com/maps/api/directions/json",
            params=params, timeout=10,
        )
        data = resp.json()

    if data.get("status") != "OK":
        return None

    leg   = data["routes"][0]["legs"][0]
    steps = []
    total_dist = 0
    total_dur  = 0

    for s in leg["steps"]:
        dist_km = round(s["distance"]["value"] / 1000, 2)
        dur_min = round(s["duration"]["value"] / 60, 1)
        total_dist += s["distance"]["value"]
        total_dur  += s["duration"]["value"]

        step = {
            "mode": s["travel_mode"].lower(),
            "distance_km": dist_km,
            "duration_min": dur_min,
            "instruction": s.get("html_instructions", ""),
        }

        if s["travel_mode"] == "TRANSIT" and "transit_details" in s:
            td        = s["transit_details"]
            line      = td.get("line", {})
            vtype     = line.get("vehicle", {}).get("type", "BUS")
            line_name = line.get("short_name") or line.get("name", "")
            mode      = TRANSIT_MAP.get(vtype, "bus")
            # Google Maps 把台鐵（區間車/自強/莒光等）回傳成 BUS，在此修正
            import re
            if mode == "bus" and re.search(r"區間|自強|莒光|太魯閣|普悠瑪|普快", line_name):
                mode = "train"
            step.update({
                "mode":      mode,
                "line_name": line_name,
                "dep_stop":  td.get("departure_stop", {}).get("name", ""),
                "arr_stop":  td.get("arrival_stop", {}).get("name", ""),
                "departure": td.get("departure_time", {}).get("text", ""),
                "arrival":   td.get("arrival_time", {}).get("text", ""),
                "num_stops": td.get("num_stops", 0),
            })
        elif s["travel_mode"] == "WALKING":
            step["mode"] = "walking"
        elif s["travel_mode"] == "BICYCLING":
            step["mode"] = "cycling"
        elif s["travel_mode"] == "DRIVING":
            step["mode"] = "car"

        steps.append(step)

    return {
        "origin":           leg["start_address"],
        "destination":      leg["end_address"],
        "total_distance_km": round(total_dist / 1000, 1),
        "total_duration_min": round(total_dur / 60, 1),
        "steps":            steps,
        "polyline":         data["routes"][0]["overview_polyline"]["points"],
    }

async def geocode(address):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": f"{address} 台灣", "language": "zh-TW", "region": "TW", "key": KEY},
            timeout=10,
        )
        data = resp.json()

    if data.get("status") != "OK":
        return None

    result = data["results"][0]
    loc    = result["geometry"]["location"]
    city   = ""
    for comp in result["address_components"]:
        if "administrative_area_level_1" in comp["types"]:
            city = comp["long_name"]
            break

    return {
        "address": result["formatted_address"],
        "lat": loc["lat"],
        "lng": loc["lng"],
        "city": city,
    }