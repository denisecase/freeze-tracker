"""
Common functions used by multiple modules
"""


import pathlib
from datetime import datetime

import pandas as pd

from freezetracker.common_logger import get_basename, get_logger

module_name = get_basename(__file__)
logger = get_logger(module_name)

incidents_file_name = "incidents.csv"
month_starts = [0, 31, 61, 92, 122, 153, 183, 214, 245, 275, 306, 336]
month_names = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"]
city_lat_long = {"ELY": {"lat": 47.9, "lon": -91.86}, "ORR": {"lat": 48.05, "lon": -92.83}}
default_city_list = ["ELY", "ORR"]
default_winter_list = [
    "2010-2011",
    "2011-2012",
    "2012-2013",
    "2013-2014",
    "2014-2015",
    "2015-2016",
    "2016-2017",
    "2017-2018",
    "2018-2019",
    "2019-2020",
    "2020-2021",
    "2021-2022",
    "2022-2023",
]


def calculate_winter_start_year(date_str) -> int:
    """Calculate the winter start year based on the date
    Winter is defined as July 1 to June 30.
    If July or later, then the winter start year is the current year.
    Jan-Jun, then the winter start year is the previous year.
    @returns the winter start year as an int"""
    date = pd.to_datetime(date_str)
    if date.month >= 7:
        return date.year
    else:
        return date.year - 1


def get_data_processed_path_from_code_folder(fname):
    pkg_path = pathlib.Path.cwd()
    src_path = pkg_path.parent
    root_path = src_path.parent
    data_path = root_path.joinpath("data")
    processed_data_path = data_path.joinpath("2_processed")
    processed_file_path = processed_data_path.joinpath(fname)
    logger.info(f"Reading from file {processed_file_path}")
    return processed_file_path


def get_days_after_Jul_1_from_date_string(date_string):
    """Return the number of days after July 1 for the given date string
    @param date_string: a date string that can be parsed by pd.to_datetime
    @return: the number of days after July 1"""
    date = pd.to_datetime(date_string)
    if date.month >= 7:
        start_year = date.year
    else:
        start_year = date.year - 1
    today_days_after_Jul_1 = (date - datetime(start_year, 7, 1)).days
    return today_days_after_Jul_1
