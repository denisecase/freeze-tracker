"""

src/daily_updater.py

This file is used to update the daily_temps.csv file with 
yesterday's temperature data. It is run each day at 6 AM to get yesterday's
temperature data. 

IN PROGRESS - NOT YET IMPLEMENTED
"""

from datetime import datetime, timedelta
import os
from pathlib import Path
import requests
from dotenv import load_dotenv
import pandas as pd

load_dotenv()
API_KEY = os.getenv("API_KEY")

# API endpoint and parameters
url = "https://api.openweathermap.org/data/2.5/weather"
params = {"q": "Ely,MN,USA", "appid": API_KEY, "units": "imperial"}


def get_csv_path(mydate):
    """Get CSV path for a given date."""
    if mydate.month >= 7:
        year_str = str(mydate.year) + "-" + str(mydate.year + 1)
    else:
        year_str = str(mydate.year - 1) + "-" + str(mydate.year)

    project_path = Path.cwd()
    csv_path = project_path.joinpath("data", f"{year_str}_daily_temps.csv")
    return csv_path


def get_yesterday_date():
    """Get yesterday's date."""
    return datetime.now() - timedelta(days=1)


def check_data_for_date(df, date):
    """Check if we already have data for a given date."""
    iyear = date.year
    imonth = date.month
    iday = date.day
    return (
        len(
            df[(df["IYEAR"] == iyear) & (df["IMONTH"] == imonth) & (df["IDAY"] == iday)]
        )
        > 0
    )


def make_api_request_for_date(date):
    """Make an API request for the temperature for a given date."""
    params["dt"] = date.timestamp()
    response = requests.get(url, params=params)
    data = response.json()
    return data["main"]["temp"]


def append_temp_to_df(df, date, temp):
    """Append a temperature value to the DataFrame for a given date."""
    df = df.append({"date": date, "temp_f": temp}, ignore_index=True)
    return df


def update_csv_file(csv_path, df):
    """Write updated DataFrame to CSV file."""
    df.to_csv(csv_path, index=False)


def daily_updater():
    """Run the daily updater."""



if __name__ == "__main__":
    print(f"Starting daily updater at {datetime.now()}")
    daily_updater()
    print(f"Finished daily updater at {datetime.now()}")
