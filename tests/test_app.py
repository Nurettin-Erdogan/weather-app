import json
import os
import unittest
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("APP_BASE_URL", "http://127.0.0.1:8000")


WEATHER_FIXTURE = {
    "latitude": 39.6609,
    "longitude": 27.8849,
    "timezone": "Europe/Istanbul",
    "timezone_abbreviation": "GMT+3",
    "current": {
        "time": "2026-06-15T10:00",
        "temperature_2m": 24.4,
        "relative_humidity_2m": 48,
        "apparent_temperature": 25.1,
        "is_day": 1,
        "precipitation": 0,
        "rain": 0,
        "weather_code": 1,
        "cloud_cover": 22,
        "wind_speed_10m": 11.2,
        "wind_direction_10m": 240,
        "wind_gusts_10m": 18.5,
    },
    "hourly": {
        "time": [f"2026-06-15T{hour:02d}:00" for hour in range(24)],
        "temperature_2m": [18 + hour * 0.4 for hour in range(24)],
        "apparent_temperature": [18 + hour * 0.4 for hour in range(24)],
        "precipitation_probability": [0] * 24,
        "relative_humidity_2m": [55] * 24,
        "weather_code": [1] * 24,
        "wind_speed_10m": [10] * 24,
    },
    "daily": {
        "time": [f"2026-06-{day:02d}" for day in range(15, 20)],
        "weather_code": [1, 2, 3, 61, 0],
        "temperature_2m_max": [29, 30, 27, 24, 31],
        "temperature_2m_min": [17, 18, 16, 15, 19],
        "precipitation_probability_max": [0, 10, 20, 80, 0],
        "sunrise": [f"2026-06-{day:02d}T05:39" for day in range(15, 20)],
        "sunset": [f"2026-06-{day:02d}T20:36" for day in range(15, 20)],
        "uv_index_max": [7.2, 7.5, 6.4, 4.1, 7.8],
        "wind_speed_10m_max": [18, 20, 22, 25, 15],
    },
}

AIR_FIXTURE = {
    "current": {"time": "2026-06-15T10:00", "european_aqi": 28, "pm10": 15, "pm2_5": 7}
}


class WeatherAppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.context = self.browser.new_context(locale="tr-TR", service_workers="block")
        self.page = self.context.new_page()
        self.page_errors = []
        self.forecast_queries = []
        self.ip_requests = []
        self.page.on("pageerror", lambda error: self.page_errors.append(str(error)))
        self.page.on("request", self._capture_request)
        self.page.route("https://api.open-meteo.com/**", self._weather_route)
        self.page.route("https://air-quality-api.open-meteo.com/**", self._air_route)

    def tearDown(self):
        self.context.close()

    def _capture_request(self, request):
        if "api.open-meteo.com/v1/forecast" in request.url:
            self.forecast_queries.append(parse_qs(urlparse(request.url).query))
        if "ipwho.is" in request.url:
            self.ip_requests.append(request.url)

    @staticmethod
    def _weather_route(route):
        route.fulfill(status=200, content_type="application/json", body=json.dumps(WEATHER_FIXTURE))

    @staticmethod
    def _air_route(route):
        route.fulfill(status=200, content_type="application/json", body=json.dumps(AIR_FIXTURE))

    def open_app(self):
        self.page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        self.page.wait_for_selector("#cityInput")

    def search(self, query):
        self.page.fill("#cityInput", query)
        self.page.press("#cityInput", "Enter")
        self.page.wait_for_selector(".current-card", timeout=15000)

    def test_local_search_uses_repaired_coordinates_and_renders_details(self):
        self.open_app()
        self.page.fill("#cityInput", "Karesi")
        self.page.wait_for_selector("#suggestions .suggestion-item")
        self.assertGreaterEqual(self.page.locator("#suggestions .match").count(), 1)
        self.page.press("#cityInput", "Enter")
        self.page.wait_for_selector(".current-card", timeout=15000)

        self.assertTrue(self.forecast_queries)
        query = self.forecast_queries[-1]
        self.assertEqual(query["latitude"][0], "39.6609")
        self.assertEqual(query["longitude"][0], "27.8849")
        self.assertEqual(query["forecast_days"][0], "5")
        self.assertIn("Karesi / Balıkesir", self.page.locator(".current-location h2").inner_text())
        self.assertEqual(self.page.locator(".metric-card").count(), 9)
        self.assertEqual(self.page.locator(".day-card").count(), 5)
        self.assertEqual(self.page.locator("#suggestions .suggestion-item").count(), 0)
        self.assertEqual(self.page_errors, [])

    def test_unit_language_and_theme_controls(self):
        self.open_app()
        self.search("Karesi")
        self.page.click("#unitFBtn")
        self.assertIn("°F", self.page.locator(".temperature-block strong").inner_text())

        self.page.click("#languageBtn")
        self.assertEqual(self.page.locator("html").get_attribute("lang"), "en")
        self.assertEqual(self.page.locator("#searchBtn").inner_text(), "Search")

        old_theme = self.page.locator("html").get_attribute("data-theme")
        self.page.click("#themeBtn")
        self.assertNotEqual(self.page.locator("html").get_attribute("data-theme"), old_theme)
        self.assertEqual(self.page_errors, [])

    def test_geolocation_denial_requires_consent_before_ip_lookup(self):
        self.context.close()
        self.context = self.browser.new_context(locale="tr-TR", service_workers="block")
        self.page = self.context.new_page()
        self.page_errors = []
        self.forecast_queries = []
        self.ip_requests = []
        self.page.on("request", self._capture_request)
        self.page.add_init_script("""
            Object.defineProperty(navigator, 'geolocation', {
              configurable: true,
              value: { getCurrentPosition: (success, error) => error({ code: 1, PERMISSION_DENIED: 1 }) }
            });
        """)
        self.open_app()
        self.page.click("#locationBtn")
        self.page.wait_for_selector("#notice:not([hidden])")
        self.assertEqual(self.ip_requests, [])
        self.page.get_by_role("button", name="IP ile yaklaşık konumu bul").click()
        self.assertTrue(self.page.locator("#ipDialog").evaluate("element => element.open"))
        self.assertEqual(self.ip_requests, [])

    def test_api_failure_is_a_real_error_with_retry(self):
        self.page.unroute("https://api.open-meteo.com/**")
        self.page.route(
            "https://api.open-meteo.com/**",
            lambda route: route.fulfill(
                status=503, content_type="application/json", body='{"error": true}'
            ),
        )
        self.open_app()
        self.page.fill("#cityInput", "Karesi")
        self.page.press("#cityInput", "Enter")
        self.page.wait_for_selector("#retryBtn", timeout=15000)
        self.assertTrue(self.page.locator("#retryBtn").is_visible())

    def test_weather_action_row_is_removed(self):
        self.open_app()
        self.search("Karesi")
        self.assertEqual(self.page.locator(".weather-actions").count(), 0)
        self.assertEqual(self.page.locator("#favoriteBtn").count(), 0)
        self.assertEqual(self.page.locator("#shareBtn").count(), 0)
        self.assertEqual(self.page.locator("#rainAlertBtn").count(), 0)

    def test_service_worker_reloads_app_shell_offline(self):
        self.context.close()
        self.context = self.browser.new_context(locale="tr-TR")
        self.page = self.context.new_page()
        self.page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        self.page.evaluate("navigator.serviceWorker.ready")
        self.page.reload(wait_until="networkidle", timeout=30000)
        self.assertTrue(self.page.evaluate("Boolean(navigator.serviceWorker.controller)"))
        self.context.set_offline(True)
        self.page.reload(wait_until="domcontentloaded", timeout=30000)
        self.page.wait_for_selector("#offlineBanner:not([hidden])")
        self.assertTrue(self.page.locator("#cityInput").is_visible())

    def test_mobile_layout_has_no_horizontal_overflow(self):
        self.context.close()
        self.context = self.browser.new_context(
            viewport={"width": 390, "height": 844},
            locale="tr-TR",
            service_workers="block",
        )
        self.page = self.context.new_page()
        self.page.route("https://api.open-meteo.com/**", self._weather_route)
        self.page.route("https://air-quality-api.open-meteo.com/**", self._air_route)
        self.open_app()
        self.search("Kadikoy")
        dimensions = self.page.evaluate("({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth})")
        self.assertEqual(dimensions["scroll"], dimensions["client"])


if __name__ == "__main__":
    unittest.main()
