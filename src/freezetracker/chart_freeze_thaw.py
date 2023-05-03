"""
Chart - freeze thaw
"""


import holoviews as hv
import hvplot.pandas  # noqa
import pandas as pd
from holoviews import Options, dim, opts  # noqa

from freezetracker.common_content import (
    calculate_winter_start_year,
    get_data_processed_path_from_code_folder,
    month_names,
    month_starts,
)
from freezetracker.common_logger import get_basename, get_logger
from freezetracker.data_load import read_data_processed_csv_to_df

module_name = get_basename(__file__)
logger = get_logger(module_name)

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
