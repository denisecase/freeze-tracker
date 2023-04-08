# tests/test_dashboard.py

from dash import Dash, dcc, html
from dash.testing import wait
import src.dashboard as dashboard

def test_layout():
    """
    Test that the dashboard has the expected layout
    """
    app = Dash(__name__)
    layout = app.layout
    assert isinstance(layout, html.Div)
    assert layout.children[0].text == "Cumulative Cold Degree Days"
    assert isinstance(layout.children[1], dcc.Checklist)
    assert isinstance(layout.children[2], dcc.Graph)
    assert layout.children[2].id == "cumulative_cold_degrees"


def test_callback():
    """
    Test that the callback updates the graph correctly
    """
    app = Dash(__name__)
    test_client = app.test_client()
    response = test_client.get("/")
    assert response.status_code == 200
    assert b"Cumulative Cold Degree Days" in response.data
    assert b"2021-2022" in response.data
    assert b"2022-2023" in response.data
    assert (
        b'<div id="cumulative_cold_degrees" class="plotly-graph-div">' in response.data
    )

    # simulate the user selecting a different year
    selected_years = ["2021-2022"]
    query_string = "year-selector={}".format("&year-selector=".join(selected_years))
    response = test_client.get("/?{}".format(query_string))
    assert response.status_code == 200
    assert b"Cumulative Cold Degree Days" in response.data
    assert b"2021-2022" in response.data
    assert b"2022-2023" not in response.data
    assert (
        b'<div id="cumulative_cold_degrees" class="plotly-graph-div">' in response.data
    )

    # wait for the callback to complete
    wait()

    # check that the graph has been updated with the new data
    response = test_client.get("/")
    assert response.status_code == 200
    assert b"Cumulative Cold Degree Days" in response.data
    assert b"2021-2022" in response.data
    assert b"2022-2023" not in response.data
    assert (
        b'<div id="cumulative_cold_degrees" class="plotly-graph-div">' in response.data
    )
