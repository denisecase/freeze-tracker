"""
Main application for the dashboard

In the directory where this file exists, run the following command:

    panel serve --show --autoreload app.py

    Hit CTRL C (at the same time) to stop

    import hvplot.pandas is required for the charts to work 
    - add noqa comment so linting and sorting don't remove it

    
In Holoviews, both + and * operators are used to combine elements.

* (Overlay): The * operator is used to overlay elements 
on top of each other in the same plot. 
When you use the * operator with Holoviews elements, 
the result is a single plot with all elements displayed together. 
Used to show multiple plot elements simultaneously within the same coordinate system, 
as in our freeze_points and thaw_points.

+ (Layout): The + operator is used to create a layout 
where the elements are placed side by side or in a grid, 
depending on how many elements you combine. 
When you use the + operator with Holoviews elements, 
the result is a layout where each element is displayed in its own plot, 
arranged in the specified order. 
This is useful when you want to create a multi-panel plot, 
where each element has its own separate plot space.


"""

# Standard Python library imports
import os  
import sys  
from datetime import datetime

# Third-party imports
import holoviews as hv
import hvplot.pandas  # noqa
import panel as pn
import param
from holoviews import Options, dim, opts  # noqa

# Add src file to Python path so we can import local modules
src_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, src_dir)

# Local imports
from freezetracker.call_api_open_weather import get_current_temperature
from freezetracker.chart_cold_loading import create_chart_cold_loading
from freezetracker.chart_ely_aggregate import create_chart_ely_aggregate
from freezetracker.chart_freeze_thaw import create_chart_freeze_thaw
from freezetracker.chart_frost_max_depth import create_chart_frost_max_depth
from freezetracker.chart_frost_span import create_chart_frost_span
from freezetracker.common_content import default_winter_list
from freezetracker.common_logger import get_basename, get_logger

# Configure Panel
hv.extension("bokeh", "matplotlib")
pn.extension(sizing_mode="stretch_width")

# Add logger
module_name = get_basename(__file__)
logger = get_logger(module_name)

# Define variables
title_string = "Freeze Tracker Dashboard"
footer_string = "2023"
ely_temp_pane = pn.pane.Markdown("")
orr_temp_pane = pn.pane.Markdown("")


def is_WASM() -> bool:
    """Return False in app.py, True in app.js (WASM)"""
    return False


def empty_chart_placeholder():
    return pn.pane.Markdown("Chart not available.", width=400, height=300, align="center")


def get_current_ely_temp_pane():
    is_wasm = is_WASM()
    temp = get_current_temperature(is_wasm,"ELY")
    if temp is not None:
        return pn.pane.Markdown(f"## Ely: {round(temp)}°F")
    else:
        return pn.pane.Markdown(" ")


def get_current_orr_temp_pane():
    is_wasm = is_WASM()
    temp = get_current_temperature(is_wasm, "ORR")
    if temp is not None:
        return pn.pane.Markdown(f"## Orr: {round(temp)}°F")
    else:
        return pn.pane.Markdown(" ")


def get_current_temps_row():
    return pn.Row(get_current_ely_temp_pane(), get_current_orr_temp_pane())


def create_winters_multiselect_widget():
    winter_list = default_winter_list
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


def create_incidents_column():
    incidents = [
        datetime(2022, 3, 31),
        datetime(2022, 4, 23),
        datetime(2023, 4, 15),
    ]
    incidents_column = pn.Column(
        pn.pane.Markdown("## Incidents"),
        *[create_incident_pane(incident) for incident in incidents],
        width_policy="max",
        max_width=150,
    )
    return incidents_column


def create_template_sidebar(winter_multiselect_widget):
    sidebar = pn.Column(
        create_today_pane(),
        create_incidents_column(),
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
    is_wasm = is_WASM()

    def __init__(self, selected_winters=[]):
        super().__init__()
        self._selected_winters = selected_winters
        self.param.watch(self._update_charts, "selected_winters")
        self._update_charts()  # Initialize the chart properties

    # Properties to store chart objects
    depth_chart_object = None
    span_chart_object = None
    freeze_thaw_charts_object = None
    loading_charts_object = None

    @property
    def selected_winters(self):
        return self._selected_winters

    @selected_winters.setter
    def selected_winters(self, value):
        self._selected_winters = value

    selected_winters = param.ListSelector(
        default=default_winter_list,
        objects=default_winter_list,
        label="Selected Winters",
    )

    @param.depends("selected_winters")
    def depth_chart(self):
        chart = create_chart_frost_max_depth(self.is_wasm, self.selected_winters)
        return pn.Column(chart, sizing_mode="stretch_both")

    @param.depends("selected_winters")
    def span_chart(self):
        chart = create_chart_frost_span(self.is_wasm, self.selected_winters)
        return pn.Column(chart, sizing_mode="stretch_both")

    @param.depends("selected_winters")
    def freeze_thaw_charts(self):
        return create_chart_freeze_thaw(self.is_wasm, self.selected_winters)

    @param.depends("selected_winters")
    def loading_charts(self):
        return create_chart_cold_loading(self.is_wasm, self.selected_winters)

    @param.depends("selected_winters", watch=True)
    def _update_charts(self, event=None):
        self.depth_chart_object = self.depth_chart()
        self.span_chart_object = self.span_chart()
        self.freeze_thaw_charts_object = self.freeze_thaw_charts()
        self.loading_charts_object = self.loading_charts()


def create_template_main(winter_multiselect_widget):
    """Returns a panel that reacts to changes in the winter_multiselect_widget"""
    frost_charts = FrostCharts(selected_winters=winter_multiselect_widget.value)

    @pn.depends(winter_multiselect_widget.param.value, watch=True)
    def create_main_panel(selected_winters):
        frost_charts.selected_winters = selected_winters

        # create local variables for the reactive chart objects
        depth_panel = frost_charts.depth_chart_object or empty_chart_placeholder()
        span_panel = frost_charts.span_chart_object or empty_chart_placeholder()
        freeze_thaw_charts = frost_charts.freeze_thaw_charts_object
        loading_charts_gridbox = frost_charts.loading_charts_object or empty_chart_placeholder()

        top_row = pn.Row(depth_panel, span_panel)
        is_wasm = is_WASM()
        ely_aggregate_row = create_chart_ely_aggregate(is_wasm)

        if freeze_thaw_charts is not None:
            freeze_thaw_gridbox = pn.Column(*freeze_thaw_charts, sizing_mode="stretch_width")
        else:
            freeze_thaw_gridbox = empty_chart_placeholder()

        column = pn.Column(
            top_row,
            freeze_thaw_gridbox,
            ely_aggregate_row,
            loading_charts_gridbox,
        )
        return column

    # return a reactive function that returns a panel
    return create_main_panel


def create_github_pane():
    """Add a GitHub pane with icon and link to repository"""
    github_pane = pn.pane.HTML(
        """
        <a href="https://github.com/denisecase/freeze-tracker" target="_blank">
            <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" width="30" height="30">
        </a>
        """,
        width=30,
        height=30,
    )
    return github_pane


def create_dashboard():
    """Create a Panel dashboard.
    The main panel is created with a function that
    reacts to changes in the winter_multiselect_widget"""
    winter_multiselect_widget = create_winters_multiselect_widget()
    create_main_panel = create_template_main(winter_multiselect_widget=winter_multiselect_widget)
    initial_main_panel = create_main_panel(winter_multiselect_widget.value)

    dashboard = pn.template.FastListTemplate(
        title=title_string,
        favicon="favicon.ico",  # place in this folder
        sidebar=create_template_sidebar(winter_multiselect_widget),
        main=initial_main_panel,
        header=create_github_pane(),  # Add the GitHub icon to the header
    )
    return dashboard


def update_temperatures_callback():
    """Define a callback function to update objects on a scheduled interval"""
    ely_temp_pane.object = get_current_ely_temp_pane().object
    orr_temp_pane.object = get_current_orr_temp_pane().object


def main():
    """Main function. Creates a Panel dashboard,
    sets up periodic updates, and flags the dashboard as servable"""
    dashboard = create_dashboard()
    callback_interval_ms = 15 * 60 * 1000  # every 15 min (in ms)
    pn.state.add_periodic_callback(update_temperatures_callback, callback_interval_ms)
    dashboard.servable()


"""Call main() regardless of how the script is started."""
main()
