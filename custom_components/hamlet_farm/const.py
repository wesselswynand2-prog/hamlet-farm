"""Constants for Hamlet Farm."""
DOMAIN = "hamlet_farm"
VERSION = "1.22.0"

PANEL_URL_PATH = "hamlet-farm"
PANEL_COMPONENT = "hamlet-farm-panel"
STATIC_URL = "/hamlet_farm_static"

CONF_NAME = "name"

SIGNAL_UPDATE = f"{DOMAIN}_update_{{}}"
TICK_S = 15                 # alert timers / energy-day roll-over
PUSH_DEBOUNCE_S = 0.5       # coalesce bursts of sensor updates before pushing to the map
MAX_EVENTS = 30
STORE_VERSION = 1
