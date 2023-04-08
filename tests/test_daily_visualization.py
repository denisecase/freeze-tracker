from src.daily_visualization import get_data_frame

def test_get_data_frame():
    df = get_data_frame()
    assert len(df) > 0
    assert "Date" in df.columns
    assert "cumulative_cold_degrees" in df.columns
