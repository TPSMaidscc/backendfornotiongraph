import requests
import json
from datetime import datetime

def print_hierarchy(node, all_nodes, indent_level):
    """
    Print node hierarchy in a tree structure
    """
    indent = "  " * indent_level
    node_type = node.get('type', 'unknown').upper()
    title_preview = node.get('title', 'No title')[:50]
    if len(node.get('title', '')) > 50:
        title_preview += "..."
    
    print(f"{indent}├─ {node_type}: {title_preview}")
    
    # Find children
    children = [n for n in all_nodes if n.get('parentId') == node.get('id')]
    for child in children:
        print_hierarchy(child, all_nodes, indent_level + 1)

def test_graph_structure_api():
    """
    Test the new /api/graph-structure endpoint
    """
    
    # API Configuration
    BASE_URL = "https://your-vercel-app.vercel.app"  # Replace with your actual Vercel URL
    # For local testing, use: BASE_URL = "http://localhost:3002"
    
    ENDPOINT = f"{BASE_URL}/api/graph-structure"
    
    # Test data
    test_data = {
        "pageId": "2117432eb8438055a473fc7198dc3fdc",  # Replace with your actual page ID
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
            # Parse JSON response - now it's wrapped in results
            data = response.json()
            nodes = data.get('results', [])
            
            print("✅ SUCCESS!")
            print(f"📈 Total Nodes: {len(nodes)}")
            
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
                print(f"  {i+1}. {node.get('type', 'unknown').upper()}")
                print(f"     📝 Title: {node.get('title', 'No title')[:80]}...")
                if node.get('type') == 'policy' and node.get('content'):
                    content_preview = node.get('content', '')[:100]
                    print(f"     📋 Content: {content_preview}...")
                print(f"     🆔 ID: {node.get('id')}, Level: {node.get('level')}")
                print(f"     🔗 Notion Block ID: {node.get('notionBlockId', 'N/A')}")
                print(f"     👨‍👩‍👧‍👦 Parent ID: {node.get('parentId', 'None')}")
                print()
            
            # Show policy content examples
            policy_nodes = [n for n in nodes if n.get('type') == 'policy']
            if policy_nodes:
                print(f"\n📋 Policy Content Examples:")
                for i, policy in enumerate(policy_nodes[:2]):  # Show first 2 policies
                    print(f"   Policy {i+1}: {policy.get('title', 'No title')[:60]}...")
                    content = policy.get('content', '')
                    if content:
                        print(f"   Content: {content[:150]}...")
                    print(f"   Block ID: {policy.get('notionBlockId')}")
                    print()
            
            # Show hierarchy structure
            print("🌳 Node Hierarchy:")
            root_nodes = [n for n in nodes if n.get('parentId') is None]
            for root in root_nodes:
                print_hierarchy(root, nodes, 0)
            
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
    BASE_URL = "https://your-vercel-app.vercel.app"  # Replace with your actual URL
    
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