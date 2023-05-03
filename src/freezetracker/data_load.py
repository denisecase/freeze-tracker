"""
Functions to load data. 

Different when running locally vs. running in on GitHub Pages.
"""

# Standard library imports

import io

import pandas as pd
import requests

from freezetracker.common_content import get_basename, get_data_processed_path_from_code_folder
from freezetracker.common_logger import get_logger

# Third party imports


# local imports


# Add logger

module_name = get_basename(__file__)
logger = get_logger(module_name)


def read_data_processed_csv_to_df(is_WASM, fname):
    github_repo = "freeze-tracker"
    data_subfolder = "2_processed"
    username = "denisecase"
    from_github = is_WASM
    logger.info(f"Reading data from github: {from_github}")
    if from_github:
        try:
            url = f"https://raw.githubusercontent.com/{username}/{github_repo}/main/data/{data_subfolder}/{fname}"
            response = requests.get(url)
            response.raise_for_status()
            return pd.read_csv(io.StringIO(response.text))
        except requests.exceptions.HTTPError as e:
            print(f"HTTP Error reading from {url}: {e}")
        except Exception as e:
            print(f"Error reading from {url}: {e}")
    else:
        try:
            full_path = get_data_processed_path_from_code_folder(fname)
            df = pd.read_csv(full_path)
            # print column names
            logger.info(f"Columns: {df.columns}")
            logger.info(f"Read {len(df)} rows from {full_path}")
            return df
        except FileNotFoundError:
            print(f"Error: Data file not found at {full_path}")
        except Exception as e:
            print(f"Error reading data file: {e}")
