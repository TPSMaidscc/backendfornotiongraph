import requests
import json
from datetime import datetime

def test_graph_structure_api():
    """
    Test the new /api/graph-structure endpoint
    """
    
    # API Configuration
    BASE_URL = "https://backendfornotiongraph.vercel.app"  # Replace with your actual Vercel URL
    # For local testing, use: BASE_URL = "http://localhost:3002"
    
    ENDPOINT = f"{BASE_URL}/api/graph-structure"
    
    # Test data
    test_data = {
        "pageId": "2117432eb84380768024ee386b9bc3a5",  # Replace with your actual page ID
        "text": "Business ECP:"
    }
    
    print("🚀 Testing Graph Structure API")
    print(f"URL: {ENDPOINT}")
    print(f"Payload: {json.dumps(test_data, indent=2)}")
    print("-" * 50)
    
    try:
        # Make the API request
        print("📡 Sending request...")
        response = requests.post(
            ENDPOINT,
            json=test_data,
            headers={"Content-Type": "application/json"},
            timeout=60  # 60 second timeout
        )
        
        # Check response status
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            # Parse JSON response
            data = response.json()
            
            print("✅ SUCCESS!")
            print(f"⏱️  Processing Time: {data.get('metadata', {}).get('processingTimeMs', 'N/A')}ms")
            print(f"📄 Page ID: {data.get('pageId', 'N/A')}")
            print(f"🔍 Search Text: {data.get('searchText', 'N/A')}")
            
            # Print structure summary
            structure = data.get('structure', {})
            nodes = structure.get('nodes', [])
            edges = structure.get('edges', [])
            
            print(f"📈 Total Nodes: {len(nodes)}")
            print(f"🔗 Total Edges: {len(edges)}")
            
            # Print node breakdown
            node_types = {}
            for node in nodes:
                node_type = node.get('type', 'unknown')
                node_types[node_type] = node_types.get(node_type, 0) + 1
            
            print("\n📋 Node Types:")
            for node_type, count in node_types.items():
                print(f"  • {node_type}: {count}")
            
            # Print first few nodes with details
            print(f"\n🏗️  First {min(3, len(nodes))} Nodes:")
            for i, node in enumerate(nodes[:3]):
                print(f"  {i+1}. {node.get('type', 'unknown').upper()}: {node.get('title', 'No title')}")
                if node.get('type') == 'policy' and node.get('content'):
                    content_items = len(node.get('content', []))
                    print(f"     📝 Policy has {content_items} content items")
                print(f"     🆔 ID: {node.get('id')}, Level: {node.get('level')}")
            
            # Show policy content example
            policy_nodes = [n for n in nodes if n.get('type') == 'policy']
            if policy_nodes:
                print(f"\n📋 First Policy Content Example:")
                policy = policy_nodes[0]
                print(f"   Title: {policy.get('title')}")
                content = policy.get('content', [])
                for i, item in enumerate(content[:3]):  # Show first 3 items
                    print(f"   {i+1}. {item.get('content', 'No content')}")
                if len(content) > 3:
                    print(f"   ... and {len(content) - 3} more items")
            
            # Save full response to file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"graph_structure_{timestamp}.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"\n💾 Full response saved to: {filename}")
            
        else:
            print("❌ FAILED!")
            print(f"Error: {response.status_code}")
            try:
                error_data = response.json()
                print(f"Details: {error_data.get('error', 'Unknown error')}")
            except:
                print(f"Response text: {response.text}")
    
    except requests.exceptions.Timeout:
        print("⏰ Request timed out (60 seconds)")
    except requests.exceptions.ConnectionError:
        print("🔌 Connection error - check your URL and internet connection")
    except requests.exceptions.RequestException as e:
        print(f"❌ Request error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

def test_health_check():
    """
    Quick health check to verify the API is running
    """
    BASE_URL = "https://backendfornotiongraph.vercel.app"  # Replace with your actual URL
    
    try:
        print("🏥 Testing health check...")
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print("✅ API is healthy!")
            print(f"   Status: {data.get('status')}")
            print(f"   Firebase: {data.get('firebase')}")
            print(f"   Notion: {data.get('notion')}")
        else:
            print(f"❌ Health check failed: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Health check error: {e}")

if __name__ == "__main__":
    print("🧪 Graph Structure API Test Script")
    print("=" * 50)
    
    # Update these values before running:
    print("📝 IMPORTANT: Update these values in the script:")
    print("   • BASE_URL: Your actual Vercel deployment URL")
    print("   • pageId: Your actual Notion page ID")
    print("=" * 50)
    
    # Run health check first
    test_health_check()
    print()
    
    # Run main test
    test_graph_structure_api()
    
    print("\n🎉 Test completed!")