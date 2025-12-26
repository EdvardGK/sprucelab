"""Configuration management for Spruce CLI."""
import os
from pathlib import Path
from typing import Optional
import yaml
import keyring

SPRUCE_DIR = Path.home() / ".spruce"
CONFIG_FILE = SPRUCE_DIR / "config.yaml"
WORK_DIR = SPRUCE_DIR / "work"

# Keyring service name for storing API keys
KEYRING_SERVICE = "spruce-cli"


def ensure_dirs():
    """Ensure required directories exist."""
    SPRUCE_DIR.mkdir(exist_ok=True)
    WORK_DIR.mkdir(exist_ok=True)


def load_config() -> dict:
    """Load configuration from config file."""
    ensure_dirs()
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            return yaml.safe_load(f) or {}
    return {}


def save_config(config: dict):
    """Save configuration to config file."""
    ensure_dirs()
    with open(CONFIG_FILE, 'w') as f:
        yaml.safe_dump(config, f, default_flow_style=False)


def get_config(key: str, default=None):
    """Get a configuration value."""
    config = load_config()
    return config.get(key, default)


def set_config(key: str, value):
    """Set a configuration value."""
    config = load_config()
    config[key] = value
    save_config(config)


def get_api_url() -> str:
    """Get the Sprucelab API URL."""
    return get_config('api_url', 'http://localhost:8000')


def set_api_url(url: str):
    """Set the Sprucelab API URL."""
    set_config('api_url', url.rstrip('/'))


def get_api_key() -> Optional[str]:
    """Get the API key from system keyring."""
    try:
        return keyring.get_password(KEYRING_SERVICE, "api_key")
    except Exception:
        # Fallback to config file if keyring not available
        return get_config('api_key')


def set_api_key(api_key: str):
    """Store the API key in system keyring."""
    try:
        keyring.set_password(KEYRING_SERVICE, "api_key", api_key)
    except Exception:
        # Fallback to config file if keyring not available
        set_config('api_key', api_key)


def get_agent_id() -> Optional[str]:
    """Get the registered agent ID."""
    return get_config('agent_id')


def set_agent_id(agent_id: str):
    """Set the registered agent ID."""
    set_config('agent_id', agent_id)


def get_hostname() -> str:
    """Get the current hostname."""
    import socket
    return socket.gethostname()


def get_work_dir(run_id: str) -> Path:
    """Get the work directory for a specific run."""
    work_dir = WORK_DIR / run_id
    work_dir.mkdir(parents=True, exist_ok=True)
    return work_dir
