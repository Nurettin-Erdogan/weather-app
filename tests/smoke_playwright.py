from playwright.sync_api import sync_playwright


def run():
    base = "http://127.0.0.1:8000"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # Context with geolocation permission (allowed)
        context = browser.new_context(
            geolocation={"latitude": 41.01, "longitude": 28.96},
            permissions=["geolocation"],
            locale="tr-TR",
            timezone_id="Europe/Istanbul",
        )
        page = context.new_page()
        page.goto(base, timeout=15000)
        page.wait_for_selector("#cityInput", timeout=5000)
        page.fill("#cityInput", "istanbul")
        page.click("#searchBtn")
        try:
            page.wait_for_selector(".weather-current", timeout=20000)
            print("search_weather_current: OK")
        except Exception as e:
            print("search_weather_current: FAIL", e)

        # hourly panel test
        card = page.query_selector(".forecast-daily .card")
        if card:
            card.click()
            try:
                page.wait_for_selector("#hourlyPanel.open[aria-hidden=\'false\']", timeout=7000)
                print("hourly_open: OK")
            except Exception:
                print("hourly_open: FAIL")
            page.keyboard.press("Escape")
            try:
                page.wait_for_selector("#hourlyPanel[aria-hidden=\'true\']", timeout=5000)
                print("hourly_close: OK")
            except Exception:
                print("hourly_close: FAIL")
        else:
            print("no_daily_card")

        context.close()

        # geolocation denied test: inject a script that triggers permission denied
        context2 = browser.new_context(locale="tr-TR")
        page2 = context2.new_page()
        page2.add_init_script("""
            // Force geolocation getCurrentPosition to call error
            Object.defineProperty(navigator, 'geolocation', {
                value: {
                    getCurrentPosition: function(success, error) { if (typeof error === 'function') error({ code: 1, message: 'User denied Geolocation' }); }
                },
                configurable: true
            });
            if (navigator.permissions && navigator.permissions.query) {
                navigator.permissions.query = (p) => Promise.resolve({ state: 'denied' });
            }
        """)
        page2.goto(base, timeout=15000)
        try:
            page2.wait_for_selector('#useLocationBtn', timeout=5000)
            page2.click('#useLocationBtn')
            geo = page2.wait_for_selector('#geoNotice', timeout=15000)
            print('geoNotice_text:', geo.inner_text()[:200])
        except Exception as e:
            print('geoNotice: FAIL', e)
        context2.close()
        browser.close()


if __name__ == '__main__':
    run()
