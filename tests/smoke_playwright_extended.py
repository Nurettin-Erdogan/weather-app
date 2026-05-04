from playwright.sync_api import sync_playwright


def run():
    base = "http://127.0.0.1:8000"
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # Test 1: suggestion diacritics and highlight
        ctx1 = browser.new_context(locale="tr-TR")
        page1 = ctx1.new_page()
        page1.goto(base, timeout=15000)
        page1.fill('#cityInput', 'çankaya')
        try:
            page1.wait_for_selector('#suggestions .suggestion-item', timeout=6000)
            el = page1.query_selector('#suggestions .suggestion-item')
            match = el.query_selector('.match') if el else None
            if match:
                print('suggestion_diacritics: OK')
            else:
                print('suggestion_diacritics: FAIL - no match highlight')
        except Exception as e:
            print('suggestion_diacritics: FAIL', e)
        ctx1.close()

        # Test 2: keyboard navigation of suggestions (ArrowDown / aria-selected)
        ctx2 = browser.new_context(locale='tr-TR')
        page2 = ctx2.new_page()
        page2.goto(base)
        page2.fill('#cityInput', 'istanbul')
        try:
            page2.wait_for_selector('#suggestions .suggestion-item', timeout=6000)
            # focus input then press ArrowDown to move into suggestions
            page2.focus('#cityInput')
            page2.keyboard.press('ArrowDown')
            page2.wait_for_selector('#suggestions .suggestion-item[aria-selected="true"]', timeout=3000)
            print('suggestion_keyboard_nav: OK')
        except Exception as e:
            print('suggestion_keyboard_nav: FAIL', e)
        ctx2.close()

        # Test 3: unit toggle (°C -> °F)
        ctx3 = browser.new_context()
        page3 = ctx3.new_page()
        page3.goto(base)
        page3.fill('#cityInput', 'istanbul')
        page3.click('#searchBtn')
        try:
            page3.wait_for_selector('.weather-current', timeout=15000)
            details = page3.inner_text('.weather-current .details')
            if '°C' in details:
                page3.click('#unitFBtn')
                page3.wait_for_timeout(600)
                details2 = page3.inner_text('.weather-current .details')
                if '°F' in details2:
                    print('unit_toggle: OK')
                else:
                    print('unit_toggle: FAIL after toggle')
            else:
                print('unit_toggle: FAIL initial unit not °C')
        except Exception as e:
            print('unit_toggle: FAIL', e)
        ctx3.close()

        # Test 4: offline retry flow
        ctx4 = browser.new_context()
        page4 = ctx4.new_page()
        page4.goto(base)
        try:
            ctx4.set_offline(True)
            page4.fill('#cityInput', 'istanbul')
            page4.click('#searchBtn')
            page4.wait_for_selector('.error-wrapper .retry-btn', timeout=8000)
            print('offline_error_shown: OK')
            # bring network back
            ctx4.set_offline(False)
            page4.click('.error-wrapper .retry-btn')
            page4.wait_for_selector('.weather-current', timeout=15000)
            print('offline_retry_success: OK')
        except Exception as e:
            print('offline_retry: FAIL', e)
        ctx4.close()

        # Test 5: geolocation denied -> IP fallback notice and forecast
        ctx5 = browser.new_context()
        page5 = ctx5.new_page()
        page5.add_init_script("""
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
        page5.goto(base)
        try:
            page5.wait_for_selector('#useLocationBtn', timeout=5000)
            page5.click('#useLocationBtn')
            geo = page5.wait_for_selector('#geoNotice', timeout=15000)
            txt = geo.inner_text()[:200]
            if 'Yaklaşık konum' in txt or 'IP' in txt or 'IP tabanlı' in txt:
                print('geo_ip_fallback: OK', txt)
            else:
                print('geo_ip_fallback: WARN', txt)
        except Exception as e:
            print('geo_ip_fallback: FAIL', e)
        ctx5.close()

        browser.close()


if __name__ == '__main__':
    run()
