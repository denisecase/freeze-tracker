"""
Main application for the dashboard

In the directory where this file exists, run the following command:

    panel serve --show --autoreload app.py

    Hit CTRL C (at the same time) to stop

    import hvplot.pandas is required for the charts to work


"""
import configparser
import json
import logging
import pathlib
from datetime import datetime

import holoviews as hv
import hvplot.pandas
import numpy as np
import pandas as pd
import panel as pn
import param
import plotly.express as px
import requests
from matplotlib.colors import LinearSegmentedColormap

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
month_starts = [0, 31, 61, 92, 122, 153, 183, 214, 245, 275, 306, 336]
month_names = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"]
city_lat_long = {"ELY": {"lat": 47.9, "lon": -91.86}, "ORR": {"lat": 48.05, "lon": -92.83}}
ely_temp_pane = pn.pane.Markdown("")
orr_temp_pane = pn.pane.Markdown("")

# Define functions to create the components of the dashboard

# Component Ely


def get_data_frame(yearString):
    """Read a file that starts with daily_temps_ into a data frame"""
    try:
        pkg_path = pathlib.Path.cwd()
        src_path = pkg_path.parent
        root_path = src_path.parent
        data_path = root_path.joinpath("data")
        processed_data_path = data_path.joinpath("2_processed")
        fn_start = "daily_temps"
        data_filename_processed = fn_start + "_" + yearString + ".csv"
        f = processed_data_path.joinpath(data_filename_processed)
        print(f"Reading to processed data file {f}")
        df = pd.read_csv(f)
        df["NAME"] = yearString
        return df
    except FileNotFoundError:
        print(f"Error: Data file not found at {f}")
    except Exception as e:
        print(f"Error reading data file: {e}")


def read_config():
    """Read the configuration file"""
    print("Reading config file")
    pkg_path = pathlib.Path.cwd()
    src_path = pkg_path.parent
    root_path = src_path.parent
    config_path = root_path / "config.ini"  # Add the file name to the root path
    config = configparser.ConfigParser()
    config.read(config_path)
    print(f"Config file found at {config_path}")
    print(f"Config file has sections: {config.sections()}")
    return config


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

    @param.depends("winters", watch=False)
    def depth_chart(self):
        chart = create_frost_depth_chart(self.winters)
        return pn.Column(chart, sizing_mode="stretch_both")

    @param.depends("winters", watch=False)
    def span_chart(self):
        chart = create_frost_span_chart(self.winters)
        return pn.Column(chart, sizing_mode="stretch_both")

    # @param.depends("winters", watch=False)
    # def freeze_thaw_charts(self):
    #     chart = create_freeze_thaw_charts(self.winters)
    #     return pn.Column(chart, sizing_mode="stretch_both")

    def _update_charts(self, event):
        self.depth_chart = self.create_frost_depth_chart()
        self.span_chart = self.create_frost_span_chart()
        self.freeze_thaw_charts = self.create_freeze_thaw_charts()

    @property
    def freeze_thaw_charts(self):
        return create_freeze_thaw_charts(self.winters)


def create_custom_colormap():
    colors = ["green", "yellow", "red"]
    cmap = LinearSegmentedColormap.from_list("custom_cmap", colors)
    return cmap


def get_processed_file_path(fname):
    pkg_path = pathlib.Path.cwd()
    src_path = pkg_path.parent
    root_path = src_path.parent
    data_path = root_path.joinpath("data")
    processed_data_path = data_path.joinpath("2_processed")
    processed_file_path = processed_data_path.joinpath(fname)
    logger.info(f"Reading from file {processed_file_path}")
    return processed_file_path


def prepare_freeze_thaw_chart_points():
    """Prepare the freeze and thaw chart points and save them to a CSV file."""
    df = pd.read_csv(get_processed_file_path(freeze_thaw_file_name))
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


def create_frost_depth_chart(selected_winters):
    """Create a chart of the frost depth"""
    df = pd.read_csv(get_processed_file_path(depth_file_name))
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
        title="Max Frost Depth (Orr, MN) Avg: {:.1f} in".format(avg_depth),
        xlabel="Winter",
        ylabel="Max Frost Depth (in)",
        width=600,
        height=400,
        rot=90,
    )
    # Add labels to each bar
    segments = hv.Segments(
        [
            (val_x, val_y, val_x, val_y * 1.05, f"{val_y:.1f}")
            for val_x, val_y in zip(bars.data["Winter"], bars.data["Max_Frost_Depth_in"])
        ],
        kdims=["x0", "y0", "x1", "y1"],
        vdims=["label"],
    ).opts(line_color="black", line_alpha=0.8, align="center")

    chart = bars * segments
    result = pn.Row(chart)
    return result


def create_frost_span_chart(selected_winters):
    """Create a chart of the frost span"""
    df = pd.read_csv(get_processed_file_path(span_file_name))
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

    # Add a vertical line for today based on days after July 1
    now = datetime.now()
    today_days_after_Jul_1 = (now - datetime(now.year, 7, 1)).days
    today_line = hv.VLine(today_days_after_Jul_1).opts(
        line_color="blue", line_dash="dashed", line_width=2
    )
    chart *= today_line

    chart = chart.opts(hv.opts.Segments(color="line_color", cmap=cmap, line_width=10))
    chart = chart.redim.label(x="Days After July 1", y="Duration (Days)").opts(
        width=800, height=400
    )
    chart = chart.opts(
        title="Frost Span (Orr, MN)",
        xlabel="Days After July 1",
        ylabel="Winter",
        xlim=(0, 365),
    )
    result = pn.Row(chart)
    return result

    # """Create a chart of the frost span"""
    # df = pd.read_csv(get_processed_file_path(span_file_name))
    # df = prepare_span_df(df)
    # df = df[df["Winter"].isin(selected_winters)]
    # cmap = create_custom_colormap()
    # df.groupby("Winter")
    # segments = []
    # for idx, row in df.iterrows():
    #     start_text = hv.Text(
    #         row["days_after_Jul_1"],
    #         row["Winter"],
    #         "{:%b %#d}  ".format(row["Frost_Start"]),
    #         halign="right",
    #         fontsize=8,
    #     )
    #     end_text = hv.Text(
    #         row["days_after_Jul_1"] + row["Duration_days"],
    #         row["Winter"],
    #         "  {:%b %#d}".format(row["Frost_End"]),
    #         halign="left",
    #         fontsize=8,
    #     )
    #     segment_data = [
    #         {
    #             "x0": row["days_after_Jul_1"],
    #             "x1": row["days_after_Jul_1"] + row["Duration_days"],
    #             "y0": row["Winter"],
    #             "y1": row["Winter"],
    #             "line_color": row["line_color"],
    #             "start_date": row["Frost_Start"].strftime("%Y-%m-%d"),
    #             "end_date": row["Frost_End"].strftime("%Y-%m-%d"),
    #         }
    #     ]
    #     segment = hv.Segments(
    #         segment_data,
    #         kdims=["x0", "y0", "x1", "y1"],
    #         vdims=["line_color", "start_date", "end_date"],
    #     )
    #     segments.append(segment * start_text * end_text)

    # # Add vertical lines and month labels
    # chart = hv.Overlay(segments)
    # for i, month_start in enumerate(month_starts):
    #     month_line = hv.VLine(month_start).opts(line_color="gray", line_dash="dashed", line_width=1)
    #     month_text = hv.Text(month_start + 15, df["Winter"].min(), month_names[i]).opts(
    #         text_font_size="8pt", align="center"
    #     )
    #     chart *= month_line * month_text

    # # Add a vertical line for today based on days after July 1
    # # use matplotlib.dates.date2num
    # now = datetime.now()
    # today_days_after_Jul_1 = date2num(now) - date2num(now.replace(month=7, day=1))
    # today_line = hv.VLine(today_days_after_Jul_1).opts(line_color="blue", line_dash="dashed", line_width=2)
    # chart *= today_line

    # chart = chart.opts(hv.opts.Segments(color="line_color", cmap=cmap, line_width=10))
    # chart = chart.redim.label(x="Days After July 1", y="Duration (Days)").opts(
    #     width=800, height=400
    # )
    # #hover = HoverTool(tooltips=[("Start Date", "@start_date"), ("End Date", "@end_date")])
    # chart = chart.opts(
    #     title="Frost Span (Orr, MN)",
    #     xlabel="Days After July 1",
    #     ylabel="Winter",
    #     xlim=(0, 365),
    #     #tools=[hover]
    # )
    # result = pn.Row(chart)
    # return result


def create_freeze_thaw_charts(selected_winters):
    """Create charts of freeze and thaw lines"""
    df = pd.read_csv(get_processed_file_path(freeze_thaw_file_name_out))
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

        combined_chart = (freeze_line * thaw_line).opts(
            title="Frost and Thaw Depth Trends (Orr, MN)",
            # title=f"{winter} (Last Data Point: {last_data_point_date})",
            xlabel="Days After July 1",
            ylabel="Depth (inches)",
            width=400,
            height=300,
            legend_position="top_left",
            xlim=(0, 365),
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


def create_panel_link_pane():
    pane = pn.pane.Markdown("## [Panel](https://panel.holoviz.org/index.html)")
    return pane


def create_location_pane():
    pane = pn.pane.Markdown(
        "## [Orr, MN](https://www.dot.state.mn.us/loadlimits/frost-thaw/orr.html)"
    )
    return pane


def create_today_pane():
    now = datetime.now()
    formatted_date = now.strftime("%b %d")
    pane = pn.pane.Markdown(f"# {formatted_date}")
    return pane


def create_template_sidebar(winter_multiselect_widget):
    sidebar = pn.Column(
        create_today_pane(),
        get_current_ely_temp_pane(),
        get_current_orr_temp_pane(),
        winter_multiselect_widget,
        create_location_pane(),
        create_panel_link_pane(),
        width_policy="max",
        max_width=150,
    )
    return sidebar


def create_template_main(selected_winters):
    frost_charts = FrostCharts(winters=selected_winters)

    depth_panel = frost_charts.depth_chart
    span_panel = frost_charts.span_chart
    top_row = pn.Row(depth_panel, span_panel, sizing_mode="stretch_both")

    freeze_thaw_charts = frost_charts.freeze_thaw_charts
    freeze_thaw_grid = pn.GridBox(
        *freeze_thaw_charts,
        ncols=3,
        sizing_mode="stretch_both",
        max_height=800,
    )
    ely_aggregate = create_ely_aggregate()
    main_panel = pn.Column(top_row, freeze_thaw_grid, ely_aggregate)
    return main_panel


def create_dashboard():
    winter_multiselect_widget = create_winters_multiselect_widget()
    template_main = create_template_main(selected_winters=winter_multiselect_widget.value)
    dashboard = pn.template.FastListTemplate(
        title=title_string,
        favicon="favicon.ico",
        sidebar=create_template_sidebar(winter_multiselect_widget),
        main=template_main,
    )
    frost_charts = FrostCharts()
    pn.bind(frost_charts, "winters", winter_multiselect_widget)
    return dashboard


def update_temperatures():
    ely_temp_pane.object = get_current_ely_temp_pane().object
    orr_temp_pane.object = get_current_orr_temp_pane().object


def main():
    # Create the dashboard
    dashboard = create_dashboard()

    # Update the temperatures every 5 minutes using a callback
    callback_interval = 5 * 60 * 1000  # in milliseconds (5 minutes)
    pn.state.add_periodic_callback(update_temperatures, callback_interval)

    # Start serving the dashboard
    dashboard.servable()

main()
