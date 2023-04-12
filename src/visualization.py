"""

src/data_visualization.py

This file reads in all the files from the data folder
and charts the data using Plotly.

The user can select which files appear in the chart.
The x-axis is the date from July 1 to June 30 always.
The y-axis is CUMM_COLD_F and/or CUMM_HOT_F.

All data files are stored in:
../data/2_processed/folder

For example:
daily_temps_2011-2012.csv (July 1, 2011 - June 30, 2012)

"""
import pandas as pd
import pathlib as pl
import configparser
import plotly.express as px

def get_data_frame(yearString):
    """Read a file into a data frame"""
    try:
        data_folder = config['data']['data_folder']
        data_subfolder_processed = config['data']['data_subfolder_processed']
        data_filename_processed = config['data']['data_filename_processed_short'] + "_" + yearString + ".csv"
        root_path = pl.Path.cwd()
        print(f"Root path is {root_path}")
        f = root_path.joinpath(data_folder).joinpath(data_subfolder_processed).joinpath(data_filename_processed)
        print(f"Reading to processed data file {f}")
        df = pd.read_csv(f)
        df['NAME'] = yearString
        return df
    except FileNotFoundError:
        print(f"Error: Data file not found at {f}")
    except Exception as e:
        print(f"Error reading data file: {e}")

def read_config():
    """Read the configuration file"""
    print("Reading config file")
    config = configparser.ConfigParser()
    config.read("config.ini")
    print(f"Config file has sections: {config.sections()}")
    return config

def plot_cumulative_data(names, cumulative_types):
    # Check if the provided cumulative types are valid
    valid_cumulative_types = ['CUMM_COLD_F', 'CUMM_HOT_F']
    if not set(cumulative_types).issubset(valid_cumulative_types):
        raise ValueError("Invalid cumulative_types. Choose from 'CUMM_COLD_F', 'CUMM_HOT_F'.")

    filtered_df = combined_df[combined_df['NAME'].isin(names)]

    # Create a new DataFrame with columns for 'INDEX', 'Value', 'NAME', and 'Type'
    plot_df = pd.DataFrame(columns=['INDEX', 'Value', 'NAME', 'Type'])

    for cumulative_type in cumulative_types:
        temp_df = filtered_df[['INDEX', cumulative_type, 'NAME']].copy()
        temp_df.columns = ['INDEX', 'Value', 'NAME']
        temp_df['Type'] = cumulative_type
        plot_df = plot_df._append(temp_df)

    fig = px.line(plot_df,
                  x="INDEX",
                  y="Value",
                  color="NAME",
                  line_dash="Type",
                  title="Cumulative Degree Days",
                  labels={"Value": "Degree Days"})

    fig.show()


def main():
    """Main entry point of the script"""
    print("START visualization script")

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
    combined_df['DATE'] = pd.to_datetime(combined_df['DATE'])

    # Reset index to start from July 1
    combined_df['Days'] = (combined_df['DATE'] - pd.to_datetime(combined_df['IYEAR'].astype(str) + '-07-01', format='%Y-%m-%d')).dt.days

    # Call the new function with the desired names and cumulative_type
    names_to_show = ["2019-2020","2020-2021", "2021-2022", "2022-2023"]
    cumulative_types = ["CUMM_COLD_F" ,"CUMM_HOT_F"]
    plot_cumulative_data(names_to_show, cumulative_types)

    figCold = px.line(
        combined_df,
        x="INDEX",
        y="CUMM_COLD_F",
        color="NAME",
        line_group="NAME", 
        title="Cumulative Freeze Degree Days",
    )

    # # Add a second x-axis label for IMONTH
    # figCold.update_layout(
    # xaxis2=dict(
    #     tickmode="array",
    #     tickvals=combined_df["INDEX"],
    #     ticktext=combined_df["IMONTH"],
    #     overlaying="x",
    #     side="top",
    #     anchor="y2",
    #     title="Month",
    # ),
    # )   

    figCold.show()

    figHot = px.line(
        combined_df,
        x="INDEX",
        y="CUMM_HOT_F",
        color="NAME",
        title="Cumulative Thaw Degree Days",
    )
    figHot.show()

if __name__ == "__main__":
    main()
