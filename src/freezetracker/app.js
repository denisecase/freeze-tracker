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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.4/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.4/dist/wheels/panel-0.14.4-py3-none-any.whl', 'pyodide-http==0.1.0', 'configparser', 'datetime', 'holoviews>=1.15.4', 'holoviews>=1.15.4', 'hvplot', 'io', 'json', 'logging', 'matplotlib', 'numpy', 'pandas', 'param', 'pathlib', 'plotly', 'requests', 'typing']
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


"""
import configparser
import io
import json
import logging
import pathlib
import sys
from datetime import datetime
from typing import Union

import holoviews as hv
import hvplot.pandas # noqa
import numpy as np
import pandas as pd
import panel as pn
import param
import plotly.express as px
import requests
from bokeh.document import Document
from matplotlib.colors import LinearSegmentedColormap
from holoviews import Options, dim, opts # noqa

hv.extension("bokeh")
pn.extension(sizing_mode="stretch_width")

logging.basicConfig(filename="example.log", level=logging.DEBUG)
logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.info("Starting Freeze Tracker Dashboard")

# Define variables

title_string = "Freeze Tracker Dashboard"
footer_string = "2023"
depth_file_name = "frost_depth.csv"
span_file_name = "frost_span.csv"
freeze_thaw_file_name = "frost_stlouis.csv"
depth_file_name_out = "frost_depth_out.csv"
span_file_name_out = "frost_span_out.csv"
freeze_thaw_file_name_out = "frost_stlouis_out.csv"
incidents_file_name = "incidents.csv"
month_starts = [0, 31, 61, 92, 122, 153, 183, 214, 245, 275, 306, 336]
month_names = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"]
city_lat_long = {"ELY": {"lat": 47.9, "lon": -91.86}, "ORR": {"lat": 48.05, "lon": -92.83}}
ely_temp_pane = pn.pane.Markdown("")
orr_temp_pane = pn.pane.Markdown("")

# Define functions to create the components of the dashboard

def is_WASM() -> bool:
    """Determine if the environment is WASM or local.
    False == False != True is 
    True in Python and False in WASM
    """
    if False == False != True:
        return False # Python
    else:
        return True # WASM

def get_data_frame(yearString):
    """Read a file that starts with daily_temps_ into a data frame
    @ param yearString: string with the year range, e.g. "2019-2020
    @ return: data frame with the data"""
    fn_start = "daily_temps"
    fname = fn_start + "_" + yearString + ".csv"
    df = read_data_csv_file_processed(fname)
    df["NAME"] = yearString
    return df

def read_config() -> Union[configparser.ConfigParser, None]:
    """Read the configuration file"""
    github_repo = "freeze-tracker"
    fname = "config.ini"
    username = "denisecase"
    from_github = is_WASM()
    print(f"Reading data from github: {from_github}")
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
 

def plot_cumulative_data(names, cumulative_types):
    # Check if the provided cumulative types are valid
    valid_cumulative_types = ["CUMM_COLD_F", "CUMM_HOT_F"]
    if not set(cumulative_types).issubset(valid_cumulative_types):
        raise ValueError("Invalid cumulative_types. Choose from 'CUMM_COLD_F', 'CUMM_HOT_F'.")

    filtered_df = combined_df[combined_df["NAME"].isin(names)]
    # Create a new DataFrame with columns for 'INDEX', 'Value', 'NAME', and 'Type'
    plot_df = pd.DataFrame(columns=["INDEX", "Value", "NAME", "Type"])

    for cumulative_type in cumulative_types:
        temp_df = filtered_df[["INDEX", cumulative_type, "NAME"]].copy()
        temp_df.columns = ["INDEX", "Value", "NAME"]
        temp_df["Type"] = cumulative_type
        plot_df = plot_df._append(temp_df)

    fig = px.line(
        plot_df,
        x="INDEX",
        y="Value",
        color="NAME",
        line_dash="Type",
        title="Cumulative Degree Days",
        labels={"Value": "Degree Days"},
    )

    # fig.show()
    return pn.pane.Plotly(fig, sizing_mode="stretch_both")


def create_ely_aggregate():
    global config
    config = read_config()
    dfs = []
    global combined_df

    # Loop over years and write yearly data to separate files
    for startYear in range(2010, 2023):
        dfs.append(get_data_frame(f"{startYear}-{startYear+1}"))
        print("FINISHED reading visualization input files")

    # Concatenate all dataframes into one
    combined_df = pd.concat(dfs)

    # Ensure the 'DATE' column has a consistent data type
    combined_df["DATE"] = pd.to_datetime(combined_df["DATE"])

    # Reset index to start from July 1
    combined_df["Days"] = (
        combined_df["DATE"]
        - pd.to_datetime(combined_df["IYEAR"].astype(str) + "-07-01", format="%Y-%m-%d")
    ).dt.days

    # Call the new function with the desired names and cumulative_type
    names_to_show = ["2019-2020", "2020-2021", "2021-2022", "2022-2023"]
    cumulative_types = ["CUMM_COLD_F", "CUMM_HOT_F"]
    plot_cumulative_data(names_to_show, cumulative_types)

    figCold = px.line(
        combined_df,
        x="INDEX",
        y="CUMM_COLD_F",
        color="NAME",
        line_group="NAME",
        title="Cumulative Freeze Degree Days (Ely, MN)",
    )
    figCold.update_layout(height=400, width=600)
    figHot = px.line(
        combined_df,
        x="INDEX",
        y="CUMM_HOT_F",
        color="NAME",
        title="Cumulative Thaw Degree Days (Ely, MN)",
    )
    figHot.update_layout(height=400, width=600)
    col_cold = pn.Column(figCold)
    col_hot = pn.Column(figHot)
    component = pn.Row(col_cold, col_hot)
    return component


# More............


def get_current_temperature(city):
    lat = city_lat_long[city]["lat"]
    lon = city_lat_long[city]["lon"]
    global config
    config = read_config()
    api_key = config.get("api", "OPEN_WEATHER_MAP_API_KEY")
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


def get_current_ely_temp_pane():
    temp = get_current_temperature("ELY")
    if temp is not None:
        return pn.pane.Markdown(f"## Ely: {round(temp)}°F")
    else:
        return pn.pane.Markdown(" ")


def get_current_orr_temp_pane():
    temp = get_current_temperature("ORR")
    if temp is not None:
        return pn.pane.Markdown(f"## Orr: {round(temp)}°F")
    else:
        return pn.pane.Markdown(" ")
    
def get_current_temps_row():
    return pn.Row(
        get_current_ely_temp_pane(), 
        get_current_orr_temp_pane()
        )

def create_custom_colormap():
    colors = ["green", "yellow", "red"]
    cmap = LinearSegmentedColormap.from_list("custom_cmap", colors)
    return cmap


def prepare_freeze_thaw_chart_points():
    """Prepare the freeze and thaw chart points and save them to a CSV file."""
    df = read_data_csv_file_processed(freeze_thaw_file_name)
    df = prepare_freeze_thaw_df(df)
    df.to_csv(get_processed_file_path(freeze_thaw_file_name_out), index=False)
    logger.info(f"Saved file {freeze_thaw_file_name_out}")


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

def get_processed_file_path(fname):
    pkg_path = pathlib.Path.cwd()
    src_path = pkg_path.parent
    root_path = src_path.parent
    data_path = root_path.joinpath("data")
    processed_data_path = data_path.joinpath("2_processed")
    processed_file_path = processed_data_path.joinpath(fname)
    logger.info(f"Reading from file {processed_file_path}")
    return processed_file_path

def read_data_csv_file_processed(fname):
    github_repo = "freeze-tracker"
    data_subfolder = "2_processed"
    username = "denisecase"
    from_github = is_WASM()
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
            full_path = get_processed_file_path(fname)
            df = pd.read_csv(full_path)
            # print column names
            logger.info(f"Columns: {df.columns}")
            logger.info(f"Read {len(df)} rows from {full_path}")
            return df
        except FileNotFoundError:
            print(f"Error: Data file not found at {full_path}")
        except Exception as e:
            print(f"Error reading data file: {e}")


def create_frost_depth_chart(selected_winters):
    """Create a chart of the max frost depth"""
    df = read_data_csv_file_processed(depth_file_name)
    df = df[df["Winter"].isin(selected_winters)]
    cmap = create_custom_colormap()
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


def create_frost_span_chart(selected_winters):
    """Create a chart of the frost span"""
    df = read_data_csv_file_processed(span_file_name)
    df = prepare_span_df(df)
    df = df[df["Winter"].isin(selected_winters)]
    cmap = create_custom_colormap()
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
        month_line = hv.VLine(month_start).opts(line_color="gray", line_dash="dashed", line_width=1)
        month_text = hv.Text(month_start + 15, df["Winter"].min(), month_names[i]).opts(
            text_font_size="8pt", align="center"
        )
        chart *= month_line * month_text

    # Add a blue vertical line for today based on days after July 1
    now = datetime.now()
    today_days_after_Jul_1 = get_days_after_Jul_1(now)
    today_line = hv.VLine(today_days_after_Jul_1).opts(
        line_color="blue", line_dash="dashed", line_width=2
    )
    chart = today_line * chart

    # Add a red vertical line for each incident based on days after July 1
    df = read_data_csv_file_processed(incidents_file_name)
    logger.debug(f"incidents df.columns: {df.columns}")
    for idx, row in df.iterrows():
        incident_days_after_Jul_1 = get_days_after_Jul_1(row["Date"])
        incident_line = hv.VLine(incident_days_after_Jul_1).opts(
            line_color="red", line_dash="dashed", line_width=1
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

def get_days_after_Jul_1(date_string):
    """Return the number of days after July 1 for the given date"""
    date = pd.to_datetime(date_string)
    if date.month >= 7:
        start_year = date.year
    else:
        start_year = date.year - 1
    today_days_after_Jul_1 = (date - datetime(start_year, 7, 1)).days
    return today_days_after_Jul_1


def create_freeze_thaw_charts(selected_winters):
    """Create charts of freeze and thaw lines"""
    df = read_data_csv_file_processed(freeze_thaw_file_name_out)
    df = df[df["Winter"].isin(selected_winters)]
    grouped_df = df.groupby("Winter")
    winter_charts = []
    for winter, winter_df in grouped_df:
        winter_df = winter_df.sort_values(by=["days_after_Jul_1"])
        last_data_point_date = winter_df["Date"].max()
        logger.info(f"last_data_point_date: {last_data_point_date}")

        freeze_line = winter_df.hvplot.line(
            x="days_after_Jul_1",
            y="FROST_DEPTH_in",
            color="blue",
            line_width=2,
            label="Frost depth, in",
        )
        thaw_line = winter_df.hvplot.line(
            x="days_after_Jul_1",
            y="THAW_DEPTH_in",
            color="red",
            line_width=2,
            label="Thaw depth, in",
        )

        # using hv.extension("bokeh")
        combined_chart = freeze_line * thaw_line
        # from string 2010-04-06 get just the string month and day
        short_last_date = last_data_point_date[5:10]
        combined_chart.opts(
            opts.Overlay(
                title=f"Frost and Thaw Depth Trends ({winter}, Last Data Point: {short_last_date})",
                width=400,
                height=300,
                legend_position="top_left",
            ),
            opts.Curve(
                xlabel=f"{winter} last day: {short_last_date}",
                ylabel="Depth (inches)",
                xlim=(90, 365),
            ),
        )

        # Add grey dashed spines
        for i, month_start in enumerate(month_starts):
            month_line = hv.VLine(month_start).opts(
                line_color="gray", line_dash="dashed", line_width=1
            )
            month_text = hv.Text(
                month_start + 15, winter_df["THAW_DEPTH_in"].min(), month_names[i]
            ).opts(text_font_size="8pt", align="center")
            combined_chart *= month_line * month_text

        winter_charts.append(combined_chart)
    return winter_charts



def create_winters_multiselect_widget():
    winter_list = [
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
        "2022-2023",
    ]
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
    pane = pn.pane.Markdown(f'<h2 style="color: blue;"> {formatted_date}</h2>')
    return pane

def create_incident_pane(incident_date):
    formatted_date = incident_date.strftime("%b %d, %Y")
    pane = pn.pane.Markdown(f'<h3 style="color: red;"> {formatted_date}</h3>')
    return pane

def create_incidents_pane():
    incidents = [
        datetime(2022, 3, 31),
        datetime(2022, 4, 23),
        datetime(2023, 4, 15),
    ]
    incidents_pane = pn.Column(
        pn.pane.Markdown("## Incidents"),
        *[create_incident_pane(incident) for incident in incidents],
        width_policy="max",
        max_width=150
    )
    return incidents_pane

def create_template_sidebar(winter_multiselect_widget):
    sidebar = pn.Column(
        create_today_pane(),
        create_incidents_pane(),
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
    def __init__(self, **params):
        super().__init__(**params)
        self.param.watch(self._update_charts, "winters")

    winters = param.ListSelector(
        default=[
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
        ],
        objects=[
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
        ],
        label="Winters",
    )

    @param.depends("winters")
    def depth_chart(self):
        chart = create_frost_depth_chart(self.winters)
        return pn.Column(chart, sizing_mode="stretch_both")

    @param.depends("winters")
    def span_chart(self):
        chart = create_frost_span_chart(self.winters)
        return pn.Column(chart, sizing_mode="stretch_both")
    
    @param.depends("winters")
    def freeze_thaw_charts(self):
        return create_freeze_thaw_charts(self.winters)

    @param.depends('winters', watch=True)
    def _update_charts(self, event):
        self.depth_chart = self.depth_chart()
        self.span_chart = self.span_chart()
        self.freeze_thaw_charts = self.freeze_thaw_charts()



def create_template_main(winter_multiselect_widget):
    '''Returns a panel that reacts to changes in the winter_multiselect_widget'''
    frost_charts = FrostCharts(winters=winter_multiselect_widget.value)

    @pn.depends(winter_multiselect_widget.param.value, watch=True)
    def create_main_panel(selected_winters):
        frost_charts.winters = selected_winters

        depth_panel = frost_charts.depth_chart()
        span_panel = frost_charts.span_chart()
        top_row = pn.Row(depth_panel, span_panel)
        ely_aggregate_row = create_ely_aggregate()

        freeze_thaw_charts = frost_charts.freeze_thaw_charts()  
        freeze_thaw_grid = pn.GridBox(
            *freeze_thaw_charts,
            ncols=2
        )

        column = pn.Column(
            top_row,
            freeze_thaw_grid,
            ely_aggregate_row
        )

        return column
    return create_main_panel

def create_dashboard():
    winter_multiselect_widget = create_winters_multiselect_widget()
    template_main = create_template_main(winter_multiselect_widget=winter_multiselect_widget)
    dashboard = pn.template.FastListTemplate(
        title=title_string,
        favicon="favicon.ico",
        sidebar=create_template_sidebar(winter_multiselect_widget),
        main=template_main,  # Remove the parentheses here
    )
    return dashboard



def update_temperatures():
    ely_temp_pane.object = get_current_ely_temp_pane().object
    orr_temp_pane.object = get_current_orr_temp_pane().object


def main():
    # Create the dashboard
    dashboard = create_dashboard()

    # Update the temperatures every 5 minutes using a callback
    callback_interval = 15 * 60 * 1000  # in milliseconds (15 minutes)
    pn.state.add_periodic_callback(update_temperatures, callback_interval)

    # Start serving the dashboard
    dashboard.servable()


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