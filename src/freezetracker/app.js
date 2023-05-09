importScripts("https://cdn.jsdelivr.net/pyodide/v0.22.1/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.4/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.4/dist/wheels/panel-0.14.4-py3-none-any.whl', 'pyodide-http==0.1.0', 'configparser', 'datetime', 'holoviews>=1.15.4', 'holoviews>=1.15.4', 'hvplot', 'io', 'json', 'logging', 'matplotlib', 'pandas', 'pathlib', 'requests', 'scikit-learn', 'statistics', 'timeit', 'typing']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

"""
Main application for the dashboard

In the directory where this file exists, run the following command:

    panel serve --show --autoreload app.py

    Hit CTRL C (both keys at the same time) to stop

    import hvplot.pandas is required for the charts to work 
    - add noqa comment so linting and sorting don't remove it

    
In Holoviews, both + and * operators are used to combine elements.

* (Overlay): The * operator is used to overlay (splat) Holoviews elements 
on top of each other in the same plot. 
The result is a single plot with all elements displayed together. 
Shows multiple plot elements simultaneously within same coordinate system.

+ (Layout): The + operator is used to create a layout 
where Holoviews elements are placed side by side or in a grid, 
depending on how many elements you combine. 
The result is a layout where each element is displayed in its own plot, 
arranged in the specified order. 
Creates a multi-panel plot, where each element has its own separate plot space.

"""

import configparser
import io
import json
import logging
import pathlib
import statistics  # noqa # requires 3.10 or later (GitHub Pages may be 3.9)
import timeit  # noqa used for profiling during development
from datetime import datetime
from typing import Union

# Third-party imports
import holoviews as hv
import hvplot.pandas  # noqa
import pandas as pd
import panel as pn
import requests
from bokeh.models.formatters import FuncTickFormatter  # noqa
from holoviews import opts
from matplotlib.colors import LinearSegmentedColormap
from sklearn.linear_model import LinearRegression

# Configure Panel for bokeh and matplotlib charts
hv.extension("bokeh", "matplotlib")
pn.extension(sizing_mode="stretch_width")

# WASM - differnt behavior in app.py vs app.js (GitHub Pages WASM)


def is_WASM() -> bool:
    """Return False in app.py, True in app.js (WASM)"""
    return True


#  LOGGING


def get_logger(logger_name, log_file="app.log", log_level=logging.INFO):
    """Configure a common logger for the application"""
    logger = logging.getLogger(logger_name)
    logger.setLevel(log_level)

    # Prevent logs from being passed to the handlers of higher-level loggers
    logger.propagate = False

    # Create a file handler for writing log messages to the specified log_file
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(log_level)

    # Create a stream handler for writing log messages to the console
    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(log_level)

    # Define the log message format
    formatter = logging.Formatter("%(asctime)s.%(levelname)s: %(message)s")
    file_handler.setFormatter(formatter)
    stream_handler.setFormatter(formatter)

    # Add the file and stream handlers to the logger
    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)

    return logger


logger = get_logger("app")


# COMMON CONTENT

min_winter_start_year = 2010
max_winter_start_year = 2022  # 2022-2023 is the most recent winter

min_season_day = 0
max_season_day = 365

min_cold_loading = 0
max_cold_loading = 3000

min_hot_loading = 0
max_hot_loading = 6000

min_frost_depth_in = 0
max_frost_depth_in = 100

default_chart_width_px = 700
default_chart_height_px = 600

today_color = "purple"
incident_color = "orange"
incidents_file_name = "incidents.csv"
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


def empty_chart_placeholder():
    return pn.pane.Markdown(
        "Chart not available.",
        height=default_chart_height_px,
        width=default_chart_width_px,
        align="center",
    )


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
    logger.debug(f"Reading from file {processed_file_path}")
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
            url = f"https://raw.githubusercontent.com/{username}/{github_repo}/main/{fname}"
            response = requests.get(url)
            response.raise_for_status()
            content = response.text
            config = configparser.ConfigParser()
            config.read_string(content)
            logger.debug(f"Config file found at {url}")
            logger.debug(f"Config file has sections: {config.sections()}")
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
            logger.debug(f"Config file found at {full_path}")
            logger.debug(f"Config file has sections: {config.sections()}")
            return config
        except FileNotFoundError:
            logger.error(f"Error: Data file not found at {full_path}")
        except Exception as e:
            logger.error(f"Error reading data file: {e}")


# DATA LOAD


def read_data_processed_csv_to_df(is_WASM, fname):
    github_repo = "freeze-tracker"
    data_subfolder = "2_processed"
    username = "denisecase"
    from_github = is_WASM
    logger.debug(f"Reading data from github: {from_github}")
    if from_github:
        try:
            url = f"https://raw.githubusercontent.com/{username}/{github_repo}/main/data/{data_subfolder}/{fname}"
            response = requests.get(url)
            response.raise_for_status()
            return pd.read_csv(io.StringIO(response.text))
        except requests.exceptions.HTTPError as e:
            logger.error(f"HTTP Error reading from {url}: {e}")
        except Exception as e:
            logger.error(f"Error reading from {url}: {e}")
    else:
        try:
            full_path = get_data_processed_path_from_code_folder(fname)
            df = pd.read_csv(full_path)
            logger.debug(f"Columns: {df.columns}")
            logger.debug(f"Read {len(df)} rows from {full_path}")
            return df
        except FileNotFoundError:
            logger.error(f"Error: Data file not found at {full_path}")
        except Exception as e:
            logger.error(f"Error reading data file: {e}")


# CHART COLD LOADING

city_colors = {"ELY": "black", "ORR": "grey"}


def get_city_color(city):
    return city_colors.get(city.upper(), "black")


def get_incident_days(winter_name):
    incidents = {
        "2021-2022": ["2022-03-31", "2022-04-23"],
        "2022-2023": ["2023-04-15"],
    }
    incident_days = [
        get_days_after_Jul_1_from_date_string(date) for date in incidents.get(winter_name, [])
    ]
    return incident_days


def get_all_incident_days():
    incident_days = []
    for winter_name in ["2021-2022", "2022-2023"]:
        incident_days.extend(get_incident_days(winter_name))
    return incident_days


def read_df_from_winter_and_city(is_wasm, yearString, cityString):
    """Read a file that starts with daily_temps_ into a data frame
    @ param yearString: string with the year range, e.g. '2019-2020'
    @ param cityString: string with the city name, e.g. 'ELY'
    @ return: data frame with the data"""
    fn_start = "daily_temps"
    fname = fn_start + "_" + yearString + "_" + cityString.lower() + ".csv"
    df = read_data_processed_csv_to_df(is_wasm, fname)
    df["NAME"] = yearString
    df["CITY"] = cityString
    return df


def add_month_vline_overlays_to_chart(chart):
    """Add month overlays to a chart"""
    month_starts = [0, 31, 61, 92, 122, 153, 183, 214, 245, 275, 306, 336]
    month_names = [
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
    ]

    month_overlays = []

    for i, month_start in enumerate(month_starts):
        month_line = hv.VLine(month_start).opts(line_color="gray", line_width=1)
        x_position = month_start + 15
        y_position = 0
        text = month_names[i]
        month_text = hv.Text(x_position, y_position, text).opts(
            text_font_size="8pt", align="center"
        )
        month_overlays.append(month_line * month_text)

    month_overlay = hv.Overlay(month_overlays)
    chart = chart * month_overlay

    return chart


def get_chart_overlays_vline_per_month(y_position=0.0):
    """Add month overlays to a chart"""
    logger.info("CALLED get_chart_overlays_vline_per_month")
    month_starts = [0, 31, 61, 92, 122, 153, 183, 214, 245, 275, 306, 336]
    month_names = [
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
    ]

    month_overlays = []

    for i, month_start in enumerate(month_starts):
        month_line = hv.VLine(month_start).opts(line_color="gray", line_width=1)
        x_position = month_start + 15
        text = month_names[i]
        month_text = hv.Text(x_position, y_position, text).opts(
            text_font_size="8pt", align="center"
        )
        month_overlays.append(month_line * month_text)

    return month_overlays


def add_to_chart_vline_today(chart):
    """Add a vertical line for today to a chart"""
    logger.info(f"CALLED add_to_chart_vline_today with {len(chart)} rows")
    now = datetime.now()
    today_days_after_Jul_1 = get_days_after_Jul_1_from_date_string(now)
    today_line = hv.VLine(today_days_after_Jul_1).opts(line_color=today_color, line_width=2)
    chart = today_line * chart
    return chart


def add_to_chart_vlines_all_incidents(chart):
    """Add vertical lines to indicate incident days to a chart"""
    logger.info(f"CALLED add_to_chart_vlines_all_incidents with {len(chart)} rows")
    incident_days = get_all_incident_days()
    incident_vlines = [
        hv.VLine(day).opts(line_color=incident_color, line_width=2) for day in incident_days
    ]
    chart = chart * hv.Overlay(incident_vlines)
    return chart


def add_to_chart_vlines_incidents_by_winter(chart, winter_name):
    """Add vertical lines to indicate incident days to the winter chart"""
    logger.info("CALLED add_to_chart_vlines_incidents_by_winter")
    incident_days = get_incident_days(winter_name)
    incident_vlines = [
        hv.VLine(day).opts(line_color=incident_color, line_width=2) for day in incident_days
    ]
    chart = chart * hv.Overlay(incident_vlines)
    return chart


def add_to_chart_hzones_caution_danger(chart):
    """Add horizontal areas for caution and danger zones to a chart"""
    logger.info("CALLED add_to_chart_hzones_caution_danger")
    caution_level = max_cold_loading - 300
    danger_level = max_cold_loading - 100

    caution_zone = hv.Area(
        [
            (min_season_day, caution_level),
            (max_season_day, caution_level),
            (max_season_day, danger_level),
            (min_season_day, danger_level),
        ],
        vdims="y",
        name="Caution Zone",
    ).opts(fill_color="yellow", alpha=0.3)

    danger_zone = hv.Area(
        [
            (min_season_day, danger_level),
            (max_season_day, danger_level),
            (max_season_day, max_cold_loading),
            (min_season_day, max_cold_loading),
        ],
        vdims="y",
        name="Danger Zone",
    ).opts(fill_color="red", alpha=0.3)

    chart = chart * caution_zone * danger_zone
    return chart


def create_chart_cold_loading(is_wasm):
    """Create a cold loading chart and a hot loading chart for each winter"""
    logger.info(f"CALLED create_chart_cold_loading with is_wasm = {is_wasm}")

    try:
        df_dictionary = read_input_data_for_cold_hot_loading_to_df_dic_by_winter(is_wasm)
        logger.info(
            f"Read in dfs with length {len(df_dictionary)}  and keys {df_dictionary.keys()}"
        )
    except Exception as e:
        logger.error(f"Error occurred while reading input data: {e}")
        return empty_chart_placeholder()

    charts = []
    # TODO: COLD LOADING CHARTS
    # for winter, df in df_dictionary.items():
    #     try:
    #         note = get_note_for_winter(winter)
    #     except Exception as e:
    #         logger.error(f"Error occurred while creating chart for winter {winter}: {e}")
    #         continue

    #     try:
    #         df = preprocess_data_cold_hot_loading(df)
    #         logger.debug(f"got single winter df with length {len(df)}")
    #     except Exception as e:
    #         logger.error(f"Error occurred while preprocessing data for winter {winter}: {e}")
    #         continue

    #     try:
    #         figCold, figHot = create_cold_hot_loading_hvplot_charts(df, winter, note)
    #         logger.debug("created figCold and figHot")
    #     except Exception as e:
    #         logger.error(f"Error occurred while creating cold and hot loading charts for winter {winter}: {e}")
    #         continue

    #     try:
    #         figCold = add_to_chart_vline_today(figCold)
    #         figHot = add_to_chart_vline_today(figHot)
    #         logger.debug("added vlines for today to both")
    #     except Exception as e:
    #         logger.error(f"Error occurred while adding vlines for today to charts for winter {winter}: {e}")

    #     try:
    #         month_overlays = get_chart_overlays_vline_per_month()
    #         month_overlay = hv.Overlay(month_overlays)
    #         figCold = figCold * month_overlay
    #         figHot = figHot * month_overlay
    #         logger.debug("added vlines for months to both")
    #     except Exception as e:
    #         logger.error(f"Error occurred while adding vlines for months to charts for winter {winter}: {e}")

    #     try:
    #         figCold = add_to_chart_vlines_incidents_by_winter(figCold, winter)
    #         logger.debug("added vlines for incidents to cold")
    #     except Exception as e:
    #         logger.error(f"Error occurred while adding vlines for incidents to cold chart for winter {winter}: {e}")

    #     try:
    #         figCold = add_to_chart_hzones_caution_danger(figCold)
    #         logger.debug("added hzones to cold")
    #     except Exception as e:
    #         logger.error(f"Error occurred while adding caution and danger zones to cold chart for winter {winter}: {e}")

    #     charts.append(pn.pane.HoloViews(figCold))
    #     charts.append(pn.pane.HoloViews(figHot))

    if charts:
        gridbox = pn.GridBox(*charts, ncols=2)
    else:
        gridbox = empty_chart_placeholder()

    return gridbox


def read_input_data_for_cold_hot_loading_to_df_dic_by_winter(is_wasm):
    """Read input data files for each winter and return a dictionary of DataFrames"""
    logger.info(
        f"CALLED read_input_data_for_cold_hot_loading_to_df_dic_by_winter with is_wasm = {is_wasm}"
    )
    df_dictionary = {}
    for startYear in range(min_winter_start_year, max_winter_start_year + 1):
        yearly_dfs = []
        for city in default_city_list:
            winter = f"{startYear}-{startYear+1}"
            df_temp = read_df_from_winter_and_city(is_wasm, winter, city)
            df_temp["CITY"] = city
            yearly_dfs.append(df_temp)
            logger.debug(f"FINISHED reading visualization input files for {city}")
        df_dictionary[winter] = pd.concat(yearly_dfs)
    return df_dictionary


def get_note_for_winter(name):
    """Return a note to add to the chart title for the given winter"""
    logger.info(f"CALLED get_note_for_winter with name = {name}")
    if name == "2021-2022":
        return "(INCIDENT: 03/31, 04/23)"
    elif name == "2022-2023":
        return "(INCIDENT: 04/15)"
    else:
        return ""


def preprocess_data_cold_hot_loading(df):
    """Preprocess the input DataFrame and return the preprocessed DataFrame"""
    df["DATE"] = pd.to_datetime(df["DATE"])
    df["Days"] = (
        df["DATE"] - pd.to_datetime(df["IYEAR"].astype(str) + "-07-01", format="%Y-%m-%d")
    ).dt.days
    df["CITY_UPPER"] = df["CITY"].str.upper()
    df["CITY_COLOR"] = df["CITY_UPPER"].apply(get_city_color)
    return df


def create_cold_hot_loading_hvplot_charts(df, name, note):
    """Create and return hvPlot line charts for cumulative cold and hot degree days"""
    logger.info(f"CALLED create_cold_hot_loading_hvplot_charts with name={name}, note={note}")

    figCold = df.hvplot.line(
        x="INDEX",
        y="CUMM_COLD_F",
        by="CITY",
        title=f"Cumulative Freezing Degree-Days {name} {note}",
        ylabel="Degree-Days below freezing",
        xlabel="Days after July 1",
        width=default_chart_width_px,
        height=default_chart_height_px,
        xlim=(min_season_day, max_season_day),
        ylim=(min_cold_loading, max_cold_loading),
        color="CITY_COLOR",
    )

    # Create an hvPlot line chart of cumulative hot degree days
    figHot = df.hvplot.line(
        x="INDEX",
        y="CUMM_HOT_F",
        by="CITY",
        title=f"Cumulative Thaw Degree-Days {name}",
        ylabel="Degree-Days above thawing",
        xlabel="Days after July 1",
        width=default_chart_width_px,
        height=default_chart_height_px,
        xlim=(min_season_day, max_season_day),
        ylim=(min_hot_loading, max_hot_loading),
        color="CITY_COLOR",
    )

    return figCold, figHot


# CHART COLD LOADING VS FROST DEPTHS (ONE PER WINTER)


def prepare_chart_cold_loading_vs_frost_depth_data_files_one_per_winter(is_wasm):
    frost_df = read_data_processed_csv_to_df(is_wasm, "frost_stlouis_out.csv")
    # County,Date,THAW_DEPTH_in,FROST_DEPTH_in,Winter,days_after_Jul_1
    dfs = {}

    for startYear in range(min_winter_start_year, max_winter_start_year + 1):
        yearly_dfs = []
        city = "ORR"
        winter = f"{startYear}-{startYear+1}"
        df_temp = read_df_from_winter_and_city(is_wasm, f"{startYear}-{startYear+1}", city)
        df_temp["CITY"] = city
        df_temp["Winter"] = winter
        yearly_dfs.append(df_temp)
        dfs[winter] = pd.concat(yearly_dfs)

    for name in default_winter_list:
        single_winter_df = dfs[name]

        # Ensure the 'DATE' column has a consistent data type
        single_winter_df["DATE"] = pd.to_datetime(single_winter_df["DATE"])

        # Reset index to start from July 1
        single_winter_df["Days"] = (
            single_winter_df["DATE"]
            - pd.to_datetime(single_winter_df["IYEAR"].astype(str) + "-07-01", format="%Y-%m-%d")
        ).dt.days

        # Force city to upper case
        single_winter_df["CITY_UPPER"] = single_winter_df["CITY"].str.upper()

        single_winter_df["days_after_Jul_1"] = single_winter_df["Days"]

        # Join the frost_df and single_winter_df on the 'Winter' and 'days_after_Jul_1' columns
        # Keep all records from the single_winter_df
        combined_df = single_winter_df.merge(
            frost_df,
            left_on=["Winter", "days_after_Jul_1"],
            right_on=["Winter", "days_after_Jul_1"],
            how="left",
        )

        # Filter combined_df to only include rows between July 1 and June 30
        # combined_df = combined_df[(combined_df["DATE"] >= f"{name[:4]}-07-01") & (combined_df["DATE"] <= f"{name[-4:]}-06-30")]

        # Write the combined_df to a CSV file (one per winter) into the processed data folder
        output_file = f"cold_loading_vs_frost_depth_{name}_orr.csv"
        cols = [
            "CITY",
            "County",
            "Winter",
            "days_after_Jul_1",
            "IYEAR",
            "IMONTH",
            "IDAY",
            "DATE",
            "AVG_DAILY_TEMP_F",
            "HOT_F",
            "CUMM_HOT_F",
            "COLD_F",
            "CUMM_COLD_F",
            "THAW_DEPTH_in",
            "FROST_DEPTH_in",
        ]

        combined_df[cols].to_csv(get_data_processed_path_from_code_folder(output_file), index=False)


# Call it once to get the data files
# prepare_chart_cold_loading_vs_frost_depth_data_files_one_per_winter(False, default_winter_list)


def read_cold_loading_vs_frost_depth_from_winter_and_city(is_wasm, winterString, cityString):
    """Read a file like 'cold_loading_vs_frost_depth_2010-2011_orr' into a data frame
    @ param yearString: string with the year range, e.g. '2019-2020'
    @ param cityString: string with the city name, e.g. 'ORR'
    @ return: data frame with the data"""
    fn_start = "cold_loading_vs_frost_depth"
    fname = fn_start + "_" + winterString + "_" + cityString.lower() + ".csv"
    df = read_data_processed_csv_to_df(is_wasm, fname)
    return df


def create_chart_initial_cold_loading_vs_frost_depth(df, title_string):
    """Create an hvPlot scatter chart of frost depth vs cumulative cold degree days"""
    chart = df.hvplot.scatter(
        y="FROST_DEPTH_in",
        x="CUMM_COLD_F",
        title=title_string,
        xlabel="Degree-Days below freezing",
        ylabel="FROST_DEPTH_in",
        width=default_chart_width_px,
        height=default_chart_height_px,
        ylim=(min_frost_depth_in, max_frost_depth_in),
        xlim=(min_cold_loading, max_cold_loading),
        color="CITY_COLOR",
    )
    return chart


def add_to_chart_best_fit_line_loading_vs_frost(figCold, df, winter):
    """Add a best-fit line to the chart"""
    # Remove rows with NaN values from the dataframe
    df = df.dropna()

    # Prepare the data for linear regression
    X = df["CUMM_COLD_F"].values.reshape(-1, 1)
    y = df["FROST_DEPTH_in"].values

    if len(X) <= 1:
        logger.warning(f"Not enough samples to fit linear regression for winter {winter}")
        return figCold

    # Calculate slope and intercept using LinearRegression
    try:
        model = LinearRegression().fit(X, y)
        slope, intercept = model.coef_[0], model.intercept_

        # Create the best-fit line using the slope and intercept
        best_fit_line = hv.Curve([(x, slope * x + intercept) for x in range(0, 4000)]).opts(
            color="red", alpha=0.7
        )

        # Add the best-fit line to the scatter chart
        figCold = figCold * best_fit_line

        # Add the equation to the chart title
        figCold = figCold.opts(title=f"{title_string} (y = {slope:.2f}x + {intercept:.2f})")

    except Exception as e:
        logger.error(f"Error occurred while creating best-fit line for winter {winter}: {e}")

    return figCold


def add_to_chart_hcurves_per_ft_frost(figCold):
    """Add horizontal lines for every 12 inches (1 foot) of frost depth to a chart"""
    frost_lines = [
        hv.Curve([(0, i), (4000, i)]).opts(color="gray", alpha=0.5) for i in range(12, 100, 12)
    ]
    figCold = figCold * hv.Overlay(frost_lines)
    return figCold


def add_to_chart_y_tick_formatter_per_ft_of_frost(figCold):
    """Add custom y-axis tick formatter to the chart"""
    # Create a custom tick formatter for the y-axis
    y_tick_formatter = FuncTickFormatter(
        code="""
        const feet = Math.round(tick / 12);
        return feet + " ft";
        """
    )

    # Apply the custom tick formatter to the y-axis
    figCold = figCold.opts(opts.Scatter(yformatter=y_tick_formatter))
    return figCold


# TODO: FIX XY CHARTS
def create_chart_cold_loading_vs_frost_depth(is_wasm):
    """Create a scatter chart each winter of cold loading chart vs frost depth"""
    logger.info(f"CALLED create_chart_cold_loading_vs_frost_depth with is_wasm = {is_wasm}")

    df_dictionary = {}

    # Loop over years and read in data files
    for startYear in range(min_winter_start_year, max_winter_start_year + 1):
        winter = f"{startYear}-{startYear+1}"
        yearly_dfs = []
        city = "ORR"
        df_temp = read_cold_loading_vs_frost_depth_from_winter_and_city(is_wasm, winter, city)
        yearly_dfs.append(df_temp)
        logger.debug(f"FINISHED reading cold loading vs frost depth input files for {city}")
        df_dictionary[winter] = pd.concat(yearly_dfs)

    charts = []
    for winter in default_winter_list:
        note = ""
        if winter == "2021-2022":
            note = "(INCIDENT: 03/31, 04/23)"
        elif winter == "2022-2023":
            note = "(INCIDENT: 04/15)"

        df = df_dictionary[winter]

        # Create a column for city color
        df["CITY_COLOR"] = df["CITY"].apply(get_city_color)

        title_string = f"ORR {winter} Frost depth (in) vs Freezing Degree-Days {note}"

        xyChart = create_chart_initial_cold_loading_vs_frost_depth(df, title_string)

        # TODO: Add horizontal lines for every 12 inches (1 foot) of frost depth
        # xyChart = add_to_chart_hcurves_per_ft_frost(xyChart)

        # TODO: Add a best-fit line to the chart
        # try:
        #     xyChart = add_to_chart_best_fit_line_loading_vs_frost(xyChart, df, winter)
        # except Exception as e:
        #     logger.error(f"Error occurred while creating best-fit line for winter {winter}: {e}")

        # TODO: Add a y-axis tick formatter to the chart
        # try:
        #     xyChart = add_to_chart_y_tick_formatter_per_ft_of_frost(xyChart)
        # except Exception as e:
        #     logger.error(f"Error occurred while adding y-axis tick formatter for winter {winter}: {e}")

        charts.append(pn.pane.HoloViews(xyChart))

    if charts:
        gridbox = pn.GridBox(*charts, ncols=2)
    else:
        gridbox = empty_chart_placeholder()

    return gridbox


# CHART ELY AGGREGATE


def plot_cumulative_data(names, cumulative_types):
    # Check if the provided cumulative types are valid
    valid_cumulative_types = ["CUMM_COLD_F", "CUMM_HOT_F"]
    if not set(cumulative_types).issubset(valid_cumulative_types):
        raise ValueError("Invalid cumulative_types. Choose from 'CUMM_COLD_F', 'CUMM_HOT_F'.")

    filtered_df = combined_df_ely[combined_df_ely["NAME"].isin(names)]
    # Create a new DataFrame with columns for 'INDEX', 'Value', 'NAME', and 'Type'
    plot_df = pd.DataFrame(columns=["INDEX", "Value", "NAME", "Type"])

    for cumulative_type in cumulative_types:
        temp_df = filtered_df[["INDEX", cumulative_type, "NAME"]].copy()
        temp_df.columns = ["INDEX", "Value", "NAME"]
        temp_df["Type"] = cumulative_type
        plot_df = pd.concat([plot_df, temp_df], ignore_index=True)

    plots = []
    for cumulative_type in cumulative_types:
        temp_df = plot_df[plot_df["Type"] == cumulative_type]
        plot = temp_df.hvplot.line(
            x="INDEX",
            y="Value",
            by="NAME",
            title="Cumulative Degree Days",
            ylabel="Degree Days",
            width=default_chart_width_px,
            height=default_chart_height_px,
        ).opts()
        plots.append(plot)

    fig = hv.Layout(plots).cols(1)
    return pn.pane.HoloViews(fig, sizing_mode="stretch_both")


def create_chart_ely_aggregate(is_wasm):
    logger.info(f"CALLED create_chart_ely_aggregate with is_wasm = {is_wasm}")

    dfs = []
    global combined_df_ely

    # Loop over years and cities
    for startYear in range(min_winter_start_year, max_winter_start_year + 1):
        for city in ["ELY"]:
            dfs.append(read_df_from_winter_and_city(is_wasm, f"{startYear}-{startYear+1}", city))
            logger.debug(f"FINISHED reading visualization input files for {city}")

    # Concatenate all dataframes into one
    combined_df_ely = pd.concat(dfs)

    # Ensure the 'DATE' column has a consistent data type
    combined_df_ely["DATE"] = pd.to_datetime(combined_df_ely["DATE"])

    # Reset index to start from July 1
    combined_df_ely["Days"] = (
        combined_df_ely["DATE"]
        - pd.to_datetime(combined_df_ely["IYEAR"].astype(str) + "-07-01", format="%Y-%m-%d")
    ).dt.days

    # Call the new function with the desired names and cumulative_type
    names_to_show = default_winter_list
    cumulative_types = ["CUMM_COLD_F", "CUMM_HOT_F"]
    plot_cumulative_data(names_to_show, cumulative_types)

    figCold = combined_df_ely.hvplot.line(
        x="INDEX",
        y="CUMM_COLD_F",
        by="NAME",
        title="Cumulative Freeze Degree Days (Ely, MN)",
        height=default_chart_height_px,
        width=default_chart_width_px,
    ).opts(
        xlabel="Days after July 1",
        xlim=(min_season_day, max_season_day),
        ylabel="Degree-Days below freezing",
        ylim=(min_cold_loading, max_cold_loading),
    )

    figHot = combined_df_ely.hvplot.line(
        x="INDEX",
        y="CUMM_HOT_F",
        by="NAME",
        title="Cumulative Thaw Degree Days (Ely, MN)",
        height=default_chart_height_px,
        width=default_chart_width_px,
    ).opts(
        xlabel="Days after July 1",
        xlim=(min_season_day, max_season_day),
        ylabel="Degree-Days above thawing",
        ylim=(min_hot_loading, max_hot_loading),
    )

    component = pn.Row(figCold, figHot)
    return component


# CHART FREEZE THAW

freeze_thaw_file_name = "frost_stlouis.csv"
freeze_thaw_file_name_out = "frost_stlouis_out.csv"


def prepare_freeze_thaw_chart_points():
    """Prepare the freeze and thaw chart points and save them to a CSV file."""
    is_wasm = False  # only run this locally
    df = read_data_processed_csv_to_df(is_wasm, freeze_thaw_file_name)
    df = prepare_freeze_thaw_df(df)
    df.to_csv(get_data_processed_path_from_code_folder(freeze_thaw_file_name_out), index=False)
    logger.info(f"Saved file {freeze_thaw_file_name_out}")


def prepare_freeze_thaw_df(df):
    """Starts with County,Date,THAW_DEPTH_in,FROST_DEPTH_in,SECONDARY_FROST_DEPTH_in"""
    df = df.drop(columns=["SECONDARY_FROST_DEPTH_in"])
    df["Date"] = pd.to_datetime(df["Date"], format="%Y/%m/%d")

    # Add a column for the winter season, e.g. 2010-2011
    start_year = df["Date"].apply(lambda x: calculate_winter_start_year(x))
    end_year = start_year + 1
    df["Winter"] = start_year.astype(str) + "-" + end_year.astype(str)

    # Add a column for the days after July 1 of the current winter season
    df["days_after_Jul_1"] = (
        df["Date"]
        - df["Date"].apply(lambda x: x.replace(year=calculate_winter_start_year(x), month=7, day=1))
    ).dt.days

    df = df.dropna(subset=["THAW_DEPTH_in", "FROST_DEPTH_in"], how="all")
    return df


# Run once to create the CSV file
# prepare_freeze_thaw_chart_points()


def create_chart_freeze_thaw(is_wasm):
    """Create charts of freeze and thaw lines"""
    logger.info(f"CALLED create_chart_freeze_thaw with is_wasm = {is_wasm}")

    df = read_data_processed_csv_to_df(is_wasm, freeze_thaw_file_name_out)
    grouped_df = df.groupby("Winter")
    charts = []

    for winter, winter_df in grouped_df:
        winter_df = winter_df.sort_values(by=["days_after_Jul_1"])
        last_data_point_date = winter_df["Date"].max()
        logger.debug(f"last_data_point_date: {last_data_point_date}")
        max_depth_in = winter_df["FROST_DEPTH_in"].max()
        logger.debug(f"max_depth_in: {max_depth_in}")

        freeze_line = winter_df.hvplot.scatter(
            x="days_after_Jul_1",
            y="FROST_DEPTH_in",
            marker="triangle",
            size=10,
            color="blue",
            # label="Frost depth, in",
        )  # .opts(responsive=True)

        thaw_line = winter_df.hvplot.scatter(
            x="days_after_Jul_1",
            y="THAW_DEPTH_in",
            marker="circle",
            size=10,
            color="red",
            line_width=2,
            # label="Thaw depth, in",
        )  # .opts(responsive=True)

        month_overlays = get_chart_overlays_vline_per_month()
        month_overlay = hv.Overlay(month_overlays)

        # Create a holoviews chart using overlay operator, *
        combined_chart = (freeze_line * thaw_line) * month_overlay

        # From string 2010-04-06 get just the string month and day
        short_last_date = last_data_point_date[5:10]
        combined_chart = combined_chart.opts(
            title=f"Frost, Thaw Depth Trends ({winter}, Last Data Point: {short_last_date})",
            width=default_chart_width_px,
            height=default_chart_height_px,
        )

        combined_chart = combined_chart.opts(
            opts.Scatter(
                xlabel=f"{winter} last day: {short_last_date}, max in: {str(max_depth_in)}",
                ylabel="Depth (inches)",
                xlim=(90, max_season_day),
                ylim=(-10, max_frost_depth_in),
                legend_position="top_left",
            ),
        )

        charts.append(combined_chart)

    if charts is not None:
        gridbox = pn.GridBox(*charts, ncols=2)
    else:
        gridbox = empty_chart_placeholder()
    return gridbox


# CHART FROST MAX DEPTH


def create_custom_colormap_frost_max_depth():
    colors = ["green", "yellow", "red"]
    cmap = LinearSegmentedColormap.from_list("custom_cmap", colors)
    return cmap


def create_chart_frost_max_depth(is_wasm):
    """Create a chart of the max frost depth"""
    logger.info(f"CALLED create_chart_cold_loading_vs_frost_depth with is_wasm = {is_wasm}")

    depth_file_name = "frost_depth.csv"
    df = read_data_processed_csv_to_df(is_wasm, depth_file_name)
    logger.info("Creating frost depth chart for all winters.")
    if df is None:
        logger.error("Error: df for max frost depth is None")
        return None

    cmap = create_custom_colormap_frost_max_depth()
    # Normalize the 'Max_Frost_Depth_in' column to a range of 0-1 for color mapping
    normalized_depth = (df["Max_Frost_Depth_in"] - df["Max_Frost_Depth_in"].min()) / (
        df["Max_Frost_Depth_in"].max() - df["Max_Frost_Depth_in"].min()
    )
    # Convert the normalized depth values to a DataFrame
    df["Normalized_Depth"] = normalized_depth
    avg_depth = df["Max_Frost_Depth_in"].mean()

    # Create the bokeh bar chart with the custom colors and rotated x-axis labels and a text label above each bar
    bars = df.hvplot.bar(
        x="Winter",
        y="Max_Frost_Depth_in",
        c="Normalized_Depth",
        cmap=cmap,
        title="Max Frost Depth (Orr, MN) Avg: {:.0f} in".format(avg_depth),
        xlabel="Winter",
        ylabel="Max Frost Depth (in)",
        width=default_chart_width_px,
        height=default_chart_height_px,
        rot=90,
    )
    # Add labels to each bar
    labels = hv.Labels(
        [
            (val_x, val_y * 1.05, f"{val_y:.1f}")
            for val_x, val_y in zip(bars.data["Winter"], bars.data["Max_Frost_Depth_in"])
        ],
        kdims=["x", "y"],
        vdims=["text"],
    ).opts(text_color="black", text_alpha=0.8, align="center")

    chart = bars * labels

    if chart is not None:
        column = pn.Column(chart, sizing_mode="stretch_both")
    else:
        column = empty_chart_placeholder()
    return column


# CHART FROST SPAN


def prepare_span_df(df):
    df["Frost_Start"] = pd.to_datetime(df["Frost_Start"], format="%Y/%m/%d")
    df["Frost_End"] = pd.to_datetime(df["Frost_End"], format="%Y/%m/%d")
    df["Duration_days"] = (df["Frost_End"] - df["Frost_Start"]).dt.days
    normalized_duration = (df["Duration_days"] - df["Duration_days"].min()) / (
        df["Duration_days"].max() - df["Duration_days"].min()
    )
    df["Normalized_Duration"] = normalized_duration
    df["days_after_Jul_1"] = (
        df["Frost_Start"] - df["Frost_Start"].apply(lambda x: x.replace(month=7, day=1))
    ).dt.days
    start_year = df["Frost_Start"].dt.year
    end_year = start_year + 1
    df["Winter"] = start_year.astype(str) + "-" + end_year.astype(str)
    df["line_color"] = df["Normalized_Duration"]
    return df


def create_custom_colormap_frost_span():
    colors = ["green", "yellow", "red"]
    cmap = LinearSegmentedColormap.from_list("custom_cmap", colors)
    return cmap


def create_chart_frost_span(is_wasm):
    """Create a chart of the frost span"""
    logger.info(f"CALLED create_chart_frost_span with is_wasm = {is_wasm}")

    span_file_name = "frost_span.csv"
    df = read_data_processed_csv_to_df(is_wasm, span_file_name)
    df = prepare_span_df(df)
    cmap = create_custom_colormap_frost_span()

    segments = create_segments(df)
    chart = hv.Overlay(segments)

    chart = add_to_chart_vline_today(chart)
    chart = add_to_chart_vlines_all_incidents(chart)

    month_overlays = get_chart_overlays_vline_per_month()
    month_overlay = hv.Overlay(month_overlays)
    chart = chart * month_overlay

    chart = chart.opts(hv.opts.Segments(color="line_color", cmap=cmap, line_width=10))
    chart = chart.redim.label(x="Days After July 1", y="Winter").opts(
        width=default_chart_width_px, height=default_chart_height_px
    )
    chart = chart.redim.range(x=(90, max_season_day))
    chart = chart.opts(title="Frost Span (Orr, MN)")
    if chart is not None:
        column = pn.Column(chart, sizing_mode="stretch_both")
    else:
        column = empty_chart_placeholder()
    return column


def create_segments(df):
    segments = []
    for idx, row in df.iterrows():
        start_text, end_text = create_text_overlays(row)
        segment_data = [
            {
                "x0": row["days_after_Jul_1"],
                "x1": row["days_after_Jul_1"] + row["Duration_days"],
                "y0": row["Winter"],
                "y1": row["Winter"],
                "line_color": row["line_color"],
                "start_date": row["Frost_Start"].strftime("%Y-%m-%d"),
                "end_date": row["Frost_End"].strftime("%Y-%m-%d"),
            }
        ]
        segment = hv.Segments(
            segment_data,
            kdims=["x0", "y0", "x1", "y1"],
            vdims=["line_color", "start_date", "end_date"],
        )
        segments.append(segment * start_text * end_text)
    return segments


def create_text_overlays(row):
    start_text = hv.Text(
        row["days_after_Jul_1"],
        row["Winter"],
        "{:%b %#d}  ".format(row["Frost_Start"]),
        halign="right",
        fontsize=8,
    )
    end_text = hv.Text(
        row["days_after_Jul_1"] + row["Duration_days"],
        row["Winter"],
        "  {:%b %#d}".format(row["Frost_End"]),
        halign="left",
        fontsize=8,
    )
    return start_text, end_text


# APP =======================================================

title_string = "Freeze Tracker Dashboard"
footer_string = "2023"


def create_github_pane():
    """Add a GitHub pane with icon and link to repository"""
    github_pane = pn.pane.HTML(
        """
        <a href="https://github.com/denisecase/freeze-tracker" target="_blank">
            <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" width="30" height="30">
        </a>
        """,
        width=30,
        height=30,
    )
    return github_pane


def create_open_frost_thaw_url_pane():
    pane = pn.pane.Markdown(
        '## [<span>Frost/Thaw (Orr, MN)</span>](https://www.dot.state.mn.us/loadlimits/frost-thaw/orr.html){target="_blank"}'
    )
    return pane


def create_open_probabilities_url_pane():
    pane = pn.pane.Markdown(
        '## [<span>Probabilites (Ely, old)</span>](https://files.dnr.state.mn.us/natural_resources/climate/normals/freeze_dates/USC00212543.pdf){target="_blank"}'
    )
    return pane


def create_open_panel_url_pane():
    pane = pn.pane.Markdown(
        '## [<span>Explore Panel</span>](https://panel.holoviz.org/index.html){target="_blank"}'
    )
    return pane


def create_today_pane():
    logger.debug("CALLED create_today_pane()")
    now = datetime.now()
    formatted_date = now.strftime("%b %d, %Y")
    pane = pn.pane.Markdown(f'<h2 style="color: {today_color};"> {formatted_date}</h2>')
    return pane


def create_incident_pane(incident_date):
    formatted_date = incident_date.strftime("%b %d, %Y")
    pane = pn.pane.Markdown(f"### {formatted_date}")
    return pane


def create_incidents_row():
    logger.debug("CALLED create_all_incidents_column")
    incidents = [
        datetime(2022, 3, 31),
        datetime(2022, 4, 23),
        datetime(2023, 4, 15),
    ]
    incident_panes = [create_incident_pane(incident) for incident in incidents]

    incidents_column = pn.Column(pn.pane.Markdown("## Incidents"), *incident_panes)
    return pn.Row(incidents_column)


# CALL API OPEN WEATHER

city_lat_long = {"ELY": {"lat": 47.9, "lon": -91.86}, "ORR": {"lat": 48.05, "lon": -92.83}}


def get_current_temperature(is_wasm, city):
    logger.info(f"get_current_temperature STARTED for {city} with is_wasm={is_wasm}")
    lat = city_lat_long[city]["lat"]
    lon = city_lat_long[city]["lon"]
    config = read_config(is_wasm)
    config_section = "api"
    config_key = "OPEN_WEATHER_MAP_API_KEY"
    api_key = config.get(config_section, config_key)
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={api_key}&units=imperial"
    logger.debug(f"Requesting temperature for {city}")
    logger.debug(f"URL: {url}")
    response = requests.get(url)
    if response.status_code == 200:
        data = json.loads(response.text)
        temperature = data["main"]["temp"]
        logger.info(f"Temperature for {city} is {temperature} F")
        logger.info(f"get_current_temperature ENDED for {city}")
        return temperature
    else:
        logger.error(f"Error getting temperature for {city}")
        logger.error(f"Error get_current_temperature ended for {city}")
        return None


def create_current_temps_row():
    wasm = is_WASM()
    is_dev = False
    ely_current_temp = 0.0 if is_dev else get_current_temperature(wasm, "ELY")
    orr_current_temp = 0.0 if is_dev else get_current_temperature(wasm, "ORR")
    ely_temp_pane = pn.pane.Markdown(f"## Ely: {ely_current_temp:.1f} F")
    orr_temp_pane = pn.pane.Markdown(f"## Orr: {orr_current_temp:.1f} F")
    row = pn.Row(
        ely_temp_pane,
        orr_temp_pane,
    )
    return row


def create_template_sidebar():
    logger.info("CALLED create_template_sidebar()")

    today_pane = create_today_pane()
    current_temps_row = create_current_temps_row()
    incidents_row = create_incidents_row()
    open_frost_thaw_url_pane = create_open_frost_thaw_url_pane()
    open_probabilities_url_pane = create_open_probabilities_url_pane()
    open_panel_url_pane = create_open_panel_url_pane()

    sidebar = pn.Column(
        today_pane,
        current_temps_row,
        incidents_row,
        open_frost_thaw_url_pane,
        open_probabilities_url_pane,
        open_panel_url_pane,
        width_policy="max",
        max_width=150,
    )

    return sidebar


def create_template_main():
    logger.info("CALLED create_template_main")
    wasm = is_WASM()
    depth_panel = create_chart_frost_max_depth(wasm)
    span_panel = create_chart_frost_span(wasm)
    freeze_thaw_charts_gridbox = create_chart_freeze_thaw(wasm)
    ely_aggregate_row = create_chart_ely_aggregate(wasm)
    loading_charts_gridbox = create_chart_cold_loading(wasm)
    loading_vs_frost_charts_gridbox = create_chart_cold_loading_vs_frost_depth(wasm)

    top_row = pn.Row(depth_panel, span_panel)

    column = pn.Column(
        top_row,
        freeze_thaw_charts_gridbox,
        ely_aggregate_row,
        loading_charts_gridbox,
        loading_vs_frost_charts_gridbox,
    )
    return column


def create_dashboard():
    """Create a Panel dashboard."""
    logger.info("CALLED create_dashboard()")

    template_sidebar = create_template_sidebar()
    template_main = create_template_main()

    dashboard = pn.template.FastListTemplate(
        title=title_string,
        sidebar=template_sidebar,
        main=template_main,
        header=create_github_pane(),  # Add the GitHub icon to the header
    )

    return dashboard


def main():
    """Main function. Creates a Panel dashboard,
    sets up periodic updates, and flags the dashboard as servable"""
    logger.info("CALLED main()")

    dashboard = create_dashboard()

    logger.info("Starting dashboard servable")
    dashboard.servable()
    # noqa


main()


await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.runPythonAsync(`
    import json

    state.curdoc.apply_json_patch(json.loads('${msg.patch}'), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads("""${msg.location}""")
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()