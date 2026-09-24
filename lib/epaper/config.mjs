export const CONFIG = {
  calendarUrl: process.env.CALENDAR_URL || 'https://script.google.com/macros/s/AKfycbzU4xLiJPo_dB40LW8YodAXk1z2bQoOYXAfWwsvzDVMG2Hsc8B2wACNXxpm0e9iZQHS/exec',
  location: process.env.WEATHER_LOCATION || "아산",
  // Optional fixed coordinates avoid geocoding entirely.
  latitude: process.env.WEATHER_LAT,
  longitude: process.env.WEATHER_LON,
  timeoutMs: 6500,
  timezone: "Asia/Seoul",
  width: 800,
  height: 480,
};
