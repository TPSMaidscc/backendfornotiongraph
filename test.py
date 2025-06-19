import requests

response = requests.post(
    'https://backendfornotiongraph.vercel.app/api/create-graph',
    json={
        'pageId': '2117432eb84380768024ee386b9bc3a5',
        'text': 'Business ECP:'
    },
    timeout=30
)

print(f"Status: {response.status_code}")
print(f"Response: {response.text}")