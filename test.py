import requests
import json
from datetime import datetime

def test_ecp_structure_api():
    # API configuration
    BASE_URL = "https://backendfornotiongraph.vercel.app"  # Your Vercel backend
    ENDPOINT = "/api/ecp-structure"
    
    # Test data
    payload = {
        "pageId": "2117432eb84380768024ee386b9bc3a5",  # Your test page ID
        "text": "Business ECP:"
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    print(f"🚀 Testing ECP Structure API...")
    print(f"📡 URL: {BASE_URL}{ENDPOINT}")
    print(f"📄 Page ID: {payload['pageId']}")
    print(f"🔍 Search Text: {payload['text']}")
    print("-" * 50)
    
    try:
        # Make the API call
        print("📡 Sending request...")
        response = requests.post(
            f"{BASE_URL}{ENDPOINT}",
            json=payload,
            headers=headers,
            timeout=60  # 60 second timeout
        )
        
        print(f"📊 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get("success"):
                structure = data.get("structure", {})
                
                print("✅ SUCCESS! ECP Structure extracted:")
                print("-" * 50)
                
                # Business ECP
                if structure.get("businessECP"):
                    ecp = structure["businessECP"]
                    print(f"🏢 Business ECP: {ecp['title']}")
                    print(f"   ID: {ecp['id']}")
                    print(f"   Depth: {ecp['depth']}")
                    print()
                
                # Conditions
                conditions = structure.get("conditions", [])
                print(f"❓ Conditions ({len(conditions)}):")
                for i, condition in enumerate(conditions, 1):
                    print(f"   {i}. {condition['title']}")
                    print(f"      ID: {condition['id']}")
                    print(f"      Depth: {condition['depth']}")
                    if condition.get('content'):
                        print(f"      Content: {condition['content'][:2]}...")  # First 2 items
                    if condition.get('childPolicies'):
                        print(f"      Child Policies: {len(condition['childPolicies'])}")
                    print()
                
                # Policies
                policies = structure.get("policies", [])
                print(f"📋 Policies ({len(policies)}):")
                for i, policy in enumerate(policies, 1):
                    print(f"   {i}. {policy['title']}")
                    print(f"      ID: {policy['id']}")
                    print(f"      Depth: {policy['depth']}")
                    if policy.get('content'):
                        print(f"      Content: {policy['content'][:2]}...")  # First 2 items
                    print()
                
                # Metadata
                metadata = structure.get("metadata", {})
                print(f"📊 Metadata:")
                print(f"   Total Conditions: {metadata.get('totalConditions', 0)}")
                print(f"   Total Policies: {metadata.get('totalPolicies', 0)}")
                print(f"   Max Depth: {metadata.get('maxDepth', 0)}")
                print(f"   Processing Time: {data.get('processingTimeMs', 0)}ms")
                print(f"   Extracted At: {metadata.get('extractedAt', 'N/A')}")
                
                # Save to file
                filename = f"ecp_structure_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                with open(filename, 'w') as f:
                    json.dump(data, f, indent=2)
                print(f"\n💾 Full response saved to: {filename}")
                
            else:
                print(f"❌ API returned success=false: {data.get('error', 'Unknown error')}")
        
        else:
            print(f"❌ HTTP Error {response.status_code}")
            try:
                error_data = response.json()
                print(f"Error: {error_data.get('error', 'Unknown error')}")
            except:
                print(f"Error: {response.text}")
    
    except requests.exceptions.Timeout:
        print("⏰ Request timed out (60 seconds)")
    except requests.exceptions.RequestException as e:
        print(f"❌ Request error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    test_ecp_structure_api()