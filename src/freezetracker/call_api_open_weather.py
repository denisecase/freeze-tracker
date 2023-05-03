"""
Call an API from Open Weather to get current temperatures.

"""

import json

import requests

from freezetracker.common_logger import get_logger
from freezetracker.data_load_config import read_config

logger = get_logger("call_api_open_weather")


city_lat_long = {"ELY": {"lat": 47.9, "lon": -91.86}, "ORR": {"lat": 48.05, "lon": -92.83}}


def get_current_temperature(is_wasm, city):
    lat = city_lat_long[city]["lat"]
    lon = city_lat_long[city]["lon"]
    config = read_config(is_wasm)
    config_section = "api"
    config_key = "OPEN_WEATHER_MAP_API_KEY"
    api_key = config.get(config_section, config_key)
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={api_key}&units=imperial"
    logger.info(f"Requesting temperature for {city}")
    logger.info(f"URL: {url}")
    response = requests.get(url)
    if response.status_code == 200:
        data = json.loads(response.text)
        temperature = data["main"]["temp"]
        logger.info(f"Temperature for {city} is {temperature}°F")
        return temperature
    else:
        logger.info(f"Error getting temperature for {city}")
        return None
