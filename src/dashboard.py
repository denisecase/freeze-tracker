"""

src/dashboard.py

This file creates a dashboard to display the data.

"""
from daily_visualization import get_data_frame
from dash import Dash, dcc, html
from dash.dependencies import Input, Output

app = Dash(__name__)

# Get the data frame with cumulative cold degree days
df = get_data_frame()

# Define the layout of the app
app.layout = html.Div(
    children=[
        html.H1(children="Cumulative Cold Degree Days"),
        dcc.Checklist(
            id="year-selector",
            options=[
                {"label": "2021-2022", "value": "2021-2022"},
                {"label": "2022-2023", "value": "2022-2023"},
            ],
            value=["2021-2022", "2022-2023"],
        ),
        dcc.Graph(
            id="cumulative_cold_degrees",
        ),
    ]
)


# Define the callback to update the graph when the user changes the year selection
@app.callback(
    Output("cumulative_cold_degrees", "figure"),
    [Input("year-selector", "value")],
)
def update_figure(selected_years):
    data = [
        {
            "x": df.loc[df["WINTER"] == year, "Date"],
            "y": df.loc[df["WINTER"] == year, "cumulative_cold_degrees"],
            "type": "line",
            "name": year,
        }
        for year in selected_years
    ]
    return {
        "data": data,
        "layout": {"title": "Cumulative Cold Degree Days"},
    }


if __name__ == "__main__":
    app.run_server(debug=True)
