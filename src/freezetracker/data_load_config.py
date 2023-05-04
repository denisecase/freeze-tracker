"""
Functions to load config data - keep constants in a config.ini file.

Different when running locally vs. running in on GitHub Pages.

A config.ini file is not required, but it is recommended because it allows you to
keep your secrets out of your code.

Put config.ini in the root folder.

Add to .gitignore and .dockerignore if you don't want to share your secrets.

"""

# Standard library imports

import configparser
import pathlib
from typing import Union

import requests

from freezetracker.common_logger import get_logger

logger = get_logger("data_load_config")

# DATA LOAD CONFIG


def read_config(is_wasm) -> Union[configparser.ConfigParser, None]:
    """Read the configuration file"""
    github_repo = "freeze-tracker"
    fname = "config.ini"
    username = "denisecase"
    from_github = is_wasm
    logger.info(f"Reading data from github: {from_github}")
    if from_github:
        try:
            # "https://raw.githubusercontent.com/denisecase/freeze-tracker/main/config.ini"
            url = f"https://raw.githubusercontent.com/{username}/{github_repo}/main/{fname}"
            response = requests.get(url)
            response.raise_for_status()
            content = response.text
            config = configparser.ConfigParser()
            config.read_string(content)
            logger.info(f"Config file found at {url}")
            logger.info(f"Config file has sections: {config.sections()}")
            return config
        except requests.exceptions.HTTPError as e:
            logger.error(f"HTTP Error reading from {url}: {e}")
        except Exception as e:
            logger.error(f"Error reading from {url}: {e}")
    else:
        try:
            pkg_path = pathlib.Path.cwd()
            src_path = pkg_path.parent
            root_path = src_path.parent
            full_path = root_path.joinpath(fname)
            config = configparser.ConfigParser()
            config.read(full_path)
            logger.info(f"Config file found at {full_path}")
            logger.info(f"Config file has sections: {config.sections()}")
            return config
        except FileNotFoundError:
            logger.error(f"Error: Data file not found at {full_path}")
        except Exception as e:
            logger.error(f"Error reading data file: {e}")
