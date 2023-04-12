import pandas as pd
import pathlib as pl
import configparser

def read_raw_hourly_data() -> pd.DataFrame:
    """Read the raw data file into a pandas DataFrame"""
    try:
        data_folder = config['data']['data_folder']
        data_subfolder_raw = config['data']['data_subfolder_raw']
        data_filename_raw = config['data']['data_filename_raw']
        root_path = pl.Path.cwd()
        print(f"Root path is {root_path}")
        f = root_path.joinpath(data_folder).joinpath(data_subfolder_raw).joinpath(data_filename_raw)
        print(f"Reading from raw data file {f}")
        columns_to_read = ["SOURCE", "IYEAR", "IMONTH", "IDAY", "TMP_F"]
        return pd.read_excel(f, sheet_name=config["data"]["data_sheet_raw"], usecols=columns_to_read)
    except FileNotFoundError:
        print(f"Error: Raw data file not found at {f}")
    except Exception as e:
        print(f"Error reading raw data file: {e}")


def generate_initial_hourly_data(df: pd.DataFrame) -> pd.DataFrame:
    """Filter by SOURCE=7 and group by year, month, and day"""
    print("Generating initial hourly data")
    df = df[df["SOURCE"] == 7]
    df_daily = (
        df.groupby(["IYEAR", "IMONTH", "IDAY"])["TMP_F"].mean()
        .reset_index()
        .rename(columns={"TMP_F": "AVG_DAILY_TEMP_F"})
    )
    print(f"df_daily has shape: {df_daily.shape}")
    return df_daily[["IYEAR", "IMONTH", "IDAY", "AVG_DAILY_TEMP_F"]]

def save_processed_data(df: pd.DataFrame):
    """Save the processed data to a CSV file"""
    try:
        data_folder = config['data']['data_folder']
        data_subfolder_processed = config['data']['data_subfolder_processed']
        data_filename_processed = config['data']['data_filename_processed']
        root_path = pl.Path.cwd()
        print(f"Root path is {root_path}")
        f = root_path.joinpath(data_folder).joinpath(data_subfolder_processed).joinpath(data_filename_processed)
        print(f"Writing to processed data file {f}")
        df.to_csv(f, index=False)
        print(f"Saved processed data to {f}")
    except Exception as e:
        print(f"Error saving processed data: {e}")

def read_config():
    """Read the configuration file"""
    print("Reading config file")
    config = configparser.ConfigParser()
    config.read("config.ini")
    print(f"Config file has sections: {config.sections()}")
    return config

def main():
    """Main entry point of the script"""
    print("START hourly import script")

    global config
    config = read_config()

    df = read_raw_hourly_data()
    print(f"Read raw data file df has shape: {df.shape}")

    if df is not None:
        df_daily = generate_initial_hourly_data(df)
        print(f"Processed data has shape: {df_daily.shape}")

        save_processed_data(df_daily)
        print("FINISHED hourly import script")

if __name__ == "__main__":
    main()
