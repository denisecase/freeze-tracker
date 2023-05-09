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

default:
    just --list

install:
    python -m pip install -e .[dev]

clean:
    if (Test-Path .ipynb_checkpoints) { Remove-Item .ipynb_checkpoints -Recurse -Force }
    if (Test-Path **/.ipynb_checkpoints) { Remove-Item **/.ipynb_checkpoints -Recurse -Force }
    if (Test-Path .pytest_cache) { Remove-Item .pytest_cache -Recurse -Force }
    if (Test-Path **/.pytest_cache) { Remove-Item **/.pytest_cache -Recurse -Force }
    if (Test-Path __pycache__) { Remove-Item __pycache__ -Recurse -Force }
    if (Test-Path **/__pycache__) { Remove-Item **/__pycache__ -Recurse -Force }
    if (Test-Path build) { Remove-Item build -Recurse -Force }
    if (Test-Path dist) { Remove-Item dist -Recurse -Force }
    if (Test-Path htmlcov/) { Remove-Item htmlcov/ -Recurse -Force }
    if (Test-Path docs/_build) { Remove-Item docs/_build -Recurse -Force }
    if (Test-Path .coverage) { Remove-Item .coverage -Force }
    if (Test-Path coverage.xml) { Remove-Item coverage.xml -Force }
    if (Test-Path .ruff_cache) { Remove-Item .ruff_cache -Recurse -Force }
    if (Test-Path requirements.txt) { Remove-Item requirements.txt -Force }    

ruff:
    ruff .

format: sort
    ruff . --fix
    black .

sort:
    isort pyproject.toml
    isort .

check:
    ruff check .
    black --check .
    pyright


