import urllib.request, json, os

token = ''
with open('.env') as f:
    for line in f:
        if line.startswith('BOT_TOKEN='):
            token = line.split('=')[1].strip()

print("Token loaded:", bool(token))
url = f"https://api.telegram.org/bot{token}/deleteWebhook?drop_pending_updates=True"
req = urllib.request.Request(url, method='POST')
try:
    with urllib.request.urlopen(req) as response:
        print("Webhook deleted:", json.loads(response.read().decode()))
except Exception as e:
    print("Delete webhook err:", e)

url2 = f"https://api.telegram.org/bot{token}/getUpdates?offset=-1&limit=1"
try:
    with urllib.request.urlopen(url2) as response:
        print("Updates fetch test:", json.loads(response.read().decode()).get("ok"))
except Exception as e:
    print("getUpdates err:", e)
