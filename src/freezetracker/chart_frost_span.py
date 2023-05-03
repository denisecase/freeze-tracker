"""
Chart - max frost depth
"""

from datetime import datetime

import holoviews as hv
import hvplot.pandas  # noqa
import pandas as pd
import panel as pn
from holoviews import Options, dim, opts  # noqa
from matplotlib.colors import LinearSegmentedColormap

hv.extension("bokeh", "matplotlib")
pn.extension(sizing_mode="stretch_width")

from freezetracker.common_content import (
    get_days_after_Jul_1_from_date_string,
    incidents_file_name,
    month_names,
    month_starts,
)
from freezetracker.common_logger import get_basename, get_logger
from freezetracker.data_load import read_data_processed_csv_to_df

module_name = get_basename(__file__)
logger = get_logger(module_name)


span_file_name = "frost_span.csv"
span_file_name_out = "frost_span_out.csv"


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


def create_custom_colormap():
    colors = ["green", "yellow", "red"]
    cmap = LinearSegmentedColormap.from_list("custom_cmap", colors)
    return cmap


def create_chart_frost_span(is_wasm, selected_winters):
    """Create a chart of the frost span"""
    df = read_data_processed_csv_to_df(is_wasm, span_file_name)
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
    today_days_after_Jul_1 = get_days_after_Jul_1_from_date_string(now)
    today_line = hv.VLine(today_days_after_Jul_1).opts(
        line_color="blue", line_dash="dashed", line_width=2
    )
    chart = today_line * chart

    # Add a red vertical line for each incident based on days after July 1
    df = read_data_processed_csv_to_df(is_wasm, incidents_file_name)
    logger.debug(f"incidents df.columns: {df.columns}")
    
    for idx, row in df.iterrows():
        incident_days_after_Jul_1 = get_days_after_Jul_1_from_date_string(row["Date"])
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
