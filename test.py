#!/usr/bin/env python3
"""
Test script for ECP Validation API
Tests the /api/validate-ecp endpoint
"""

import requests
import json
import time
from typing import Dict, Any, Optional

class ECPValidationTester:
    def __init__(self, base_url: str = "http://localhost:3002"):
        """
        Initialize the tester with base URL
        
        Args:
            base_url: Base URL of your server (default: localhost:3002)
        """
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        
    def test_health_check(self) -> bool:
        """Test if the server is running"""
        try:
            print("🏥 Testing server health...")
            response = self.session.get(f"{self.base_url}/health", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Server is healthy!")
                print(f"   Status: {data.get('status')}")
                print(f"   Platform: {data.get('platform')}")
                print(f"   Firebase: {data.get('firebase')}")
                print(f"   Notion: {data.get('notion')}")
                return True
            else:
                print(f"❌ Health check failed: {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Cannot connect to server: {e}")
            return False
    
    def validate_ecp(self, 
                     page_id: str, 
                     search_text: str = "Business ECP",
                     notion_token: Optional[str] = None) -> Dict[str, Any]:
        """
        Test the ECP validation endpoint
        
        Args:
            page_id: Notion page ID to validate
            search_text: Text to search for in toggle blocks
            notion_token: Optional Notion token (if not using server default)
            
        Returns:
            Dictionary with validation results
        """
        
        print(f"\n🔍 Testing ECP validation...")
        print(f"   Page ID: {page_id}")
        print(f"   Search Text: {search_text}")
        print(f"   Using Token: {'Provided' if notion_token else 'Server Default'}")
        
        # Prepare request data
        request_data = {
            "pageId": page_id,
            "searchText": search_text
        }
        
        if notion_token:
            request_data["notionToken"] = notion_token
            
        try:
            start_time = time.time()
            
            response = self.session.post(
                f"{self.base_url}/api/validate-ecp",
                json=request_data,
                timeout=60  # 60 second timeout for validation
            )
            
            end_time = time.time()
            duration = (end_time - start_time) * 1000  # Convert to milliseconds
            
            print(f"⏱️  Request completed in {duration:.2f}ms")
            print(f"📊 Response Status: {response.status_code}")
            
            # Parse response
            if response.headers.get('content-type', '').startswith('application/json'):
                result = response.json()
            else:
                result = {"error": "Non-JSON response", "text": response.text}
            
            # Display results
            self._display_validation_results(result, response.status_code)
            
            return {
                "status_code": response.status_code,
                "duration_ms": duration,
                "result": result
            }
            
        except requests.exceptions.Timeout:
            print("⏰ Request timed out after 60 seconds")
            return {"error": "timeout", "status_code": 408}
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed: {e}")
            return {"error": str(e), "status_code": 0}
    
    def _display_validation_results(self, result: Dict[str, Any], status_code: int):
        """Display validation results in a formatted way"""
        
        print(f"\n{'='*50}")
        print(f"🔍 VALIDATION RESULTS")
        print(f"{'='*50}")
        
        if status_code == 200 and result.get('success'):
            # Successful validation
            validated = result.get('validated', False)
            issue_count = result.get('stats', {}).get('issueCount', 0)
            
            if validated:
                print(f"✅ VALIDATION PASSED")
                print(f"   {result.get('result', 'No message')}")
            else:
                print(f"❌ VALIDATION FAILED")
                print(f"   {result.get('result', 'No message')}")
                print(f"   Issues Found: {issue_count}")
                
                # Display issues if any
                issues = result.get('issues', [])
                if issues:
                    print(f"\n📋 Validation Issues:")
                    for i, issue in enumerate(issues, 1):
                        print(f"   {i}. {issue.get('message', 'Unknown issue')}")
                        print(f"      Location: {issue.get('location', 'Unknown')}")
                        print(f"      Block ID: {issue.get('blockId', 'Unknown')}")
            
            # Display stats
            stats = result.get('stats', {})
            print(f"\n📊 Statistics:")
            print(f"   Processing Time: {stats.get('processingTimeMs', 0)}ms")
            print(f"   Main Block ID: {result.get('mainBlockId', 'Unknown')}")
            
        else:
            # Failed validation or error
            print(f"❌ REQUEST FAILED")
            print(f"   Status Code: {status_code}")
            print(f"   Error: {result.get('error', 'Unknown error')}")
            if 'pageId' in result:
                print(f"   Page ID: {result['pageId']}")
    
    def run_test_suite(self, test_configs: list):
        """
        Run a suite of tests with different configurations
        
        Args:
            test_configs: List of test configuration dictionaries
        """
        print(f"\n🧪 RUNNING ECP VALIDATION TEST SUITE")
        print(f"{'='*60}")
        
        # First check if server is healthy
        if not self.test_health_check():
            print("❌ Server health check failed. Aborting tests.")
            return
        
        # Run each test
        results = []
        for i, config in enumerate(test_configs, 1):
            print(f"\n📝 Test {i}/{len(test_configs)}: {config.get('name', f'Test {i}')}")
            print(f"{'─'*40}")
            
            result = self.validate_ecp(
                page_id=config['page_id'],
                search_text=config.get('search_text', 'Business ECP'),
                notion_token=config.get('notion_token')
            )
            
            results.append({
                'name': config.get('name', f'Test {i}'),
                'config': config,
                'result': result
            })
            
            # Add delay between tests to avoid rate limiting
            if i < len(test_configs):
                print("⏳ Waiting 2 seconds before next test...")
                time.sleep(2)
        
        # Summary
        self._print_test_summary(results)
        return results
    
    def _print_test_summary(self, results: list):
        """Print a summary of all test results"""
        print(f"\n🏁 TEST SUMMARY")
        print(f"{'='*60}")
        
        passed = 0
        failed = 0
        
        for result in results:
            name = result['name']
            status_code = result['result'].get('status_code', 0)
            success = result['result'].get('result', {}).get('success', False)
            validated = result['result'].get('result', {}).get('validated', False)
            
            if status_code == 200 and success:
                if validated:
                    print(f"✅ {name}: VALIDATION PASSED")
                    passed += 1
                else:
                    print(f"⚠️  {name}: VALIDATION COMPLETED (Issues Found)")
                    passed += 1
            else:
                print(f"❌ {name}: FAILED")
                failed += 1
        
        print(f"\n📊 Results: {passed} passed, {failed} failed")


def main():
    """Main function to run the tests"""
    
    # Configuration - UPDATE THESE VALUES
    SERVER_URL = "http://localhost:3002"  # Change if your server runs on different port
    NOTION_TOKEN = "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"  # Your Notion token
    
    # Test configurations
    test_configs = [
        {
            "name": "Valid ECP Page Test",
            "page_id": "2117432eb843807581b3decd5507c6f5",  # Replace with your test page ID
            "search_text": "Business ECP",
            "notion_token": NOTION_TOKEN
        }
    ]
    
    # Create tester instance
    tester = ECPValidationTester(SERVER_URL)
    
    print("🚀 Starting ECP Validation API Tests")
    print(f"🌐 Server URL: {SERVER_URL}")
    print(f"🔑 Using Token: {'***' + NOTION_TOKEN[-10:] if NOTION_TOKEN else 'Server Default'}")
    
    # Run the test suite
    results = tester.run_test_suite(test_configs)
    
    print(f"\n🎯 All tests completed!")
    return results


if __name__ == "__main__":
    # Install required packages if not already installed
    try:
        import requests
    except ImportError:
        print("❌ 'requests' package not found. Install it with: pip install requests")
        exit(1)
    
    main()