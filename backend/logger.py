"""
Shared global variables for the Auto-SBC project
"""

import csv
import json
import os
import time

# Initialize an empty list for solver logs
solver_logs = []
WRITE_LOGS_TO_DISK = os.environ.get("AUTO_SBC_WRITE_LOGS", "0") == "1"


# Function to add a log entry
def add_log(message, result=None):
    """Add a log entry with current timestamp"""

    log_entry = {
        "time": time.time(),
        "message": message,
        "result": [] if result is None else result,
    }
    solver_logs.append(log_entry)

    if not WRITE_LOGS_TO_DISK:
        return

    # Disk persistence is explicit opt-in for local debugging only.

    log_dir = "logs"
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)

    log_file = os.path.join(log_dir, f"solver_log.csv")
    with open(log_file, "w", newline="", encoding="utf-8") as f:
        csv_writer = csv.writer(f)
        # Write header
        csv_writer.writerow(["time", "message", "result"])
        # Write data
        for entry in solver_logs:
            csv_writer.writerow(
                [
                    entry["time"],
                    entry["message"],
                    json.dumps(entry["result"]),  # Convert complex result to string
                ]
            )


# Function to clear logs
def clear_logs():
    """Clear all logs"""
    global solver_logs

    # Delete the optional on-disk log when persistence was enabled.
    log_dir = "logs"
    if WRITE_LOGS_TO_DISK and os.path.exists(log_dir):
        for file in os.listdir(log_dir):
            if file == "solver_log.csv" or file.startswith("solver_log_"):
                os.remove(os.path.join(log_dir, file))

    solver_logs = []
