"""
Chart - max frost depth
"""

import holoviews as hv
import hvplot.pandas  # noqa
import numpy as np
import panel as pn
from holoviews import Options, dim, opts  # noqa
from matplotlib.colors import LinearSegmentedColormap

from freezetracker.common_logger import get_logger
from freezetracker.data_load import read_data_processed_csv_to_df

logger = get_logger("chart_frost_max_depth")

depth_file_name = "frost_depth.csv"


def create_custom_colormap():
    colors = ["green", "yellow", "red"]
    cmap = LinearSegmentedColormap.from_list("custom_cmap", colors)
    return cmap


def create_chart_frost_max_depth(is_wasm, selected_winters):
    """Create a chart of the max frost depth"""
    df = read_data_processed_csv_to_df(is_wasm, depth_file_name)
    logger.info(f"Creating frost depth chart for winters df= {df}")
    if df is None:
        logger.info("Error: df for max frost depth is None")
        return None

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
