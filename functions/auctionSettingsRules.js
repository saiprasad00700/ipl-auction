const MODE_DEFAULTS = {
  mega: { budget: 120, squadLimit: 25, overseasLimit: 4 },
  sprint11: { budget: 90, squadLimit: 11, overseasLimit: 4 },
  sprint5: { budget: 60, squadLimit: 5, overseasLimit: 2 }
};

export function normalizeAuctionSettings(settings, currentMode = "mega") {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { valid: false, error: "Invalid auction settings." };
  }
  const allowed = new Set(["bidTimer", "budget", "squadLimit", "overseasLimit", "auctionType"]);
  const result = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!allowed.has(key)) continue;
    const number = Number(value);
    if (key === "bidTimer" && ![3, 5, 10, 15].includes(number)) {
      return { valid: false, error: "Bid timer must be 3, 5, 10, or 15 seconds." };
    }
    if (key === "budget" && (!Number.isFinite(number) || number <= 0 || number > 1000)) {
      return { valid: false, error: "Invalid team budget." };
    }
    if (key === "squadLimit" && (!Number.isInteger(number) || number < 1 || number > 40)) {
      return { valid: false, error: "Invalid squad limit." };
    }
    if (key === "overseasLimit" && (!Number.isInteger(number) || number < 0 || number > 4)) {
      return { valid: false, error: "Overseas-player limit must be between 0 and 4." };
    }
    if (key === "auctionType" && !Object.hasOwn(MODE_DEFAULTS, value)) {
      return { valid: false, error: "Invalid auction mode." };
    }
    result[key] = key === "auctionType" ? value : number;
  }
  if (!Object.keys(result).length) return { valid: false, error: "No valid auction settings were supplied." };

  const modeChanged = result.auctionType !== undefined && result.auctionType !== currentMode;
  const mode = result.auctionType || currentMode;
  const defaults = MODE_DEFAULTS[mode] || MODE_DEFAULTS.mega;
  if (!modeChanged && result.overseasLimit !== undefined && result.overseasLimit > defaults.overseasLimit) {
    return { valid: false, error: `Overseas-player limit cannot exceed ${defaults.overseasLimit} for this auction mode.` };
  }
  if (!modeChanged && result.squadLimit !== undefined && result.squadLimit !== defaults.squadLimit) {
    return { valid: false, error: `Squad size is fixed at ${defaults.squadLimit} for this auction mode.` };
  }
  if (modeChanged) {
    result.budget = defaults.budget;
    result.squadLimit = defaults.squadLimit;
    result.overseasLimit = defaults.overseasLimit;
  }
  return { valid: true, settings: result, modeChanged };
}
