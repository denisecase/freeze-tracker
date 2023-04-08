# The Justfile is a cross-platform build automation tool.
# It uses this text file to define "recipes" for building, testing, and
# deploying your project.  It is similar to a Makefile, but is
# cross-platform and uses Python syntax.
# It's a concise, readable, and maintainable way to define your build 
# process commands and a great way to document your process.
# To use it, install the just command line tool:
# pip install just

# use PowerShell instead of sh:
set shell := ["powershell.exe", "-c"]

# Install for production
install:
    python -m pip install --upgrade pip
    python -m pip install --upgrade setuptools
    python -m pip install --upgrade wheel
    python -m pip install --upgrade pandas
    python -m pip install --upgrade python-dotenv
    python -m pip install -e . 

# Install for development
install-dev: 
    python -m pip install  -e ".[dev]" 

# Install all
install-all: install install-dev

# Dump installed packages to requirements.txt
freeze:
    python -m pip freeze > requirements.txt

# Delete all temporary files
clean:
    if (Test-Path .ipynb_checkpoints) { Remove-Item .ipynb_checkpoints -Recurse -Force }
    if (Test-Path **/.ipynb_checkpoints) { Remove-Item **/.ipynb_checkpoints -Recurse -Force }
    if (Test-Path .pytest_cache) { Remove-Item .pytest_cache -Recurse -Force }
    if (Test-Path **/.pytest_cache) { Remove-Item **/.pytest_cache -Recurse -Force }
    if (Test-Path __pycache__) { Remove-Item __pycache__ -Recurse -Force }
    if (Test-Path **/__pycache__) { Remove-Item **/__pycache__ -Recurse -Force }
    if (Test-Path build) { Remove-Item build -Recurse -Force }
    if (Test-Path dist) { Remove-Item dist -Recurse -Force }
    if (Test-Path htmlcov) { Remove-Item htmlcov -Recurse -Force }
    if (Test-Path docs/_build) { Remove-Item docs/_build -Recurse -Force }
    if (Test-Path .coverage) { Remove-Item .coverage -Force }
    if (Test-Path coverage.xml) { Remove-Item coverage.xml -Force }
    if (Test-Path .ruff_cache) { Remove-Item .ruff_cache -Recurse -Force }
    if (Test-Path requirements.txt) { Remove-Item requirements.txt -Force }    


# Lint using ruff
ruff:
    ruff .

# Format files using black
format:
    ruff . --fix
    black .

# Run tests
test:
    pytest --cov=src --cov-report xml --log-level=WARNING --disable-pytest-warnings

# Run checks (ruff + test)
check:
    ruff check .
    black --check .
    pyright

# Generate HTML coverage report
coverage: test
    coverage html

# Generate Sphinx documentation
docs:
    sphinx-build -c pyproject.toml -b html docs docs/_build

# Try the visualization
viz:
	python src/daily_visualization.py

# Run the dashboard
run:
    python src/dashboard.py

start:
    gunicorn dashboard:app