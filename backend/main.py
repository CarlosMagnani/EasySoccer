import asyncio
import functools
import logging
import signal
import sys
from concurrent.futures import ThreadPoolExecutor
from typing import Annotated, Any

import logger  # Import the logger module
import setup
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

# Global variables
app = FastAPI()
thread_pool = ThreadPoolExecutor(max_workers=10)
shutdown_event = asyncio.Event()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://www.ea.com", "https://ea.com"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class Requirement(BaseModel):
    model_config = ConfigDict(extra="allow")

    scope: str
    count: int = Field(ge=0)
    requirementKey: str
    eligibilityValues: list[Any]

    @field_validator("requirementKey")
    @classmethod
    def validate_requirement_key(cls, value):
        if value not in setup.SUPPORTED_REQUIREMENT_KEYS:
            raise ValueError(f"Unsupported requirementKey: {value}")
        return value


class SBCData(BaseModel):
    model_config = ConfigDict(extra="allow")

    constraints: list[Requirement] = Field(min_length=1)
    formation: list[int] = Field(min_length=1)
    brickIndices: list[int]


class SolveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sbcData: SBCData
    clubPlayers: list[dict[str, Any]] = Field(min_length=1)
    maxSolveTime: Annotated[int, Field(strict=True, ge=1, le=180)]
    exportDebugCsv: bool = False


@app.get("/health")
async def health():
    return {"status": "ok", "service": "auto-sbc-local"}


def run_in_threadpool(func):
    """Decorator to run a function in a thread pool"""

    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        if shutdown_event.is_set():
            logging.warning("Server is shutting down, rejecting new requests")
            raise RuntimeError("Server is shutting down")

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            thread_pool, functools.partial(func, *args, **kwargs)
        )

    return wrapper


# Shutdown handler that properly cleans up resources
async def shutdown():
    logging.info("Initiating graceful shutdown")

    # Set shutdown event to prevent new requests
    shutdown_event.set()

    # Wait for active tasks to complete (with a timeout)
    logging.info("Waiting for active tasks to complete")
    try:
        # Give active tasks up to 5 seconds to complete
        await asyncio.wait_for(asyncio.sleep(2), timeout=5)
    except asyncio.TimeoutError:
        logging.warning("Some tasks didn't complete in time")

    # Don't wait for all tasks - faster shutdown for reloads
    thread_pool.shutdown(wait=False)

    # Force terminate the process
    import os

    logging.critical(f"Killing {os.getpid()} - process will terminate immediately")
    os.kill(os.getpid(), signal.SIGTERM)


# Register the shutdown handler
@app.on_event("shutdown")
async def app_shutdown():
    await shutdown()


# Synchronous function that will be run in a thread
def get_logs():
    # Return the logs from the shared module
    return {"logs": logger.solver_logs}


@app.get("/solver-logs")
async def get_solver_logs():
    # Run the blocking operation in a separate thread
    return await run_in_threadpool(get_logs)()


# Synchronous function that will be run in a thread
def process_solve_request(request_data: SolveRequest):
    # Use the globals module
    logger.clear_logs()  # Clear previous logs
    logger.add_log("SBC Solver started in thread")

    sbcData = request_data.sbcData.model_dump()
    clubPlayers = request_data.clubPlayers
    maxSolveTime = request_data.maxSolveTime

    # Log received data
    logger.add_log(f"Processing {len(clubPlayers)} players, max time: {maxSolveTime}s")

    try:
        result = setup.runAutoSBC(
            sbcData,
            clubPlayers,
            maxSolveTime,
            export_debug_csv=request_data.exportDebugCsv,
        )

        # Log completion
        logger.add_log("Solver thread completed successfully")

        return result
    except Exception as e:
        # Log errors
        logger.add_log(f"Error in solver thread: {str(e)}")
        raise


@app.post("/solve")
async def solve(request_data: SolveRequest):
    logger.clear_logs()  # Clear previous logs

    # Run the CPU-intensive task in a thread pool
    try:
        return await run_in_threadpool(process_solve_request)(request_data)
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid solver payload: {error}",
        ) from error
    except Exception as error:
        logging.exception("Unexpected solver failure")
        raise HTTPException(
            status_code=500,
            detail="The solver failed to process the request",
        ) from error


# Add endpoint to clear logs in a separate thread
def clear_logs_handler():
    logger.clear_logs()
    return {"status": "success"}


@app.post("/clear-logs")
async def clear_solver_logs():
    return await run_in_threadpool(clear_logs_handler)()


@app.post("/relay", include_in_schema=False)
async def relay_disabled():
    raise HTTPException(status_code=410, detail="Arbitrary HTTP relay is disabled")


def start():
    """Start the server using the uvicorn runner with proper signal handling"""
    config = uvicorn.Config(
        "main:app",
        host="127.0.0.1",
        port=8000,
        log_level="info",
        reload=False,
        workers=1,
    )

    server = uvicorn.Server(config)

    # Override the server's signal handlers with our own
    server.install_signal_handlers = lambda: None

    # Define our own signal handlers
    def handle_exit(signum, frame):
        logging.info(f"Received exit signal {signum}")
        # Tell the server to exit
        server.should_exit = True

    # Register our signal handlers
    signal.signal(signal.SIGINT, handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)

    # Start the server
    logging.info("Starting server...")
    server.run()
    logging.info("Server stopped")


if __name__ == "__main__":
    try:
        start()
    except KeyboardInterrupt:
        logging.info("Keyboard interrupt received")
    except Exception as e:
        logging.error(f"Error starting server: {str(e)}")
    finally:
        # Ensure thread pool is always shut down
        if thread_pool:
            thread_pool.shutdown(wait=False)
        logging.info("Application terminated")
    sys.exit(0)
