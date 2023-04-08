# Freeze Tracker

Freeze Tracker is a Python project for tracking daily temperature data
in Ely Minnesota.

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

## VS Code Environment

After adding a dependency to pyproject.toml, 
VS will display a blue "Environment" button. 
Click this, choose your virtual environment (.venv),
choose your Python interpreter, and 
check all the boxes.

## Schedule the daily_updater.py script

To run the Python `daily_updater.py` script daily on Windows, 
use the Windows Task Scheduler. 

- Open "Task Scheduler"
- Select "Create Task"
- Set name to "Run freeze-tracker src daily_updater to get Ely temp at 6 AM".
- Select "Run whether user is logged on or not".
- Check "Run with highest privileges".
- Go to "Triggers" tab, click "New".
- Select "Daily", and set time to 6 a.m.
- Go to "Actions" tab, select "New", and choose "Start a program"
- Enter full path to `.venv/Scripts/python.exe` in "Program/script" field
- Enter full path to `daily_updater.py` script in the "Add arguments" field
- Go to "Conditions" tab. Set conditions as you like. 
- e.g., check "wake to run"
- e.g., check "start only if any network connection available

Example .venv path - use this path to executable:
- C:\Users\USERNAME\Documents\freeze-tracker\.venv\Scripts\python.exe

Example .py path - use this path for the argument:
- C:\Users\USERNAME\Documents\freeze-tracker\src\daily_updater.py

## Historical Data (Year starts July 1)

Weather Underground for Hibbing provides the data.

- https://www.wunderground.com/history/monthly/us/mn/hibbing/KHIB/date/2023-4

NOAA information for Ely, MN was not available.

- https://www.ncei.noaa.gov/access/past-weather/
- https://www.ncdc.noaa.gov/cdo-web/datasets
- https://www1.ncdc.noaa.gov/pub/data/ghcn/daily/readme.txt
- STATION DETAILS Name	ELY MINNESOTA, MN US
- Network:ID	GHCND:USR0000MELY
- Latitude/Longitude	47.8833°, -91.8667° Elevation	443.5 m

## One-Time Setup: Install Just

To install the Just command runner on Windows using Chocolatey:

1. Open PowerShell Core as an Administrator
2. Run the following command: `choco install just -y`

Note that if you have both PowerShell Core and Windows PowerShell installed, 
it's important to run this command in PowerShell Core.
When using Just in VS Code, 
remember to choose the PowerShell Core Terminal.

## Create Virtual Environment

Create a virtual environment in a .venv folder.

```powershell
python -m venv .venv
```

## When Starting a Session

Activate virtual environment.

```powershell
.\.venv\Scripts\Activate.ps1
```

To deactivate, just run `deactivate`.

## Development

Use Justfile recipes as needed.

```powershell
(.venv)> just install
(.venv)> just install-dev
(.venv)> just install-all
(.venv)> just clean
(.venv)> just format
(.venv)> just check
(.venv)> just test
(.venv)> just coverage
(.venv)> just viz
(.venv)> just run
```

View dashboard (just run) at http://127.0.0.1:8050/

Note: 

If installation fails for any package, install it explicitly in (.venv)> 

```powershell
(.venv)> python -m pip install python-dotenv
```

After doing so, you can deactivate the .venv, delete the .venv folder, 
recreate and reactivate .venv, and the just install-all should work. 

## Python Notes 

Default Python 3.10 paths on Windows:

- C:\Program Files\Python310\python.exe
- C:\Users\USERNAME\AppData\Local\Programs\Python\Python310\python.exe

The official Python installer for Windows 
has a default installation location in AppData to ensure each user 
on the machine has their own Python to customize without affecting other users.
If you did not change the installation location during Python installation, 
it's likely that Python installed in the default location.

## Pip Install hatchling

C:\Users\username\AppData\Local\Programs\Python\Python310\Lib\site-packages

```
pip install hatchling
```

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

`just install` uses the Just command runner to run the install recipe defined
in the Justfile. 


## TODO

- Add tests
- Fix month start
- consider overlaying
- add historical event dates

