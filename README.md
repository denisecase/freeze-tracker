# Freeze Tracker

Freeze Tracker is a Python project for tracking freeze issues in Ely, Minnesota.

_This repo is under active development_ 

Visit the site built with Panel and Web Assembly: [Freeze Tracker](https://denisecase.github.io/freeze-tracker/src/freezetracker/app.html)

Opening Dashboard

![Dashboard1](images/Dashboard1.PNG)

Scrolling Down on the Opening Dashboard

![Dashboard2](images/Dashboard2.PNG)

Closer Look at Aggregate Loading

![Cold loading](images/Fig1.PNG)

![Both - 3 most recent](images/Fig2.PNG)

## Recommended

- VS Code
- VS Code Extension Python by Microsoft

## Project Management

The project uses `pyproject.toml` to manage its dependencies and build configuration. 
This allows for consistent package management across different environments.

In addition, the project utilizes a `Justfile` to define command recipes 
for convenience and repeatability. 
This helps to automate common development tasks and ensures 
consistency in the project's workflow.

## Historical Data (Year starts July 1)

[NOAA Global Hourly](https://www.ncei.noaa.gov/access/search/data-search/global-hourly)

- Ely Municipal Airport MN US Station 72745994964
- Orr Regional Airport MN US Station 72654404958

Weather Underground for Hibbing provides some data.

- https://www.wunderground.com/history/monthly/us/mn/hibbing/KHIB/date/2023-4

NOAA information for Ely, MN was available with help from the NOAA staff.

- https://www.ncei.noaa.gov/access/past-weather/
- https://www.ncdc.noaa.gov/cdo-web/datasets
- https://www1.ncdc.noaa.gov/pub/data/ghcn/daily/readme.txt
- STATION DETAILS Name	ELY MINNESOTA, MN US
- Network:ID	GHCND:USR0000MELY
- Latitude/Longitude	47.8833°, -91.8667° Elevation	443.5 m

MN provides frost/freeze data by county. For St. Louis County, it's from Orr.

https://www.dot.state.mn.us/loadlimits/frost-thaw/orr.html


## Essential Packages (Universal)

Essential packages can go in your default Python installation (rather then each .venv).


```shell
python --version
python -m pip install --upgrade pip build setuptools wheel 
python -m pip install --upgrade ipykernel jupyterlab
python -m pip install --upgrade panel hvplot 
python -m pip install --upgrade black ruff
python -m pip install --upgrade pyright

```

## Create a Virtual Environment (Just Once)

```shell
python -m venv .venv
```

When VS Code Python Extension offers to select the Environment, say Yes.

## Activate the Virtual Environment

When starting a new session, you'll need to activate the virtual environment.

- Activate it in PowerShell: `.venv\Scripts\Activate`
- Activate it in macOS/Linux Terminal:  `source .venv/bin/`
- To deactivate it, run `deactivate`.

## Install Dependencies

Install dependencies from pyproject.toml. The -e flag installs in editable mode.
Editable mode allows making changes to the source code and having those changes
reflected in the installed package without having to reinstall the package.

```shell
python -m pip install --upgrade pip build setuptools wheel 
python -m pip install --upgrade panel panel[pyodide] hvplot 
python -m pip install -e .[dev]
```

## Run the Main App

Either one of these will work.

```powershell
cd src/freezetracker
panel serve --show app.py
panel serve --show --autoreload app.py

```

## Convert the Main App to Host on GitHub Pages

```powershell
panel convert app.py --to pyodide-worker --out .
```

IMPORTANT! 

Before pushing, edit 

app.js: Edit is_WASM() to return True.

app.html:

  <title>Freeze Tracker Dashboard</title>
  <link rel="icon" type="image/x-icon" href="favicon.ico">

In VS Code, open app.html with LiveServer to test.

## Python Notes 

Default Python 3.11 paths on Windows:

- C:\Program Files\Python311\python.exe
- C:\Users\USERNAME\AppData\Local\Programs\Python\Python311\python.exe

The official Python installer for Windows 
has a default installation location in AppData to ensure each user 
on the machine has their own Python to customize without affecting other users.
If you did not change the installation location during Python installation, 
it's likely that Python installed in the default location.


## More about Commands

`python -m pip install`  ensures that pip is installed 
and executed within the context of the same Python installation 
that is being used to run the command. 
It helps avoid conflicts with multiple versions of 
Python or pip on a system.

`python -m pip install -e .` installs the package(s) in 
editable mode or "development mode". 
This creates a symbolic link to the source code directory in your 
Python installation's site-packages directory, rather than copying files 
into the site-packages directory.

`pip install --upgrade build` is used to upgrade the Python package build, 
which is a package that provides support for building and 
distributing Python packages.
