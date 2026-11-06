"""Config flow: just a name – points are placed on the map in the Farm map page."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback

from .const import CONF_NAME, DOMAIN


class HamletFarmConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            name = (user_input.get(CONF_NAME) or "").strip() or "Farm"
            return self.async_create_entry(title=name, data={CONF_NAME: name})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({vol.Required(CONF_NAME, default="Farm"): str}))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return HamletFarmOptionsFlow()


class HamletFarmOptionsFlow(OptionsFlow):
    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            name = (user_input.get(CONF_NAME) or "").strip() or "Farm"
            return self.async_create_entry(data={CONF_NAME: name})
        cur = self.config_entry.options.get(CONF_NAME) or self.config_entry.data.get(CONF_NAME, "Farm")
        return self.async_show_form(step_id="init", data_schema=vol.Schema({vol.Required(CONF_NAME, default=cur): str}))
