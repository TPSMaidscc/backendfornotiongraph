// Complete Graph Proxy Service for Notion Integration with Firebase
// server.js - Firebase Firestore implementation

const express = require('express');
const { Client } = require('@notionhq/client');
const cors = require('cors');

// Firebase Admin SDK
const admin = require('firebase-admin');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Hardcoded configuration
const NOTION_TOKEN = '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';
const GRAPH_BASE_URL = 'https://graphfornotion.web.app/';
const PORT = 3002;

// Initialize Firebase Admin SDK
// You'll need to replace this with your Firebase configuration
const serviceAccount = {
  "type": "service_account",
  "project_id": "graphfornotion",
  "private_key_id": "74450e28bced237b21bcd6a37117d904ebfa4893",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCyg50uh6UOJo07\no8/rwI9FCxDW9kqjKHyiU3sOcqP+Hi9aW4rvYMiS81ySTD2iEAlM4F8va6fHGl75\nJipb6TFuZhrvx7uAXDlHyDfxWf+oMmPFirnr/ozkJVC4EVetyBxH3GUO+4ctzi+D\nb8CfQ8F7ZFS7rPU248MXdfKF0BtG1gd/XdbbNFB5IeX/QSvXbAaTNF4ymReAfWeh\n7h5uCqHYn/+7T4B/5RFMBeDBlmdii2np/HBxq1A2vzTIzIyehx23f0g6OAmgJW/7\nSoqfdiCcWo5ZxYZawRl6mhxbKfmpmr9qkV58dK8hrsGBBotXBHClJFjqqzujnV+/\ntrepK8HVAgMBAAECggEAAwKzt6lrd+/gAWG7m7D5aZNscwefzh0cbvtj76QwzlQR\nfd9d2jgiYdIPXVtCTdWh5oVBLbJN186CzAZgAAFQh1la+nC+oYVMpQCEKwKWzG4f\nHyF+DbQTCbT0ZcpLFX/ytCaMIMLOro/T3s5XbAgvPua8BBdAYm7YZzCiyK1wDFN/\n9TPl9bg9dz8YsGlHArpGE8MkTR87yQSandAu5FTsVmGxRcnb6B9bSvuOuWUPO2Vz\nwLvcA22iTKVl4dpOQxyqrVbDahEdHysLSHVPW+6TfbJcez1/6F8aGckOq2Lt0apW\nPBU73cjEU1zKkuP4YB/fukfXKMKyMK2lyB4Wyo8fKQKBgQDw/m2Q3dEAtzta4AMS\nHHwG1Y670krKnnjGARtEOqywwDRTz7fDioAZxIjBwQQ9fKOGScUgLVsLnSo71bRi\nSj+isBk2pmOS/++UWFEJlEKhSDKUIQbbWttC14EelGahTO0ss+UadNTcmWrguqia\n9+kVioYgIG02XvLzEWMd4RjZPQKBgQC9oTmo7EJvqpuvxj/p5i9VuNkY9p7PdZY7\ngI8OMkBtwM1+/XR8g5tq6gVETezBnt7+vYxRw39ofo1hWlqsDnYzg613IAM1EchP\n6QTHsLW+nTWLQFW1gqVlZm8bb+HQUfzAxFiL1A6+aLzMo7qzJL0BFUZkqLDM9I/p\nwNQOXmqkeQKBgGO0P8xRmSi8phfg2iRiGIYTUKwwQrU1fy4cQxWlWND/lCagp5yE\n7p66iwHuQzzVFip21tGLMkHJ0jFTJwALS+yZArVzfXrR3GL5bv2Rk0d6wUI7r8SN\nAG3VDxyBtTxCwVVfUAf0EiT6bBdx4lPLAWniF7+u6sA15DngFavE9yzZAoGAbkJC\nXoARGRCgOZISM5QNzdAPGz66lHIQikRz6ZM6dxZ15fLFOmjjg0TTDyYoFWSk0IWy\nAxCjEkUTO5nnwscd31IfGHbapo7SY/RfPST4Z/7M1UzxCPsP5GetDsz9Bb3GMud3\nfMYuVHRd4rcIpYUlCG4wYfLb6jABRa9DHZ+0bjECgYEAhDuptSYx1yAhuTaB6x5Q\nZzhNl6xpZoaqGVPHkCtDuwMBHpjE73MICj9PofMfv797qdf7QB+BQeAuJ+eNLE7k\nd4TDquhnPV+3fmTEDZg2VNAt8W+7bni/Rc9pNywrnYmcMrxBj6uSIzRF7dAYnVDk\nTTpVbQWUnnKUByRlrAI9kdw=\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@graphfornotion.iam.gserviceaccount.com",
  "client_id": "113951649955580236811",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40graphfornotion.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}


// Initialize Firebase (comment out this section and use environment variables in production)
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://graphfornotion-default-rtdb.firebaseio.com/`
  });
  console.log('🔥 Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  console.log('💡 Using in-memory storage as fallback');
}

// Get Firestore instance
const db = admin.firestore();
const COLLECTION_NAME = 'graph_data';

// Fallback in-memory storage
const graphStorage = new Map();

// Initialize Notion client
const notion = new Client({
  auth: NOTION_TOKEN,
});

// ===== FIREBASE STORAGE FUNCTIONS =====

async function saveGraphToFirestore(pageId, graphData) {
  try {
    const docData = {
      pageId: pageId,
      graphData: graphData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      version: 1
    };

    await db.collection(COLLECTION_NAME).doc(pageId).set(docData);
    console.log(`✅ Graph saved to Firestore: ${pageId}`);
    return true;
  } catch (error) {
    console.error('❌ Error saving to Firestore:', error);
    // Fallback to in-memory storage
    graphStorage.set(pageId, {
      ...graphData,
      lastUpdated: new Date().toISOString(),
      version: 1
    });
    console.log(`📦 Saved to in-memory storage as fallback: ${pageId}`);
    return true;
  }
}

async function getGraphFromFirestore(pageId) {
  try {
    const doc = await db.collection(COLLECTION_NAME).doc(pageId).get();
    
    if (doc.exists) {
      const data = doc.data();
      console.log(`✅ Graph retrieved from Firestore: ${pageId}`);
      return data.graphData;
    } else {
      console.log(`📄 Graph not found in Firestore: ${pageId}`);
      return null;
    }
  } catch (error) {
    console.error('❌ Error reading from Firestore:', error);
    // Fallback to in-memory storage
    const fallbackData = graphStorage.get(pageId);
    if (fallbackData) {
      console.log(`📦 Retrieved from in-memory storage as fallback: ${pageId}`);
      return fallbackData;
    }
    return null;
  }
}

async function updateGraphInFirestore(pageId, graphData) {
  try {
    const docRef = db.collection(COLLECTION_NAME).doc(pageId);
    const doc = await docRef.get();
    
    const updateData = {
      graphData: graphData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      version: doc.exists ? (doc.data().version || 0) + 1 : 1
    };

    await docRef.update(updateData);
    console.log(`✅ Graph updated in Firestore: ${pageId}`);
    return true;
  } catch (error) {
    console.error('❌ Error updating Firestore:', error);
    // Fallback to in-memory storage
    graphStorage.set(pageId, {
      ...graphData,
      lastUpdated: new Date().toISOString(),
      version: (graphStorage.get(pageId)?.version || 0) + 1
    });
    return true;
  }
}

async function listGraphsFromFirestore() {
  try {
    const snapshot = await db.collection(COLLECTION_NAME)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();
    
    const graphs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      graphs.push({
        pageId: doc.id,
        version: data.version || 1,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
        nodeCount: data.graphData?.nodes?.length || 0,
        edgeCount: data.graphData?.edges?.length || 0
      });
    });
    
    console.log(`✅ Listed ${graphs.length} graphs from Firestore`);
    return graphs;
  } catch (error) {
    console.error('❌ Error listing from Firestore:', error);
    // Fallback to in-memory storage
    const graphs = Array.from(graphStorage.entries()).map(([pageId, data]) => ({
      pageId,
      version: data.version,
      lastUpdated: data.lastUpdated,
      nodeCount: data.nodes?.length || 0,
      edgeCount: data.edges?.length || 0
    }));
    return graphs;
  }
}

// ===== UTILITY FUNCTIONS =====

// Helper function to sanitize data before storage
function sanitizeGraphData(graphData) {
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '') // Remove non-printable characters
      .replace(/â/g, '') // Remove specific problematic character
      .replace(/\u0000/g, '') // Remove null characters
      .trim();
  };

  const sanitizeNode = (node) => ({
    ...node,
    data: {
      ...node.data,
      label: sanitizeString(node.data.label),
      originalContent: sanitizeString(node.data.originalContent),
      cleanedContent: sanitizeString(node.data.cleanedContent)
    }
  });

  return {
    ...graphData,
    nodes: graphData.nodes.map(sanitizeNode),
    edges: graphData.edges || []
  };
}

function generateGraphUrl(pageId) {
  // Simple URL with just pageId - data is fetched from Firestore
  return `${GRAPH_BASE_URL}?page=${pageId}`;
}

// ===== NOTION INTEGRATION FUNCTIONS =====

async function fetchToggleBlockStructure({ pageId, text }) {
  const baseUrl = 'https://api.notion.com/v1/blocks';
  const startTime = Date.now();
  const TIMEOUT_BUFFER = 25000; // 25 seconds timeout
  const MAX_DEPTH = 8; // Reasonable depth limit for React Flow

  const checkTimeout = () => {
    if (Date.now() - startTime > TIMEOUT_BUFFER) {
      throw new Error('Operation timed out - structure too complex');
    }
  };

  try {
    checkTimeout();
    
    // Fetch the children of the specified page
    const pageChildrenResponse = await fetch(`${baseUrl}/${pageId}/children`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-02-22',
        'Content-Type': 'application/json'
      }
    });

    if (!pageChildrenResponse.ok) {
      throw new Error(`Failed to fetch page children: ${pageChildrenResponse.statusText}`);
    }

    const pageChildrenData = await pageChildrenResponse.json();

    // Find all callout blocks within the page
    const calloutBlocks = pageChildrenData.results.filter(block => block.type === 'callout');

    if (!calloutBlocks || calloutBlocks.length === 0) {
      throw new Error('No callout blocks found in the specified page.');
    }

    checkTimeout();

    // Fetch all callout children
    const calloutChildrenPromises = calloutBlocks.map(async (calloutBlock) => {
      const response = await fetch(`${baseUrl}/${calloutBlock.id}/children`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-02-22',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch callout children: ${response.statusText}`);
      }
      
      const data = await response.json();
      return { calloutBlock, children: data.results };
    });

    const calloutChildrenResults = await Promise.all(calloutChildrenPromises);
    
    checkTimeout();

    // Search for the toggle with the specified text
    let foundToggle = null;
    let foundInCallout = null;

    for (const { calloutBlock, children } of calloutChildrenResults) {
      if (foundToggle) break;

      checkTimeout();

      const toggleBlock = children.find(block => {
        if (block.type !== 'toggle') return false;
        if (!block.toggle || !block.toggle.rich_text) return false;
        
        return block.toggle.rich_text.some(textBlock => 
          textBlock.plain_text && textBlock.plain_text.includes(text)
        );
      });

      if (toggleBlock) {
        foundToggle = toggleBlock;
        foundInCallout = calloutBlock;
        break;
      }
    }

    if (!foundToggle) {
      throw new Error(`No toggle block found with text containing "${text}"`);
    }

    checkTimeout();

    // Helper functions
    const extractContent = (richText) => {
      if (!richText || !Array.isArray(richText)) return '';
      return richText.map(text => text.plain_text || '').join('');
    };

    const fetchAllPages = async (url) => {
      let allResults = [];
      let nextCursor = null;
      
      do {
        checkTimeout();
        
        const requestUrl = nextCursor ? `${url}?start_cursor=${nextCursor}` : url;
        const response = await fetch(requestUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${NOTION_TOKEN}`,
            'Notion-Version': '2022-02-22',
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch pages: ${response.statusText}`);
        }
        
        const data = await response.json();
        allResults.push(...data.results);
        nextCursor = data.next_cursor;
      } while (nextCursor);
      
      return allResults;
    };

    const fetchAllChildren = async (blockId, currentDepth = 0) => {
      checkTimeout();
      
      if (currentDepth >= MAX_DEPTH) {
        return [];
      }

      try {
        const childrenResults = await fetchAllPages(`${baseUrl}/${blockId}/children`);
        const children = [];
        
        const BATCH_SIZE = 5;
        for (let i = 0; i < childrenResults.length; i += BATCH_SIZE) {
          checkTimeout();
          
          const batch = childrenResults.slice(i, i + BATCH_SIZE);
          const batchPromises = batch.map(async (child) => {
            if (child.type === 'unsupported') {
              return null;
            }
            return await simplifyBlock(child, currentDepth);
          });
          
          const batchResults = await Promise.all(batchPromises);
          children.push(...batchResults.filter(child => child !== null));
        }

        return children;
      } catch (error) {
        console.warn(`Failed to fetch children for block ${blockId}:`, error);
        return [];
      }
    };

    const simplifyBlock = async (block, currentDepth = 0) => {
      checkTimeout();
      
      if (block.type === 'unsupported') {
        return null;
      }

      const simplified = {
        id: block.id,
        type: block.type,
        content: '',
        depth: currentDepth
      };

      // Extract content based on block type
      switch (block.type) {
        case 'toggle':
          simplified.content = extractContent(block.toggle?.rich_text);
          break;
        case 'paragraph':
          simplified.content = extractContent(block.paragraph?.rich_text);
          break;
        case 'heading_1':
          simplified.content = extractContent(block.heading_1?.rich_text);
          break;
        case 'heading_2':
          simplified.content = extractContent(block.heading_2?.rich_text);
          break;
        case 'heading_3':
          simplified.content = extractContent(block.heading_3?.rich_text);
          break;
        case 'bulleted_list_item':
          simplified.content = extractContent(block.bulleted_list_item?.rich_text);
          break;
        case 'numbered_list_item':
          simplified.content = extractContent(block.numbered_list_item?.rich_text);
          break;
        case 'to_do':
          simplified.content = extractContent(block.to_do?.rich_text);
          simplified.checked = block.to_do?.checked;
          break;
        case 'code':
          simplified.content = extractContent(block.code?.rich_text);
          simplified.language = block.code?.language;
          break;
        case 'quote':
          simplified.content = extractContent(block.quote?.rich_text);
          break;
        case 'callout':
          simplified.content = extractContent(block.callout?.rich_text);
          break;
        default:
          simplified.content = `[${block.type}]`;
          break;
      }

      // Fetch children if they exist and we haven't reached max depth
      if (block.has_children && currentDepth < MAX_DEPTH) {
        try {
          simplified.children = await fetchAllChildren(block.id, currentDepth + 1);
        } catch (error) {
          console.warn(`Failed to fetch children for ${block.type} block:`, error);
          simplified.hasChildren = true;
        }
      } else if (block.has_children) {
        simplified.hasChildren = true;
      }

      return simplified;
    };

    checkTimeout();

    // Fetch the complete nested structure
    const completeToggleStructure = await simplifyBlock(foundToggle, 0);

    const result = {
      toggleBlock: completeToggleStructure,
      metadata: {
        foundInCalloutId: foundInCallout.id,
        searchText: text,
        maxDepthUsed: MAX_DEPTH,
        processingTimeMs: Date.now() - startTime
      }
    };

    return { result: JSON.stringify(result, null, 2) };

  } catch (error) {
    console.error('Error fetching toggle block structure:', error);
    throw error;
  }
}

// Transform toggle structure to React Flow format - SAME AS BEFORE
function transformToggleToReactFlow(toggleStructureJson) {
  const toggleStructure = JSON.parse(toggleStructureJson);
  const nodes = [];
  const edges = [];
  let nodeIdCounter = 1;
  
  // Layout configuration - TOP TO BOTTOM with more spacing
  const HORIZONTAL_SPACING = 350;  // Increased spacing between siblings
  const VERTICAL_SPACING = 220;    // Increased spacing between levels
  
  // Track positions for layout
  const levelPositions = new Map();
  const levelCounts = new Map();
  
  // Helper functions for content analysis
  function isCondition(content) {
    // Check for condition patterns like ❶, ❷, ❸, etc. followed by "Condition"
    return /[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition/.test(content);
  }
  
  function isPolicy(content) {
    // Check for policy patterns like "← Policy:" or "← Policy: (→ something ←)"
    return /←\s*Policy\s*:/.test(content);
  }
  
  function extractConditionTitle(content) {
    // Extract title from patterns like:
    // "❶ Condition (→ x=5 ←)" -> "x=5"
    // "❷ Condition (→ y=2 ←)" -> "y=2"
    
    // First try to match with parentheses
    const matchWithParens = content.match(/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition\s*\(→\s*(.+?)\s*←\)/);
    if (matchWithParens) {
      return matchWithParens[1].trim();
    }
    
    // Then try to match everything after "❶ Condition "
    const matchAfterCondition = content.match(/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition\s+(.+)/);
    if (matchAfterCondition) {
      return matchAfterCondition[1].trim();
    }
    
    return content;
  }
  
  function extractPolicyTitle(content, block) {
    // Extract title from patterns like:
    // "← Policy: (→ policy name ←)" -> "policy name"
    
    // First try to match with parentheses
    const matchWithParens = content.match(/←\s*Policy\s*:\s*\(→\s*(.+?)\s*←\)/);
    if (matchWithParens) {
      const title = matchWithParens[1].trim();
      
      // Check if it's a generic placeholder
      if (title.includes('Type your Policy Name Here')) {
        return getFirstFiveWordsFromFirstListItem(block);
      }
      
      return title;
    }
    
    // Then try to match everything after "← Policy: "
    const matchAfterPolicy = content.match(/←\s*Policy\s*:\s*(.+)/);
    if (matchAfterPolicy) {
      const title = matchAfterPolicy[1].trim();
      
      // Check if it's empty or a generic placeholder
      if (!title || title === "Type your Policy Name Here") {
        return getFirstFiveWordsFromFirstListItem(block);
      }
      
      return title;
    }
    
    // Handle cases without anything after colon
    return getFirstFiveWordsFromFirstListItem(block);
  }
  
  function getFirstFiveWordsFromFirstListItem(block) {
    if (!block.children || block.children.length === 0) {
      return "Policy";
    }
    
    // Find the first list item (bulleted_list_item or numbered_list_item)
    for (const child of block.children) {
      if (child.type === 'bulleted_list_item' || child.type === 'numbered_list_item') {
        const listContent = child.content;
        if (listContent && listContent.trim()) {
          const words = listContent.trim().split(/\s+/);
          const firstFiveWords = words.slice(0, 5).join(' ');
          return firstFiveWords || "Policy";
        }
      }
    }
    
    return "Policy";
  }
  
  function isPolicyEmpty(block) {
    if (!block.children || block.children.length === 0) {
      return true;
    }
    
    // Check if all list children are empty
    const listItems = block.children.filter(child => 
      child.type === 'bulleted_list_item' || child.type === 'numbered_list_item'
    );
    
    if (listItems.length === 0) {
      return true;
    }
    
    // Policy is empty if all list items have no content
    return listItems.every(item => {
      const content = item.content;
      return !content || !content.trim();
    });
  }
  
  function cleanText(text) {
    return text
      .replace(/["\[\]]/g, '') // Remove quotes and brackets
      .replace(/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]/g, '') // Remove number emojis
      .replace(/^\s*←?\s*/, '') // Remove leading arrows and spaces
      .replace(/^\s*→?\s*/, '') // Remove right arrows
      .replace(/\s*←\s*$/, '') // Remove trailing arrows
      .replace(/\s*→\s*$/, '') // Remove trailing right arrows
      .replace(/\(\s*→\s*/, '(') // Clean up arrow patterns in parentheses
      .replace(/\s*←\s*\)/, ')') // Clean up arrow patterns in parentheses
      .replace(/â/g, '') // Remove the â character
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim()
      .substring(0, 50) // Limit length
      + (text.length > 50 ? '...' : '');
  }
  
  function createNode(block, parentId = null, level = 0) {
    // Skip empty blocks, dividers, quotes with just "—", and unsupported blocks
    if (!block.content || 
        block.content.trim() === '' || 
        block.content === '—' || 
        block.content === '[divider]' ||
        block.type === 'divider' ||
        block.type === 'unsupported') {
      
      // Still process children
      if (block.children && Array.isArray(block.children)) {
        for (const child of block.children) {
          createNode(child, parentId, level);
        }
      }
      return null;
    }
    
    const content = block.content.trim();
    let shouldCreateNode = false;
    let nodeData = null;
    let nodeStyle = null;
    
    // Check if this is a Business ECP root node
    if (level === 0 && content.includes('Business ECP:')) {
      shouldCreateNode = true;
      const cleanedContent = content.replace(/Business ECP:\s*\(?\s*→?\s*/, '').replace(/\s*←?\s*\)?\s*$/, '').replace(/â/g, '').trim();
      nodeData = {
        label: `🏢 Business ECP: ${cleanedContent || 'ECP Name'}`,
        originalContent: content,
        cleanedContent: cleanedContent,
        blockType: block.type,
        nodeType: 'businessECP',
        depth: level
      };
      nodeStyle = {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        border: '3px solid #5a67d8',
        borderRadius: '12px',
        fontSize: '15px',
        fontWeight: '700',
        padding: '16px 20px',
        minWidth: '220px',
        maxWidth: '280px',
        boxShadow: '0 8px 25px rgba(102, 126, 234, 0.4)',
        textAlign: 'center',
        color: 'white'
      };
    }
    // Check if it's a condition
    else if (isCondition(content)) {
      shouldCreateNode = true;
      const conditionTitle = extractConditionTitle(content);
      const cleanedContent = cleanText(conditionTitle);
      
      nodeData = {
        label: `❓ ${cleanedContent}`,
        originalContent: content,
        cleanedContent: cleanedContent,
        blockType: block.type,
        nodeType: 'condition',
        depth: level
      };
      nodeStyle = {
        background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
        border: '2px solid #f6ad55',
        borderRadius: '12px',
        fontSize: '13px',
        fontWeight: '600',
        padding: '16px 20px',
        minWidth: '180px',
        maxWidth: '280px',
        boxShadow: '0 6px 20px rgba(246, 173, 85, 0.3)',
        textAlign: 'center',
        color: '#8b4513'
      };
    }
    // Check if it's a policy
    else if (isPolicy(content)) {
      const policyTitle = extractPolicyTitle(content, block);
      
      if (policyTitle && !isPolicyEmpty(block)) {
        shouldCreateNode = true;
        const cleanedContent = cleanText(policyTitle);
        
        nodeData = {
          label: `📋 ${cleanedContent}`,
          originalContent: content,
          cleanedContent: cleanedContent,
          blockType: block.type,
          nodeType: 'policy',
          depth: level
        };
        nodeStyle = {
          background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
          border: '2px solid #4fd1c7',
          borderRadius: '12px',
          fontSize: '13px',
          fontWeight: '600',
          padding: '16px 20px',
          minWidth: '180px',
          maxWidth: '280px',
          boxShadow: '0 6px 20px rgba(79, 209, 199, 0.3)',
          textAlign: 'center',
          color: '#2d3748'
        };
      }
    }
    
    let currentNodeId = null;
    
    if (shouldCreateNode && nodeData) {
      const nodeId = String(nodeIdCounter++);
      currentNodeId = nodeId;
      
      // Initialize level tracking
      if (!levelPositions.has(level)) {
        levelPositions.set(level, 0);
        levelCounts.set(level, 0);
      }
      
      // Count nodes at this level first
      levelCounts.set(level, levelCounts.get(level) + 1);
      
      // Calculate position for top-to-bottom layout
      const y = level * VERTICAL_SPACING;  // Y increases downward
      const currentPosAtLevel = levelPositions.get(level);
      const x = currentPosAtLevel * HORIZONTAL_SPACING; // X for horizontal spacing of siblings
      
      // Update level position counter
      levelPositions.set(level, currentPosAtLevel + 1);
      
      // Create the node
      const node = {
        id: nodeId,
        position: { x, y },
        data: nodeData,
        style: nodeStyle,
        type: 'default'
      };
      
      nodes.push(node);
      
      // Create edge from parent if exists
      if (parentId) {
        const edgeStyle = {
          stroke: '#f6ad55',
          strokeWidth: 3,
          animated: true
        };
        
        if (nodeData.nodeType === 'policy') {
          edgeStyle.stroke = '#4fd1c7';
          edgeStyle.strokeWidth = 2;
          edgeStyle.animated = false;
          edgeStyle.strokeDasharray = '8,4';
        } else if (nodeData.nodeType === 'condition') {
          edgeStyle.stroke = '#a5b4fc';
          edgeStyle.strokeWidth = 2;
          edgeStyle.animated = false;
        }
        
        edges.push({
          id: `e${parentId}-${nodeId}`,
          source: parentId,
          target: nodeId,
          type: 'smoothstep',
          style: edgeStyle,
          markerEnd: {
            type: 'arrowclosed',
            color: edgeStyle.stroke,
            width: 20,
            height: 20
          }
        });
      }
    }
    
    // Process children recursively
    if (block.children && Array.isArray(block.children)) {
      for (const child of block.children) {
        createNode(child, currentNodeId || parentId, level + (shouldCreateNode ? 1 : 0));
      }
    }
    
    return currentNodeId;
  }
  
  // Start processing from the root toggle block
  createNode(toggleStructure.toggleBlock);
  
  // Center the layout horizontally if there are nodes
  if (nodes.length > 0) {
    // Calculate the center offset for each level
    const levelWidths = new Map();
    
    // Calculate actual width needed for each level
    nodes.forEach(node => {
      const level = node.data.depth;
      if (!levelWidths.has(level)) {
        levelWidths.set(level, []);
      }
      levelWidths.get(level).push(node.position.x);
    });
    
    // Center each level
    levelWidths.forEach((xPositions, level) => {
      if (xPositions.length > 1) {
        const minX = Math.min(...xPositions);
        const maxX = Math.max(...xPositions);
        const levelWidth = maxX - minX;
        const centerOffset = -levelWidth / 2;
        
        // Apply centering to nodes at this level
        nodes.forEach(node => {
          if (node.data.depth === level) {
            node.position.x += centerOffset;
          }
        });
      } else if (xPositions.length === 1) {
        // Single node, center it at x=0
        nodes.forEach(node => {
          if (node.data.depth === level) {
            node.position.x = 0;
          }
        });
      }
    });
  }
  
  // Count node types for metadata
  const nodeTypes = {
    businessECP: nodes.filter(n => n.data.nodeType === 'businessECP').length,
    conditions: nodes.filter(n => n.data.nodeType === 'condition').length,
    policies: nodes.filter(n => n.data.nodeType === 'policy').length,
    other: nodes.filter(n => !['businessECP', 'condition', 'policy'].includes(n.data.nodeType)).length
  };
  
  return {
    nodes,
    edges,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      maxDepth: Math.max(...nodes.map(n => n.data.depth)),
      sourceMetadata: toggleStructure.metadata,
      nodeTypes: nodeTypes,
      layout: 'topToBottom',
      processingRules: {
        ignoredEmptyPolicies: true,
        extractedConditionNumbers: true,
        cleanedContent: true,
        centeredLayout: true,
        improvedSpacing: true
      }
    }
  };
}

async function appendGraphToNotionPage(notionPageId, graphUrl, graphTitle) {
  try {
    console.log(`Attempting to append graph to Notion page: ${notionPageId}`);
    
    // Verify the page exists and we have access
    const page = await notion.pages.retrieve({ page_id: notionPageId });
    
    if (!page) {
      throw new Error('Notion page not found or access denied');
    }

    console.log('Page found, appending content...');

    // Create blocks to append
    const blocksToAppend = [
      {
        object: 'block',
        type: 'divider',
        divider: {}
      },
      {
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [
            { 
              type: 'text', 
              text: { content: graphTitle }
            }
          ]
        }
      },
      {
        object: 'block',
        type: 'embed',
        embed: {
          url: graphUrl
        }
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { 
              type: 'text', 
              text: { 
                content: `Generated: ${new Date().toLocaleString()} | Stored in Firebase` 
              },
              annotations: {
                color: 'gray'
              }
            }
          ]
        }
      }
    ];

    // Append blocks to the page
    const response = await notion.blocks.children.append({
      block_id: notionPageId,
      children: blocksToAppend
    });

    console.log('Successfully appended blocks to Notion page');

    return {
      success: true,
      blocksAdded: response.results.length,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error appending to Notion page:', error);
    throw new Error(`Failed to append to Notion page: ${error.message}`);
  }
}

// Helper function to encapsulate the graph creation logic
async function createGraphFromToggle(pageId, text) {
  console.log(`🔄 Creating graph for page ${pageId} with text "${text}"`);

  // Extract toggle structure
  const toggleStructure = await fetchToggleBlockStructure({ pageId, text });
  
  // Transform to React Flow using the FIXED function
  const graphData = transformToggleToReactFlow(toggleStructure.result);
  
  // Sanitize the data
  const cleanedGraphData = sanitizeGraphData(graphData);
  
  // Generate unique page ID
  const uniquePageId = `notion-${pageId}-${Date.now()}`;
  
  // Store graph in Firebase
  const firebaseData = {
    ...cleanedGraphData,
    lastUpdated: new Date().toISOString(),
    version: 1,
    sourcePageId: pageId,
    sourceText: text,
    storedIn: 'firebase'
  };
  
  await saveGraphToFirestore(uniquePageId, firebaseData);

  // Generate URL (no data encoding needed)
  const graphUrl = generateGraphUrl(uniquePageId);

  // Append to Notion
  const graphTitle = `Process Flow: ${text}`;
  await appendGraphToNotionPage(pageId, graphUrl, graphTitle);

  return {
    success: true,
    graphUrl: graphUrl,
    graphId: uniquePageId,
    stats: {
      nodes: cleanedGraphData.nodes.length,
      edges: cleanedGraphData.edges.length,
      sourceText: text,
      sourcePageId: pageId,
      nodeTypes: cleanedGraphData.metadata.nodeTypes,
      storedIn: 'firebase'
    },
    message: 'Graph created and stored in Firebase successfully!'
  };
}

// ===== API ROUTES =====

/**
 * GET /api/graph-data/:pageId
 * Serves graph data from Firebase Firestore
 */
app.get('/api/graph-data/:pageId', async (req, res) => {
  try {
    const { pageId } = req.params;
    console.log(`📡 Fetching graph data for: ${pageId}`);
    
    const graphData = await getGraphFromFirestore(pageId);

    if (!graphData) {
      return res.status(404).json({ 
        error: 'Graph not found for this page ID',
        pageId: pageId,
        storage: 'firebase'
      });
    }

    // Return the graph data directly
    res.json({
      success: true,
      pageId,
      storage: 'firebase',
      ...graphData  // This includes nodes, edges, metadata, etc.
    });

  } catch (error) {
    console.error('Error serving graph data:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      storage: 'firebase'
    });
  }
});

/**
 * POST /api/create-graph
 * Simple one-call API to create graph from Notion toggle
 * Body: { pageId: string, text: string }
 */
app.post('/api/create-graph', async (req, res) => {
  try {
    const { pageId, text } = req.body;

    // Validate required parameters
    if (!pageId || !text) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required parameters. Need: pageId, text' 
      });
    }

    console.log(`🔄 Creating graph for page ${pageId} with text "${text}"`);

    const result = await createGraphFromToggle(pageId, text);
    res.json(result);

  } catch (error) {
    console.error('❌ Error creating graph:', error);
    
    // Provide helpful error messages
    let errorMessage = error.message;
    if (error.message.includes('No toggle block found')) {
      errorMessage = `No toggle block found containing "${req.body.text}". Make sure the toggle exists inside a callout block.`;
    } else if (error.message.includes('No callout blocks found')) {
      errorMessage = 'No callout blocks found in the page. Toggle blocks must be inside callout blocks.';
    } else if (error.message.includes('timed out')) {
      errorMessage = 'The toggle structure is too complex. Try reducing nesting or splitting into smaller sections.';
    } else if (error.message.includes('Failed to append')) {
      errorMessage = 'Graph created but failed to add to Notion page. Check API permissions.';
    }

    res.status(500).json({ 
      success: false,
      error: errorMessage,
      details: error.message,
      storage: 'firebase'
    });
  }
});

/**
 * GET /api/create-graph
 * Simple GET version for easy testing via browser
 * Query params: ?pageId=xxx&text=yyy
 */
app.get('/api/create-graph', async (req, res) => {
  try {
    const { pageId, text } = req.query;

    if (!pageId || !text) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing query parameters. Use: ?pageId=YOUR_PAGE_ID&text=YOUR_SEARCH_TEXT'
      });
    }

    const result = await createGraphFromToggle(pageId, text);
    res.json(result);

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * POST /api/quick-test
 * Quick test endpoint with hardcoded values for immediate testing
 */
app.post('/api/quick-test', async (req, res) => {
  try {
    // Use your test page and a common search term
    const testPageId = '2117432eb8438055a473fc7198dc3fdc';
    const testText = 'Business ECP:';
    
    console.log('🧪 Running quick test with Firebase storage...');
    const result = await createGraphFromToggle(testPageId, testText);
    
    res.json({
      ...result,
      testMode: true,
      storage: 'firebase',
      message: 'Quick test completed! Graph stored in Firebase and added to Notion page.'
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message,
      testMode: true,
      storage: 'firebase',
      hint: 'Make sure your test page has a toggle containing "Business ECP:" inside a callout block.'
    });
  }
});

/**
 * POST /api/graph/create
 * Creates or updates a graph for a specific page ID
 * Body: { pageId: string, graphData: { nodes: [], edges: [] } }
 */
app.post('/api/graph/create', async (req, res) => {
  try {
    const { pageId, graphData } = req.body;

    if (!pageId || !graphData) {
      return res.status(400).json({ 
        error: 'pageId and graphData are required' 
      });
    }

    // Validate graph data structure
    if (!graphData.nodes || !Array.isArray(graphData.nodes)) {
      return res.status(400).json({ 
        error: 'graphData must contain nodes array' 
      });
    }

    if (!graphData.edges || !Array.isArray(graphData.edges)) {
      return res.status(400).json({ 
        error: 'graphData must contain edges array' 
      });
    }

    // Sanitize and prepare data for storage
    const cleanedGraphData = sanitizeGraphData(graphData);
    const firebaseData = {
      ...cleanedGraphData,
      lastUpdated: new Date().toISOString(),
      version: 1,
      storedIn: 'firebase'
    };

    // Store in Firebase
    await saveGraphToFirestore(pageId, firebaseData);

    // Generate graph URL
    const graphUrl = generateGraphUrl(pageId);

    res.json({
      success: true,
      pageId,
      graphUrl,
      version: 1,
      storage: 'firebase',
      message: 'Graph created/updated and stored in Firebase successfully'
    });

  } catch (error) {
    console.error('Error creating graph:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      storage: 'firebase'
    });
  }
});

/**
 * POST /api/graph/append-to-notion
 * Creates a graph and appends it to an existing Notion page
 * Body: { notionPageId: string, graphData: { nodes: [], edges: [] }, graphTitle?: string }
 */
app.post('/api/graph/append-to-notion', async (req, res) => {
  try {
    const { notionPageId, graphData, graphTitle = 'Graph' } = req.body;

    console.log('Received request:', { notionPageId, graphTitle, nodeCount: graphData?.nodes?.length });

    if (!notionPageId || !graphData) {
      return res.status(400).json({ 
        error: 'notionPageId and graphData are required' 
      });
    }

    // Validate graph data structure
    if (!graphData.nodes || !Array.isArray(graphData.nodes)) {
      return res.status(400).json({ 
        error: 'graphData must contain nodes array' 
      });
    }

    if (!graphData.edges || !Array.isArray(graphData.edges)) {
      return res.status(400).json({ 
        error: 'graphData must contain edges array' 
      });
    }

    // Generate a unique page ID for this graph based on Notion page ID and timestamp
    const uniquePageId = `${notionPageId}-${Date.now()}`;

    // Sanitize and prepare data for storage
    const cleanedGraphData = sanitizeGraphData(graphData);
    const firebaseData = {
      ...cleanedGraphData,
      lastUpdated: new Date().toISOString(),
      version: 1,
      notionPageId: notionPageId,
      storedIn: 'firebase'
    };

    // Store in Firebase
    await saveGraphToFirestore(uniquePageId, firebaseData);

    // Generate graph URL
    const graphUrl = generateGraphUrl(uniquePageId);

    console.log('Generated graph URL:', graphUrl);

    // Append graph to existing Notion page
    const appendResult = await appendGraphToNotionPage(notionPageId, graphUrl, graphTitle);

    res.json({
      success: true,
      pageId: uniquePageId,
      notionPageId: notionPageId,
      graphUrl,
      version: 1,
      storage: 'firebase',
      message: 'Graph created, stored in Firebase, and appended to Notion page successfully',
      appendResult
    });

  } catch (error) {
    console.error('Error appending graph to Notion:', error);
    res.status(500).json({ 
      error: 'Failed to append graph to Notion page',
      details: error.message,
      storage: 'firebase'
    });
  }
});

/**
 * GET /api/graph/:pageId
 * Retrieves graph data and URL for a specific page ID from Firebase
 */
app.get('/api/graph/:pageId', async (req, res) => {
  try {
    const { pageId } = req.params;
    const graphData = await getGraphFromFirestore(pageId);

    if (!graphData) {
      return res.status(404).json({ 
        error: 'Graph not found for this page ID',
        storage: 'firebase'
      });
    }

    const graphUrl = generateGraphUrl(pageId);

    res.json({
      pageId,
      graphData,
      graphUrl,
      version: graphData.version,
      lastUpdated: graphData.lastUpdated,
      storage: 'firebase'
    });

  } catch (error) {
    console.error('Error retrieving graph:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      storage: 'firebase'
    });
  }
});

/**
 * GET /api/graphs
 * Lists all stored graphs from Firebase
 */
app.get('/api/graphs', async (req, res) => {
  try {
    const graphs = await listGraphsFromFirestore();

    const graphsWithUrls = graphs.map(graph => ({
      ...graph,
      graphUrl: generateGraphUrl(graph.pageId)
    }));

    res.json({
      success: true,
      graphs: graphsWithUrls,
      totalCount: graphs.length,
      storage: 'firebase'
    });

  } catch (error) {
    console.error('Error listing graphs:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      storage: 'firebase'
    });
  }
});

/**
 * DELETE /api/graph/:pageId
 * Deletes a graph from Firebase
 */
app.delete('/api/graph/:pageId', async (req, res) => {
  try {
    const { pageId } = req.params;
    
    await db.collection(COLLECTION_NAME).doc(pageId).delete();
    console.log(`🗑️ Graph deleted from Firebase: ${pageId}`);

    res.json({
      success: true,
      pageId,
      message: 'Graph deleted from Firebase successfully',
      storage: 'firebase'
    });

  } catch (error) {
    console.error('Error deleting graph:', error);
    res.status(500).json({ 
      error: 'Failed to delete graph',
      details: error.message,
      storage: 'firebase'
    });
  }
});

/**
 * GET /api/firebase-status
 * Check Firebase connection status
 */
app.get('/api/firebase-status', async (req, res) => {
  try {
    // Try to read from Firebase
    const testDoc = await db.collection(COLLECTION_NAME).limit(1).get();
    
    res.json({
      success: true,
      firebase: {
        connected: true,
        collections: COLLECTION_NAME,
        documentsCount: testDoc.size
      },
      fallback: {
        inMemoryGraphs: graphStorage.size
      }
    });

  } catch (error) {
    res.json({
      success: false,
      firebase: {
        connected: false,
        error: error.message
      },
      fallback: {
        inMemoryGraphs: graphStorage.size,
        usingFallback: true
      }
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    storage: {
      firebase: '🔥 Connected',
      fallback: `📦 ${graphStorage.size} graphs in memory`,
      collection: COLLECTION_NAME
    },
    notionConfigured: !!NOTION_TOKEN
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Graph Proxy Service running on port ${PORT}`);
  console.log(`📊 Graph Base URL: ${GRAPH_BASE_URL}`);
  console.log(`🔥 Firebase Collection: ${COLLECTION_NAME}`);
  console.log(`📝 Notion Integration: ${NOTION_TOKEN ? 'Configured' : 'Not configured'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📖 Main API: http://localhost:${PORT}/api/create-graph`);
  console.log(`🧪 Quick test: http://localhost:${PORT}/api/quick-test`);
  console.log(`🔥 Firebase status: http://localhost:${PORT}/api/firebase-status`);
});

module.exports = app;