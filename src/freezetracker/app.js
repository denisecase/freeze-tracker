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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.4/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.4/dist/wheels/panel-0.14.4-py3-none-any.whl', 'pyodide-http==0.1.0', 'configparser', 'datetime', 'holoviews>=1.15.4', 'holoviews>=1.15.4', 'hvplot', 'io', 'json', 'logging', 'matplotlib', 'numpy', 'pandas', 'param', 'pathlib', 'requests', 'typing']
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

    Hit CTRL C (at the same time) to stop

    import hvplot.pandas is required for the charts to work 
    - add noqa comment so linting and sorting don't remove it

    
In Holoviews, both + and * operators are used to combine elements.

* (Overlay): The * operator is used to overlay elements 
on top of each other in the same plot. 
When you use the * operator with Holoviews elements, 
the result is a single plot with all elements displayed together. 
Used to show multiple plot elements simultaneously within the same coordinate system, 
as in our freeze_points and thaw_points.

+ (Layout): The + operator is used to create a layout 
where the elements are placed side by side or in a grid, 
depending on how many elements you combine. 
When you use the + operator with Holoviews elements, 
the result is a layout where each element is displayed in its own plot, 
arranged in the specified order. 
This is useful when you want to create a multi-panel plot, 
where each element has its own separate plot space.


"""

# Standard Python library imports
import configparser
import io
import json
import logging
import pathlib
from datetime import datetime
from typing import Union

# Third-party imports
import holoviews as hv
import hvplot.pandas  # noqa
import numpy as np
import pandas as pd
import panel as pn
import param
import requests
from holoviews import Options, dim, opts  # noqa
from matplotlib.colors import LinearSegmentedColormap

# Configure Panel
hv.extension("bokeh", "matplotlib")
pn.extension(sizing_mode="stretch_width")

# IS WASM


def is_WASM() -> bool:
    """Return False in app.py, True in app.js (WASM)"""
    return True


#  LOGGING


def get_logger(logger_name, log_file="app.log", log_level=logging.INFO):
    """Configure a common logger for the application"""
    logging.basicConfig(filename=log_file, level=log_level)
    logger = logging.getLogger(logger_name)
    logger.setLevel(log_level)
    return logger


logger = get_logger("app")


# COMMON CONTENT

today_color = "purple"
incident_color = "orange"
incidents_file_name = "incidents.csv"
month_starts = [0, 31, 61, 92, 122, 153, 183, 214, 245, 275, 306, 336]
month_names = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"]
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
    logger.info(f"Reading from file {processed_file_path}")
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


# DATA LOAD


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
            logger.error(f"HTTP Error reading from {url}: {e}")
        except Exception as e:
            logger.error(f"Error reading from {url}: {e}")
    else:
        try:
            full_path = get_data_processed_path_from_code_folder(fname)
            df = pd.read_csv(full_path)
            logger.info(f"Columns: {df.columns}")
            logger.info(f"Read {len(df)} rows from {full_path}")
            return df
        except FileNotFoundError:
            logger.error(f"Error: Data file not found at {full_path}")
        except Exception as e:
            logger.error(f"Error reading data file: {e}")


# CALL API OPEN WEATHER

city_lat_long = {"ELY": {"lat": 47.9, "lon": -91.86}, "ORR": {"lat": 48.05, "lon": -92.83}}


def get_current_temperature(is_wasm, city):
    lat = city_lat_long[city]["lat"]
    lon = city_lat_long[city]["lon"]
    config = read_config(is_wasm)
    config_section = "api"
    config_key = "OPEN_WEATHER_MAP_API_KEY"
    api_key = config.get(config_section, config_key)
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={api_key}&units=imperial"
    logger.info(f"Requesting temperature for {city}")
    logger.info(f"URL: {url}")
    response = requests.get(url)
    if response.status_code == 200:
        data = json.loads(response.text)
        temperature = data["main"]["temp"]
        logger.info(f"Temperature for {city} is {temperature}°F")
        return temperature
    else:
        logger.info(f"Error getting temperature for {city}")
        return None


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


def create_chart_cold_loading(is_wasm, selected_winters):
    """Create a cold loading chart and a hot loading chart for each winter"""
    dfs = {}
    winter_charts = []

    # Loop over years and read in data files
    for startYear in range(2010, 2023):
        yearly_dfs = []
        for city in default_city_list:
            df_temp = read_df_from_winter_and_city(is_wasm, f"{startYear}-{startYear+1}", city)
            df_temp["CITY"] = city
            yearly_dfs.append(df_temp)
            logger.info(f"FINISHED reading visualization input files for {city}")
        dfs[f"{startYear}-{startYear+1}"] = pd.concat(yearly_dfs)

    for name in selected_winters:
        note = ""
        if name == "2021-2022":
            note = "(INCIDENT: 03/31, 04/23)"
        elif name == "2022-2023":
            note = "(INCIDENT: 04/15)"

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

        # Create a column for city color
        single_winter_df["CITY_COLOR"] = single_winter_df["CITY_UPPER"].apply(get_city_color)

        # Create an hvPlot line chart of cumulative cold degree days
        figCold = single_winter_df.hvplot.line(
            x="INDEX",
            y="CUMM_COLD_F",
            by="CITY",
            title=f"Cumulative Freezing Degree-Days {name} {note}",
            ylabel="Degree-Days below freezing",
            xlabel="Days after July 1",
            width=800,
            height=600,
            xlim=(0, 365),
            ylim=(0, 4000),
            color="CITY_COLOR",
        )

        # Create an hvPlot line chart of cumulative hot degree days
        figHot = single_winter_df.hvplot.line(
            x="INDEX",
            y="CUMM_HOT_F",
            by="CITY",
            title=f"Cumulative Thaw Degree-Days {name}",
            ylabel="Degree-Days above thawing",
            xlabel="Days after July 1",
            width=800,
            height=600,
            xlim=(0, 365),
            ylim=(0, 8000),
            color="CITY_COLOR",
        )

        # Add grey  spines for Month starts
        for i, month_start in enumerate(month_starts):
            month_line = hv.VLine(month_start).opts(line_color="gray", line_width=1)
            month_text = hv.Text(
                month_start + 15, single_winter_df["CUMM_COLD_F"].min(), month_names[i]
            ).opts(text_font_size="8pt", align="center")
            figCold *= month_line * month_text
            figHot *= month_line * month_text

        # Add a vertical line for today based on days after July 1
        now = datetime.now()
        today_days_after_Jul_1 = get_days_after_Jul_1_from_date_string(now)
        today_line = hv.VLine(today_days_after_Jul_1).opts(line_color=today_color, line_width=2)
        figCold = today_line * figCold
        figHot = today_line * figHot

        incident_days = get_incident_days(name)
        for incident_day in incident_days:
            incident_vline = hv.VLine(incident_day).opts(line_color=incident_color, line_width=2)
            figCold *= incident_vline
            figHot *= incident_vline

        caution_zone = hv.Area(
            [(0, 1700), (365, 1700), (365, 1900), (0, 1900)], vdims="y", name="Caution Zone"
        ).opts(fill_color="yellow", alpha=0.3)

        danger_zone = hv.Area(
            [(0, 1900), (365, 1900), (365, 4000), (0, 4000)], vdims="y", name="Danger Zone"
        ).opts(fill_color="red", alpha=0.3)

        # Add the caution and danger zones to the figCold chart
        figCold = caution_zone * danger_zone * figCold

        winter_charts.append(pn.pane.HoloViews(figCold))
        winter_charts.append(pn.pane.HoloViews(figHot))

    # Wrap the winter_charts list in a GridBox layout with two columns
    panel_grid_box = pn.GridBox(*winter_charts, ncols=2)
    return panel_grid_box


# CHART COLD LOADING VS FROST DEPTHS (ONE PER WINTER)


def prepare_chart_cold_loading_vs_frost_depth_data_files_one_per_winter(is_wasm, selected_winters):
    frost_df = read_data_processed_csv_to_df(is_wasm, "frost_stlouis_out.csv")
    # County,Date,THAW_DEPTH_in,FROST_DEPTH_in,Winter,days_after_Jul_1
    dfs = {}

    for startYear in range(2010, 2023):
        yearly_dfs = []
        city = "ORR"
        winter = f"{startYear}-{startYear+1}"
        df_temp = read_df_from_winter_and_city(is_wasm, f"{startYear}-{startYear+1}", city)
        df_temp["CITY"] = city
        df_temp["Winter"] = winter
        yearly_dfs.append(df_temp)
        dfs[winter] = pd.concat(yearly_dfs)

    for name in selected_winters:
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


def create_chart_cold_loading_vs_frost_depth(is_wasm):
    """Create a scatter chart each winter of cold loading chart vs frost depth"""
    dfs = {}
    winter_charts = []

    # Loop over years and read in data files
    for startYear in range(2010, 2023):
        yearly_dfs = []
        for city in default_city_list:
            winter = f"{startYear}-{startYear+1}"
            df_temp = read_cold_loading_vs_frost_depth_from_winter_and_city(is_wasm, winter, city)
            yearly_dfs.append(df_temp)
            logger.info(f"FINISHED reading cold loading vs frost depth input files for {city}")
        dfs[winter] = pd.concat(yearly_dfs)

    for name in default_winter_list:
        note = ""
        if name == "2021-2022":
            note = "(INCIDENT: 03/31, 04/23)"
        elif name == "2022-2023":
            note = "(INCIDENT: 04/15)"

        single_winter_df = dfs[name]

        # Create a column for city color
        single_winter_df["CITY_COLOR"] = single_winter_df["CITY"].apply(get_city_color)

        # Create an hvPlot scatter chart of frost depth vs cumulative cold degree days
        figCold = single_winter_df.hvplot.scatter(
            y="FROST_DEPTH_in",
            x="CUMM_COLD_F",
            by="CITY",
            title=f"Frost depth (in) vs Cumulative Freezing Degree-Days {note}",
            xlabel="Degree-Days below freezing",
            ylabel="FROST_DEPTH_in",
            width=800,
            height=600,
            ylim=(0, 90),
            xlim=(0, 2000),
            color="CITY_COLOR",
        )

        # Create horizontal lines for every 12 inches (1 foot) of frost depth
        frost_lines = [hv.Curve([(0, i), (4000, i)]).opts(color="gray") for i in range(12, 100, 12)]

        # Overlay the horizontal lines on top of the scatter chart
        figCold = figCold * hv.Overlay(frost_lines)
        winter_charts.append(pn.pane.HoloViews(figCold))

    # Wrap the winter_charts list in a GridBox layout with two columns
    panel_grid_box = pn.GridBox(*winter_charts, ncols=2)
    return panel_grid_box


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
            height=400,
            width=600,
        ).opts()
        plots.append(plot)

    fig = hv.Layout(plots).cols(1)
    return pn.pane.HoloViews(fig, sizing_mode="stretch_both")


def create_chart_ely_aggregate(is_wasm):
    dfs = []
    global combined_df_ely

    # Loop over years and cities
    for startYear in range(2010, 2023):
        for city in ["ELY"]:
            dfs.append(read_df_from_winter_and_city(is_wasm, f"{startYear}-{startYear+1}", city))
            logger.info(f"FINISHED reading visualization input files for {city}")

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
        height=400,
        width=600,
    ).opts(
        xlabel="Days after July 1",
        xlim=(0, 365),
        ylabel="Degree-Days below freezing",
        ylim=(0, 6000),
    )

    figHot = combined_df_ely.hvplot.line(
        x="INDEX",
        y="CUMM_HOT_F",
        by="CITY",
        title="Cumulative Thaw Degree Days (Ely, MN)",
        height=400,
        width=600,
    ).opts(
        xlabel="Days after July 1",
        xlim=(0, 365),
        ylabel="Degree-Days above thawing",
        ylim=(0, 6000),
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


def create_chart_freeze_thaw(is_wasm, selected_winters):
    """Create charts of freeze and thaw lines"""
    df = read_data_processed_csv_to_df(is_wasm, freeze_thaw_file_name_out)
    df = df[df["Winter"].isin(selected_winters)]
    grouped_df = df.groupby("Winter")
    winter_charts = []

    for winter, winter_df in grouped_df:
        winter_df = winter_df.sort_values(by=["days_after_Jul_1"])
        last_data_point_date = winter_df["Date"].max()
        logger.info(f"last_data_point_date: {last_data_point_date}")
        max_depth_in = winter_df["FROST_DEPTH_in"].max()
        logger.info(f"max_depth_in: {max_depth_in}")

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

        # create a holoviews chart using overlay operator, *
        combined_chart = freeze_line * thaw_line

        # from string 2010-04-06 get just the string month and day
        short_last_date = last_data_point_date[5:10]
        combined_chart.opts(
            opts.Overlay(
                title=f"Frost, Thaw Depth Trends ({winter}, Last Data Point: {short_last_date})",
                width=1200,
                # height=800,
                # responsive = True,
            ),
            opts.Scatter(
                xlabel=f"{winter} last day: {short_last_date}, max in: {str(max_depth_in)}",
                ylabel="Depth (inches)",
                xlim=(90, 365),
                ylim=(-10, 100),
                legend_position="top_left",
            ),
        )

        # Add grey spines
        for i, month_start in enumerate(month_starts):
            month_line = hv.VLine(month_start).opts(line_color="gray", line_width=1)
            month_text = hv.Text(
                month_start + 15, winter_df["THAW_DEPTH_in"].min(), month_names[i]
            ).opts(text_font_size="8pt", align="center")
            combined_chart *= month_line * month_text

        winter_charts.append(combined_chart)
    return winter_charts


# CHART FROST MAX DEPTH


def create_custom_colormap_frost_max_depth():
    colors = ["green", "yellow", "red"]
    cmap = LinearSegmentedColormap.from_list("custom_cmap", colors)
    return cmap


def create_chart_frost_max_depth(is_wasm, selected_winters):
    """Create a chart of the max frost depth"""
    depth_file_name = "frost_depth.csv"
    df = read_data_processed_csv_to_df(is_wasm, depth_file_name)
    logger.info(f"Creating frost depth chart for winters df= {df}")
    if df is None:
        logger.info("Error: df for max frost depth is None")
        return None

    df = df[df["Winter"].isin(selected_winters)]
    cmap = create_custom_colormap_frost_max_depth()
    # Normalize the 'Max_Frost_Depth_in' column to a range of 0-1 for color mapping
    normalized_depth = (df["Max_Frost_Depth_in"] - df["Max_Frost_Depth_in"].min()) / (
        df["Max_Frost_Depth_in"].max() - df["Max_Frost_Depth_in"].min()
    )
    # Convert the normalized depth values to a DataFrame
    df["Normalized_Depth"] = normalized_depth
    avg_depth = np.mean(df["Max_Frost_Depth_in"])

    # Create the bokeh bar chart with the custom colors and rotated x-axis labels and a text label above each bar
    bars = df.hvplot.bar(
        x="Winter",
        y="Max_Frost_Depth_in",
        c="Normalized_Depth",
        cmap=cmap,
        title="Max Frost Depth (Orr, MN) Avg: {:.0f} in".format(avg_depth),
        xlabel="Winter",
        ylabel="Max Frost Depth (in)",
        width=600,
        height=400,
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
    result = pn.Row(chart)
    return result


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


def create_chart_frost_span(is_wasm, selected_winters):
    """Create a chart of the frost span"""
    span_file_name = "frost_span.csv"
    df = read_data_processed_csv_to_df(is_wasm, span_file_name)
    df = prepare_span_df(df)
    df = df[df["Winter"].isin(selected_winters)]
    cmap = create_custom_colormap_frost_span()
    df.groupby("Winter")

    segments = []
    for idx, row in df.iterrows():
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

    # Add vertical lines and month labels
    chart = hv.Overlay(segments)
    for i, month_start in enumerate(month_starts):
        month_line = hv.VLine(month_start).opts(line_color="gray", line_width=1)
        month_text = hv.Text(month_start + 15, df["Winter"].min(), month_names[i]).opts(
            text_font_size="8pt", align="center"
        )
        chart *= month_line * month_text

    # Add a blue vertical line for today based on days after July 1
    now = datetime.now()
    today_days_after_Jul_1 = get_days_after_Jul_1_from_date_string(now)
    today_line = hv.VLine(today_days_after_Jul_1).opts(line_color=today_color, line_width=2)
    chart = today_line * chart

    # Add a vertical line for each incident based on days after July 1
    df = read_data_processed_csv_to_df(is_wasm, incidents_file_name)
    logger.debug(f"incidents df.columns: {df.columns}")

    for idx, row in df.iterrows():
        incident_days_after_Jul_1 = get_days_after_Jul_1_from_date_string(row["Date"])
        incident_line = hv.VLine(incident_days_after_Jul_1).opts(
            line_color=incident_color, line_width=1
        )
        chart = incident_line * chart

    chart = chart.opts(hv.opts.Segments(color="line_color", cmap=cmap, line_width=10))
    chart = chart.redim.label(x="Days After July 1", y="Duration (Days)").opts(
        width=800, height=400
    )
    chart = chart.opts(
        title="Frost Span (Orr, MN)",
        xlabel="Days After July 1",
        ylabel="Winter",
        xlim=(90, 365),
    )
    result = pn.Row(chart)
    return result


# APP =======================================================

# Define variables
title_string = "Freeze Tracker Dashboard"
footer_string = "2023"
ely_temp_pane = pn.pane.Markdown("")
orr_temp_pane = pn.pane.Markdown("")


def empty_chart_placeholder():
    return pn.pane.Markdown("Chart not available.", width=400, height=300, align="center")


def get_current_ely_temp_pane():
    is_wasm = is_WASM()
    temp = get_current_temperature(is_wasm, "ELY")
    if temp is not None:
        return pn.pane.Markdown(f"## Ely: {round(temp)}°F")
    else:
        return pn.pane.Markdown(" ")


def get_current_orr_temp_pane():
    is_wasm = is_WASM()
    temp = get_current_temperature(is_wasm, "ORR")

    if temp is not None:
        return pn.pane.Markdown(f"## Orr: {round(temp)}°F")
    else:
        return pn.pane.Markdown(" ")


def get_current_temps_row():
    return pn.Row(get_current_ely_temp_pane(), get_current_orr_temp_pane())


def create_winters_multiselect_widget():
    winter_list = default_winter_list
    widget = pn.widgets.MultiSelect(
        name="Winters", options=winter_list, value=winter_list, size=13, align="center", width=130
    )
    return widget


def create_open_location_pane():
    pane = pn.pane.Markdown(
        '## [<span>Frost/Thaw (Orr, MN)</span>](https://www.dot.state.mn.us/loadlimits/frost-thaw/orr.html){target="_blank"}'
    )
    return pane


def create_open_probabilities_pane():
    pane = pn.pane.Markdown(
        '## [<span>Probabilites (Ely, old)</span>](https://files.dnr.state.mn.us/natural_resources/climate/normals/freeze_dates/USC00212543.pdf){target="_blank"}'
    )
    return pane


def create_panel_link_pane():
    pane = pn.pane.Markdown(
        '## [<span>Explore Panel</span>](https://panel.holoviz.org/index.html){target="_blank"}'
    )
    return pane


def create_open_map_pane():
    map_iframe = """
    <a href="https://www.google.com/maps/search/?api=1&query=47.375285,-94.119340" target="_blank" style="display: block;">
     <iframe src="https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d1383361.8983193361!2d-94.1193402928368!3d47.375285750004885!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sus!4v1682733814424!5m2!1sen!2sus" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    </a>
    """
    pane = pn.pane.HTML(map_iframe, height=180, width=240)
    return pane


def create_today_pane():
    now = datetime.now()
    formatted_date = now.strftime("%b %d, %Y")
    pane = pn.pane.Markdown(f'<h2 style="color: {today_color};"> {formatted_date}</h2>')
    return pane


def create_incident_pane(incident_date):
    formatted_date = incident_date.strftime("%b %d, %Y")
    pane = pn.pane.Markdown(f'<h3 style="color: red;"> {formatted_date}</h3>')
    return pane


def create_incidents_column():
    incidents = [
        datetime(2022, 3, 31),
        datetime(2022, 4, 23),
        datetime(2023, 4, 15),
    ]
    incidents_column = pn.Column(
        pn.pane.Markdown("## Incidents"),
        *[create_incident_pane(incident) for incident in incidents],
        width_policy="max",
        max_width=150,
    )
    return incidents_column


def create_template_sidebar(winter_multiselect_widget):
    sidebar = pn.Column(
        create_today_pane(),
        create_incidents_column(),
        get_current_temps_row(),
        winter_multiselect_widget,
        create_open_location_pane(),
        create_open_probabilities_pane(),
        create_panel_link_pane(),
        create_open_map_pane(),
        width_policy="max",
        max_width=150,
    )
    return sidebar


class FrostCharts(param.Parameterized):
    is_wasm = is_WASM()

    def __init__(self, selected_winters=[]):
        super().__init__()
        self._selected_winters = selected_winters
        self.param.watch(self._update_charts, "selected_winters")
        self._update_charts()  # Initialize the chart properties

    # Properties to store chart objects
    depth_chart_object = None
    span_chart_object = None
    freeze_thaw_charts_object = None
    loading_charts_object = None

    @property
    def selected_winters(self):
        return self._selected_winters

    @selected_winters.setter
    def selected_winters(self, value):
        self._selected_winters = value

    selected_winters = param.ListSelector(
        default=default_winter_list,
        objects=default_winter_list,
        label="Selected Winters",
    )

    @param.depends("selected_winters")
    def depth_chart(self):
        # column = pn.Column()
        chart = create_chart_frost_max_depth(self.is_wasm, self.selected_winters)
        column = pn.Column(chart, sizing_mode="stretch_both")
        return column

    @param.depends("selected_winters")
    def span_chart(self):
        # column = pn.Column()
        chart = create_chart_frost_span(self.is_wasm, self.selected_winters)
        column = pn.Column(chart, sizing_mode="stretch_both")
        return column

    @param.depends("selected_winters")
    def freeze_thaw_charts(self):
        # charts = []
        charts = create_chart_freeze_thaw(self.is_wasm, self.selected_winters)
        return charts

    @param.depends("selected_winters")
    def loading_charts(self):
        # charts = []
        charts = create_chart_cold_loading(self.is_wasm, self.selected_winters)
        return charts

    @param.depends("selected_winters", watch=True)
    def _update_charts(self, event=None):
        self.depth_chart_object = self.depth_chart()
        self.span_chart_object = self.span_chart()
        self.freeze_thaw_charts_object = self.freeze_thaw_charts()
        self.loading_charts_object = self.loading_charts()


def create_template_main(winter_multiselect_widget):
    """Returns a panel that reacts to changes in the winter_multiselect_widget"""
    frost_charts = FrostCharts(selected_winters=winter_multiselect_widget.value)

    @pn.depends(winter_multiselect_widget.param.value, watch=True)
    def create_main_panel(selected_winters):
        frost_charts.selected_winters = selected_winters

        # create local variables for the reactive chart objects
        depth_panel = frost_charts.depth_chart_object or empty_chart_placeholder()
        span_panel = frost_charts.span_chart_object or empty_chart_placeholder()
        freeze_thaw_charts = frost_charts.freeze_thaw_charts_object
        loading_charts_gridbox = frost_charts.loading_charts_object or empty_chart_placeholder()
        loading_vs_frost_charts_gridbox = (
            create_chart_cold_loading_vs_frost_depth(is_WASM()) or empty_chart_placeholder()
        )

        top_row = pn.Row(depth_panel, span_panel)
        is_wasm = is_WASM()
        ely_aggregate_row = create_chart_ely_aggregate(is_wasm)

        if freeze_thaw_charts is not None:
            freeze_thaw_gridbox = pn.Column(*freeze_thaw_charts, sizing_mode="stretch_width")
        else:
            freeze_thaw_gridbox = empty_chart_placeholder()

        column = pn.Column(
            top_row,
            freeze_thaw_gridbox,
            ely_aggregate_row,
            loading_charts_gridbox,
            loading_vs_frost_charts_gridbox,
        )
        return column

    # return a reactive function that returns a panel
    return create_main_panel


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


def create_dashboard():
    """Create a Panel dashboard.
    The main panel is created with a function that
    reacts to changes in the winter_multiselect_widget"""
    winter_multiselect_widget = create_winters_multiselect_widget()
    create_main_panel = create_template_main(winter_multiselect_widget=winter_multiselect_widget)
    initial_main_panel = create_main_panel(winter_multiselect_widget.value)

    dashboard = pn.template.FastListTemplate(
        title=title_string,
        # favicon="favicon.ico",  # place in this folder
        sidebar=create_template_sidebar(winter_multiselect_widget),
        main=initial_main_panel,
        header=create_github_pane(),  # Add the GitHub icon to the header
    )
    return dashboard


def update_temperatures_callback():
    """Define a callback function to update objects on a scheduled interval"""
    ely_temp_pane.object = get_current_ely_temp_pane().object
    orr_temp_pane.object = get_current_orr_temp_pane().object


def main():
    """Main function. Creates a Panel dashboard,
    sets up periodic updates, and flags the dashboard as servable"""
    dashboard = create_dashboard()
    callback_interval_ms = 15 * 60 * 1000  # every 15 min (in ms)
    pn.state.add_periodic_callback(update_temperatures_callback, callback_interval_ms)
    dashboard.servable()


"""Call main() regardless of how the script is started."""
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