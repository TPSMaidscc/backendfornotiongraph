import requests

response = requests.post(
    'https://backendfornotiongraph.vercel.app/api/create-graph',
    json={
        'pageId': '2117432eb8438077a1f8c72e2d079b61',
        'text': 'Business ECP:'
    },
    timeout=30
)

print(f"Status: {response.status_code}")
print(f"Response: {response.text}")