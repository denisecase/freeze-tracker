"""
Chart - cold loading
"""
import holoviews as hv
import hvplot.pandas  # noqa
import pandas as pd
import panel as pn
import plotly.express as px
from common_content import default_city_list
from holoviews import Options, dim, opts  # noqa
from holoviews.plotting.plotly import PlotlyRenderer

from freezetracker.common_content import (
    calculate_winter_start_year,
    get_data_processed_path_from_code_folder,
    month_names,
    month_starts,
)
from freezetracker.common_logger import get_logger
from freezetracker.data_load import read_data_processed_csv_to_df

hv.extension("bokeh")

logger = get_logger("chart_cold_loading")


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
    """Create a cold loading chart
    and a hot loading chart
    for each winter using Plotly"""

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

        '''Incidents: 
            Winter,Date
            2021-2022,2022/03/31
            2021-2022,2022/04/23
            2022-2023,2023/04/15
        '''
        note = ""
        if name == "2021-2022":
            note = "INCIDENT: 03/31, 04/23"
        elif name == "2022-2023":
            note = "INCIDENT: 04/15"

        single_winter_df = dfs[name]

        # Ensure the 'DATE' column has a consistent data type
        single_winter_df["DATE"] = pd.to_datetime(single_winter_df["DATE"])

        # Reset index to start from July 1
        single_winter_df["Days"] = (
            single_winter_df["DATE"]
            - pd.to_datetime(single_winter_df["IYEAR"].astype(str) + "-07-01", format="%Y-%m-%d")
        ).dt.days


        # Create a Plotly line chart of cumulative cold degree days
        figCold = px.line(
            single_winter_df,
            x="INDEX",
            y="CUMM_COLD_F",
            color="CITY",
            line_group="NAME",
            title=f"Cumulative Freezing Degree Days - {name}",
            labels={"CITY": "City"},
        )
        figCold.update_xaxes(title_text=f"Days after July 1 ({note})", range=[0, 365])
        figCold.update_yaxes(title_text="Degree-Days below freezing", range=[0, 6000])
        figCold.update_layout(height=400, width=600)

        # # Convert the Plotly chart to a Holoviews chart
        # hv_fig_cold = PlotlyRenderer.to_holoviews(figCold)

        # # Add grey dashed spines
        # for i, month_start in enumerate(month_starts):
        #     month_line = hv.VLine(month_start).opts(
        #         line_color="gray", line_dash="dashed", line_width=1
        #     )
        #     month_text = hv.Text(
        #         month_start + 15, single_winter_df["CUMM_COLD_F"].min(), month_names[i]
        #     ).opts(text_font_size="8pt", align="center")
        #     hv_fig_cold *= month_line * month_text

        # # Display the Holoviews chart
        # hv_fig_cold.opts(width=600, height=400)

        # Create a Plotly line chart of cumulative hot degree days
        figHot = px.line(
            single_winter_df,
            x="INDEX",
            y="CUMM_HOT_F",
            color="CITY",
            line_group="NAME",
            title=f"Cumulative Thaw Degree Days - {name}",
            labels={"CITY": "City"},
        )
        figHot.update_xaxes(title_text="Days after July 1", range=[0, 365])
        figHot.update_yaxes(title_text="Degree-Days above thawing", range=[0, 6000])
        figHot.update_layout(height=400, width=600)

        winter_charts.append(pn.pane.Plotly(figCold))
        winter_charts.append(pn.pane.Plotly(figHot))

    # Wrap the winter_charts list in a GridBox layout with two columns
    panel_grid_box = pn.GridBox(*winter_charts, ncols=2)

    return panel_grid_box
