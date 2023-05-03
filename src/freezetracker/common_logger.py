"""  
Purpose:
    
    This module is used to create a common logger for the application.

    The logger is used to log messages to a file called app.log.

    Logging is a professional alternative to print statements. 
    It allows you to control 
    the level of logging (e.g. DEBUG, INFO, WARNING, ERROR, CRITICAL)
    and the destination of the log messages (e.g. file, console, email, etc.)

    Python makes logging easy. 
     
    The logging package is part of the standard library - you already have it.

    Build a good common logger and it can be reused in other applications.

    Or include a logger in any Python file:

    import logging

    logging.basicConfig(filename="example.log", level=logging.DEBUG)
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    logger.info("Starting Freeze Tracker Dashboard")
    
"""

import logging


def get_logger(logger_name, log_file="app.log", log_level=logging.INFO):
    """Configure a common logger for the application"""
    logger = logging.getLogger(logger_name)
    logger.setLevel(log_level)

    # Create a file handler for writing logs to a file
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(log_level)

    # Create a console handler for printing logs to the console
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)

    # Create a formatter for log messages
    formatter = logging.Formatter("%(asctime)s.%(name)s.%(levelname)s: %(message)s")
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    # Add the handlers to the logger
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger
