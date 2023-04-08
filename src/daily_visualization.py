"""

src/data_visualization.py

This file reads in all the files from the data folder
and charts the data.

Data files are stored in:
../data/yyyy-yyyy_daily_temps.csv files.

2020-2021_daily_temps.csv
2021-2022_daily_temps.csv
2022-2023_daily_temps.csv

Each has one year of data starting on July 1.

Date: 2023-04-07
"""
import os
from pathlib import Path
import pandas as pd
import plotly.express as px


# Define a function to read in and combine all the data files
def get_data_frame():
    # Get absolute path to project root folder
    project_path = Path.cwd()
    print(f"Project path is {project_path}")

    # Get absolute path to data folder
    data_path = project_path.joinpath("data")
    print(f"Data path is {data_path}")

    # Get a list of all the files in the data directory
    data_files = [f for f in os.listdir(data_path) if f.endswith("_daily_temps.csv")]

    # Combine the data from all the files into a single DataFrame
    df_list = []
    for file in data_files:
        winter = file.split("_")[0]
        filepath = data_path.joinpath(file)
        df = pd.read_csv(filepath)
        df["WINTER"] = winter
        print(f"Reading {file} with data for {winter}")
        df_list.append(df)
    df = pd.concat(df_list, ignore_index=True)

    # Date fields are in separate columns, so combine them into a single column
    df["Date"] = (
        df["IYEAR"].astype(str)
        + "-"
        + df["IMONTH"].astype(str)
        + "-"
        + df["IDAY"].astype(str)
    )

    # Track all cold degree days (CDD) where the temperature is below freezing
    base_temp = 32

    # Calculate the cold degrees for each day (number of degrees below freezing)
    df["cold_degrees"] = (base_temp - df["AVGF"]).clip(lower=0)

    # Each winter restart the WINTER_DAY counter
    df["WINTER_DAY"] = 0
    # Each winter restart the cumulative CDD counter
    df["cumulative_cold_degrees"] = 0

    # If this is July 1, then it's the start of a new winter
    df.loc[(df["IMONTH"] == 7) & (df["IDAY"] == 1), "WINTER_DAY"] = 1
    # If this is not July 1, then it's the next day in the winter
    df.loc[(df["IMONTH"] != 7) & (df["IDAY"] != 1), "WINTER_DAY"] = (
        df["WINTER_DAY"].shift(1) + 1
    )

    # Calculate the cumulative CDD for each winter and day
    df["cumulative_cold_degrees"] = df.groupby(["WINTER", "WINTER_DAY"])[
        "cold_degrees"
    ].cumsum()

    return df


# if this is the main file, run the code below
if __name__ == "__main__":
    # Get the DataFrame with all the data
    df = get_data_frame()

    # Plot the cumulative CDD over time for each year
    fig = px.line(
        df,
        x="Date",
        y="cumulative_cold_degrees",
        color="WINTER",
        title="Cumulative Cold Degree Days",
    )
    fig.show()
