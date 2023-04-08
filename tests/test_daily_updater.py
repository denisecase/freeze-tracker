from pathlib import Path
from datetime import datetime, timedelta
import src.daily_updater as daily_updater


def test_get_csv_path():
    date = datetime(2022, 7, 1)
    expected_path = Path.cwd().join("data", "2022-2023_daily_temps.csv")
    assert daily_updater.get_csv_path(date) == expected_path

