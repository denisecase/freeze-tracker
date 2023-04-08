"""

src/daily_updater.py

This file is used to update the daily_temps.csv file with 
yesterday's temperature data. It is run each day at 6 AM to get yesterday's
temperature data. 

The data files are stored in ../data/yyyy-yyyy_daily_temps.csv files. 
Each has one year of data starting on July 1.

2020-2021_hourly_temps.csv
2021-2022_hourly_temps.csv
2022-2023_hourly_temps.csv
etc.

Author: Denise Case
Date: 2023-04-07

"""

from datetime import datetime, timedelta
import os
from pathlib import Path
import requests
from dotenv import load_dotenv
import pandas as pd

print(f"Starting daily updater at {datetime.now()}")

load_dotenv()
API_KEY = os.getenv("API_KEY")
print("Got API key")

# API endpoint and parameters
url = "https://api.openweathermap.org/data/2.5/weather"
params = {"q": "Ely,MN,USA", "appid": API_KEY, "units": "imperial"}


# Define a function to get csv path based on a given mydate
def get_csv_path(mydate):
    print(f"Calling get_csv_path for {mydate}.")

    # Determine the correct file to append to based on the year
    if mydate.month >= 7:
        year_str = str(mydate.year) + "-" + str(mydate.year + 1)
    else:
        year_str = str(mydate.year - 1) + "-" + str(mydate.year)

    # Get absolute path to project root folder
    project_path = Path.cwd()
    print(f"Project path is {project_path}")

    # Get absolute path to this date's data file
    csv_path = project_path.joinpath("data", f"{year_str}_daily_temps.csv")
    return csv_path


# Get yesterday's date (since we're updating daily)
yesterday = datetime.now() - timedelta(days=1)

csv_path = get_csv_path(yesterday)
print(f"Yesterday's data file is {csv_path}")

# Read in current daily temps CSV file
df = pd.read_csv(csv_path, parse_dates=["date"])

# Check if we already have data for yesterday
if len(df[df["date"] == yesterday]) == 0:
    # If not, make API request for yesterday's temperature
    print("No data for yesterday. Getting data from API.")

    params["dt"] = yesterday.timestamp()
    response = requests.get(url, params=params)
    data = response.json()

    # Extract relevant data and add to DataFrame
    temp_f = data["main"]["temp"]
    print(f"Yesterday, average temp was {temp_f} F")
    df = df.append({"date": yesterday, "temp_f": temp_f}, ignore_index=True)

    # Write updated DataFrame to CSV file
    df.to_csv(csv_path, index=False)
    print("Updated CSV file.")
else:
    print("Already have data for yesterday.")

print(f"Finished daily updater at {datetime.now()}")
