"""
Get data for freeze and thaw spans for St. Louis County, MN

"""

import pathlib

import pandas as pd
import pylightxl as xl

in_file_name = "FrostProbeData10-3-22-withgraphs.xlsx"
in_sheet_name = "St Louis"
in_range_string = "A1:E2040"
out_file_name = "frost_stlouis_excerpt.csv"


def get_data():
    """Read from the raw data file"""
    root_path = pathlib.Path.cwd()
    print(f"Root path is {root_path}")
    data_path = root_path.joinpath("data")
    raw_data_path = data_path.joinpath("1_raw")
    raw_file_path = raw_data_path.joinpath(in_file_name)
    print(f"Reading from raw data file {raw_file_path}")
    db = xl.readxl(raw_file_path)
    data = db.ws(ws=in_sheet_name).range(address=in_range_string)
    return data


def write_processed_data(data):
    root_path = pathlib.Path.cwd()
    data_path = root_path.joinpath("data")
    processed_data_path = data_path.joinpath("2_processed")
    processed_file_path = processed_data_path.joinpath(out_file_name)
    print(f"Writing to data file {processed_file_path}")
    pd.DataFrame(data).to_csv(processed_file_path, index=False)


def main():
    """Main entry point of the script"""
    print("START St Louis freeze / thaw import script")
    result = get_data()
    write_processed_data(result)
    print("END St Louis freeze / thaw import script")


if __name__ == "__main__":
    main()
