"""
This script reads from

/data/processed/daily_temps_ely.csv

and writes the information into separate files for each year.

The files should be saved in

/data/processed/daily_temps_2010-2011_ely.csv (jul 1 2010 to jun 30 2011)
/data/processed/daily_temps_2011-2012_ely.csv (jul 1 2011 to jun 30 2012)
etc.
"""

import pathlib

import pandas as pd

from freezetracker.common_logger import get_basename, get_logger

logger = get_logger(get_basename(__file__))


def read_all_daily_data() -> pd.DataFrame:
    """Read all daily data into a pandas DataFrame"""
    empty_df = pd.DataFrame()  # Create an empty DataFrame in case of error
    try:
        data_folder = "data"
        data_subfolder_processed = "2_processed"
        data_filename_processed = "daily_temps_ely.csv"

        package_path = pathlib.Path.cwd()
        src_path = package_path.parent
        root_path = src_path.parent
        logger.info(f"Root path is {root_path}")

        f = (
            root_path.joinpath(data_folder)
            .joinpath(data_subfolder_processed)
            .joinpath(data_filename_processed)
        )
        logger.info(f"Reading from processed data file {f}")
        columns_to_read = ["IYEAR", "IMONTH", "IDAY", "AVG_DAILY_TEMP_F"]
        df = pd.read_csv(f, usecols=columns_to_read)

        df["AVG_DAILY_TEMP_F"] = df["AVG_DAILY_TEMP_F"].astype(float).round()

        # Combine "IYEAR", "IMONTH", and "IDAY" columns into a single string column
        df["temp_date"] = (
            df["IYEAR"].astype(str) + "-" + df["IMONTH"].astype(str) + "-" + df["IDAY"].astype(str)
        )
        # Convert the combined string column to a "Date" column
        df["DATE"] = pd.to_datetime(df["temp_date"], format="%Y-%m-%d")
        # Drop the temporary 'temp_date' column
        df.drop("temp_date", axis=1, inplace=True)

        # Identify rows corresponding to July 1
        start_row = (df["IMONTH"] == 7) & (df["IDAY"] == 1)

        df["COLD_F"] = (round(32.0 - df["AVG_DAILY_TEMP_F"])).clip(lower=0)
        df["HOT_F"] = (round(df["AVG_DAILY_TEMP_F"] - 32.0)).clip(lower=0)

        # Create a new 'INDEX' column starting at 0 for each July 1 and incrementing by 1 for each following day
        df["INDEX"] = df.groupby(start_row.cumsum()).cumcount()

        # Calculate cumulative sums of COLD_F and HOT_F, resetting on July 1
        df["CUMM_COLD_F"] = df.groupby(start_row.cumsum())["COLD_F"].cumsum()
        df["CUMM_HOT_F"] = df.groupby(start_row.cumsum())["HOT_F"].cumsum()
        return df
    except FileNotFoundError:
        logger.error(f"Error: Data file not found at {f}")
    except Exception as e:
        logger.error(f"Error reading data file: {e}")
    return empty_df


def write_yearly_data(startYear):
    start_date = pd.to_datetime(f"{startYear}-07-01")
    end_date = pd.to_datetime(f"{startYear+1}-06-30")
    year_str = f"{startYear}-{startYear+1}"
    df_year = df[(df["DATE"] >= start_date) & (df["DATE"] <= end_date)]
    logger.info(f"Writing data for year {year_str}")
    save_year_of_data(startYear, year_str, df_year)


def save_year_of_data(startYear, yearString, df: pd.DataFrame):
    """Save a yearString (2020-2021) of data to a CSV file in the processed data folder"""
    try:
        data_folder = "data"
        data_subfolder_processed = "2_processed"
        data_filename_processed = "daily_temps" + "_" + yearString + "_" + "ely.csv"
        package_path = pathlib.Path.cwd()
        src_path = package_path.parent
        root_path = src_path.parent
        logger.info(f"Root path is {root_path}")
        f = (
            root_path.joinpath(data_folder)
            .joinpath(data_subfolder_processed)
            .joinpath(data_filename_processed)
        )
        logger.info(f"Writing to processed data to file {f}")
        df.to_csv(f, index=False)
        logger.info(f"Processed data has shape: {df.shape}")
        logger.info(f"Saved processed data to {f}")
    except Exception as e:
        logger.error(f"Error saving processed data: {e}")


def main():
    """Main entry point of the script"""
    logger.info("START ELY make years script")

    global df
    df = read_all_daily_data()
    logger.info(f"Read all daily data df has shape: {df.shape}")

    if df is not None:
        # Loop over years and write yearly data to separate files
        for startYear in range(2022, 2023):
            write_yearly_data(startYear)
            logger.info("FINISHED ELY make years script")


if __name__ == "__main__":
    main()
