import { t, getLanguage } from "./i18n.js";
import { parameterUnits, toDisplay, unitSpec, validateExact } from "./units.js";

export function installExactControls(controls, getSystem) {
  const entries = [];
  for (const slider of controls) {
    const parent = slider.closest("label");
    if (!parent) continue;
    slider.step = "any";
    const row = document.createElement("div"); row.className = "exact-row";
    const input = document.createElement("input");
    input.id = `${slider.id}Exact`; input.type = "text"; input.inputMode = "decimal";
    input.autocomplete = "off"; input.className = "exact-input";
    const title = parent.textContent?.trim().split("\n")[0].slice(0, 80) || slider.id;
    input.setAttribute("aria-label", `Точное значение: ${title}`);
    const unit = document.createElement("span"); unit.className = "exact-unit";
    const error = document.createElement("small"); error.id = `${slider.id}Error`; error.className = "input-error";
    error.hidden = true; input.setAttribute("aria-describedby", error.id);
    row.append(input, unit); parent.append(row, error);
    // Numeric CAD size uses the same canonical backing input as ranges.
    if (slider.type === "number") slider.hidden = true;
    const entry = { slider, input, unit, error, kind: parameterUnits[slider.id] };
    entries.push(entry);
    const refresh = () => {
      input.disabled = slider.disabled;
      unit.textContent = unitSpec(entry.kind, getSystem()).label;
      if (document.activeElement !== input) input.value = String(Number(toDisplay(Number(slider.value), entry.kind, getSystem()).toPrecision(12)));
    };
    input.addEventListener("input", () => {
      const min = Number(slider.getAttribute("min") ?? -Infinity), max = Number(slider.getAttribute("max") ?? Infinity);
      const checked = validateExact(input.value, min, max, entry.kind, getSystem());
      if (slider.id === "streamlineCount" && !Number.isInteger(checked.value)) checked.valid = false;
      const boundary = value => Number(toDisplay(value, entry.kind, getSystem()).toPrecision(8));
      const message = checked.valid ? "" : getLanguage() === "en" ? `Enter ${slider.id === "streamlineCount" ? "an integer" : "a number"} from ${boundary(min)} to ${boundary(max)}. The last valid value is preserved.` : `Укажи ${slider.id === "streamlineCount" ? "целое " : ""}число от ${boundary(min)} до ${boundary(max)}. Последнее верное значение сохранено.`;
      input.setCustomValidity(t(message)); input.setAttribute("aria-invalid", String(!checked.valid));
      error.textContent = message; error.hidden = checked.valid;
      if (!checked.valid) return;
      slider.value = String(Math.min(max, Math.max(min, checked.value)));
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      if (slider.type === "number") slider.dispatchEvent(new Event("change", { bubbles: true }));
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") { input.reportValidity(); if (!input.validationMessage) input.blur(); }
      if (event.key === "Escape") { input.value = String(toDisplay(Number(slider.value), entry.kind, getSystem())); input.setCustomValidity(""); error.hidden = true; input.setAttribute("aria-invalid", "false"); input.blur(); }
    });
    slider.addEventListener("input", () => { if (document.activeElement !== input) { input.setCustomValidity(""); error.hidden = true; input.setAttribute("aria-invalid", "false"); } refresh(); });
    entry.refresh = refresh; refresh();
  }
  return { refresh(force = false) {
    for (const e of entries) {
      if (force) { e.input.setCustomValidity(""); e.input.setAttribute("aria-invalid", "false"); e.error.hidden = true; e.input.value = String(Number(toDisplay(Number(e.slider.value), e.kind, getSystem()).toPrecision(12))); }
      e.refresh();
    }
  } };
}
