"""Farm summary sensors: points running, alerts and Eskom power."""
from __future__ import annotations

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfEnergy, UnitOfPower
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity import FarmEntity


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    c = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([RunningSensor(c), AlertsSensor(c), GridPowerSensor(c), GridEnergySensor(c)])


class RunningSensor(FarmEntity, SensorEntity):
    _attr_icon = "mdi:play-circle-outline"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, c) -> None:
        super().__init__(c, "running")

    @property
    def native_value(self):
        return self.controller.summary["running"]

    @property
    def extra_state_attributes(self):
        c = self.controller
        return {"running": [p["name"] for p in c.points if c.statuses.get(p["id"], {}).get("running")],
                "points": c.summary["total"]}


class AlertsSensor(FarmEntity, SensorEntity):
    _attr_icon = "mdi:alert-outline"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, c) -> None:
        super().__init__(c, "alerts")

    @property
    def native_value(self):
        return self.controller.summary["alerts"]

    @property
    def extra_state_attributes(self):
        c = self.controller
        return {"alerts": [f"{p['name']}: {c.statuses[p['id']]['status']}" for p in c.points
                           if p.get("alert", True) and c.statuses.get(p["id"], {}).get("alert")],
                "offline": c.summary["offline"]}


class GridPowerSensor(FarmEntity, SensorEntity):
    _attr_device_class = SensorDeviceClass.POWER
    _attr_native_unit_of_measurement = UnitOfPower.WATT
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, c) -> None:
        super().__init__(c, "grid_power")

    @property
    def native_value(self):
        return self.controller.summary["grid_w"]


class GridEnergySensor(FarmEntity, SensorEntity):
    _attr_device_class = SensorDeviceClass.ENERGY
    _attr_native_unit_of_measurement = UnitOfEnergy.KILO_WATT_HOUR
    _attr_state_class = SensorStateClass.TOTAL
    _attr_suggested_display_precision = 1

    def __init__(self, c) -> None:
        super().__init__(c, "grid_energy_today")

    @property
    def native_value(self):
        return self.controller.summary["grid_kwh_today"]
