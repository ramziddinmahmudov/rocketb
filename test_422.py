
import requests

# Use a dummy initData string (needs to be valid format but won't pass auth signature check unless secret matches)
# However, 422 usually means the header is MISSING entirely or validation failed at pydantic level.
# We will test if sending ANY header changes it from 422 to 401.

url = "http://localhost:8001/api/profile"
headers = {
    "X-Telegram-Init-Data": "query_id=AAH..."
}

try:
    print(f"Testing {url}...")
    resp = requests.get(url, headers=headers)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")
except Exception as e:
    print(f"Failed: {e}")

print("-" * 20)
print("Testing without header (expecting 422)...")
try:
    resp = requests.get(url)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")
except Exception as e:
    print(f"Failed: {e}")
