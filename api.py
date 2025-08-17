import requests

API_URL = "https://api.together.xyz/v1/completions"
headers = {
    "Authorization": "Bearer tgp_v1_o319HuxtA3Phy_VoWmflw1_WXLLKXZENiz2PbD8Q6UA",
    "Content-Type": "application/json"
}

payload = {
    "model": "openai/gpt-oss-20b",
    "prompt": "Explain the stock market in simple words.",
    "max_tokens": 200,
    "temperature": 0.7,
}

response = requests.post(API_URL, headers=headers, json=payload)

print("STATUS CODE:", response.status_code)
print("RAW RESPONSE:", response.text)

try:
    data = response.json()
    print("OUTPUT:", data["choices"][0]["text"])
except Exception as e:
    print("Error parsing response:", e)
