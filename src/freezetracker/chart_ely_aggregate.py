"""
Chart - ely aggregate
"""

import hvplot.pandas  # noqa
import pandas as pd
import panel as pn
import plotly.express as px
from holoviews import Options, dim, opts  # noqa

from freezetracker.common_content import default_winter_list
from freezetracker.common_logger import get_basename, get_logger
from freezetracker.data_load import read_data_processed_csv_to_df

module_name = get_basename(__file__)
logger = get_logger(module_name)


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


def create_chart_ely_aggregate(is_wasm):
    dfs = []
    global combined_df

    # Loop over years and cities
    for startYear in range(2010, 2023):
        for city in ["ELY"]:
            dfs.append(read_df_from_winter_and_city(is_wasm, f"{startYear}-{startYear+1}", city))
            logger.info(f"FINISHED reading visualization input files for {city}")

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
    names_to_show = default_winter_list
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
    figCold.update_xaxes(title_text="Days after July 1", range=[0, 365])
    figCold.update_yaxes(title_text="Degree-Days below freezing", range=[0, 6000])
    figCold.update_layout(height=400, width=600)

    figHot = px.line(
        combined_df,
        x="INDEX",
        y="CUMM_HOT_F",
        color="CITY",
        line_group="NAME",
        title="Cumulative Thaw Degree Days (Ely, MN)",
    )
    figHot.update_xaxes(title_text="Days after July 1", range=[0, 365])
    figHot.update_yaxes(title_text="Degree-Days above thawing", range=[0, 6000])

    figHot.update_layout(height=400, width=600)
    col_cold = pn.Column(figCold)
    col_hot = pn.Column(figHot)
    component = pn.Row(col_cold, col_hot)
    return component
