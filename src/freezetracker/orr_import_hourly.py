"""

Downloaded NOAA-OrrMN-Global-Hourly-3320024.csv from NOAA
Used Excel to calculate TMP_F from TMP_C and get other fields
Saved as FromNOAA_3320024_Orr_Import.xlsx
"""
import logging
import pathlib

import pandas as pd

logging.basicConfig(filename="orr.log", level=logging.DEBUG)
logger = logging.getLogger()
logger.setLevel(logging.DEBUG)
logger.info("Starting ORR IMPORT HOURLY")


def read_raw_hourly_data() -> pd.DataFrame:
    """Read the raw data file into a pandas DataFrame
    IYEAR	IMONTH	IDAY	IHOUR	IMINUTE	Kcomma	TMP_C	TMP_F"""
    try:
        data_folder = "data"
        data_subfolder_raw = "1_raw"
        data_filename_raw = "FromNOAA_3320024_Orr_Import.xlsx"
        package_path = pathlib.Path.cwd()
        src_path = package_path.parent
        root_path = src_path.parent
        logger.info(f"Root path is {root_path}")

        f = root_path.joinpath(data_folder).joinpath(data_subfolder_raw).joinpath(data_filename_raw)
        logger.info(f"Reading from raw data file {f}")
        logger.info(f"Reading from raw data file {f}")

        columns_to_read = ["SOURCE", "IYEAR", "IMONTH", "IDAY", "TMP_F"]
        return pd.read_excel(f, sheet_name="FromNOAA_3320024_Orr_Import", usecols=columns_to_read)
    except FileNotFoundError:
        logger.error(f"Error: Raw data file not found at {f}")
    except Exception as e:
        logger.error(f"Error reading raw data file: {e}")


def generate_initial_hourly_data(df: pd.DataFrame) -> pd.DataFrame:
    """Filter by SOURCE=7 and group by year, month, and day"""
    logger.info("Generating ORR initial hourly data")
    logger.info(f"Input df has shape: {df.shape}")

    newdf = df.copy()

    # IYEAR maybe 2010.0 and is a float. Change it to int
    newdf["IYEAR"] = df["IYEAR"].astype(int)
    newdf["IMONTH"] = df["IMONTH"].astype(int)
    newdf["IDAY"] = df["IDAY"].astype(int)

    newdf = newdf[newdf["SOURCE"] == 7]
    logger.info(f"After filtering, newdf has shape: {newdf.shape}")

    df_daily = (
        newdf.groupby(["IYEAR", "IMONTH", "IDAY"])["TMP_F"]
        .mean()
        .reset_index()
        .rename(columns={"TMP_F": "AVG_DAILY_TEMP_F"})
    )
    logger.info(f"df_daily has shape: {df_daily.shape}")
    return df_daily[["IYEAR", "IMONTH", "IDAY", "AVG_DAILY_TEMP_F"]]


def save_processed_data(df: pd.DataFrame):
    """Save the processed data to a CSV file"""
    try:
        data_folder = "data"
        data_subfolder_processed = "2_processed"
        data_filename_processed = "daily_temps_orr.csv"
        package_path = pathlib.Path.cwd()
        src_path = package_path.parent
        root_path = src_path.parent
        logger.info(f"Root path is {root_path}")
        f = (
            root_path.joinpath(data_folder)
            .joinpath(data_subfolder_processed)
            .joinpath(data_filename_processed)
        )
        logger.info(f"Writing to processed data file {f}")
        df.to_csv(f, index=False)
        logger.info(f"Saved processed data to {f}")
    except Exception as e:
        logger.error(f"Error saving processed data: {e}")


def main():
    """Main entry point of the script"""
    logger.info("START hourly import script")

    df = read_raw_hourly_data()
    logger.info(f"Read raw data file df has shape: {df.shape}")

    if df is not None:
        df_daily = generate_initial_hourly_data(df)
        logger.info(f"Processed data has shape: {df_daily.shape}")

        save_processed_data(df_daily)
        logger.info("FINISHED hourly import script")


if __name__ == "__main__":
    main()
