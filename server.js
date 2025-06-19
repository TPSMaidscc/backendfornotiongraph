// Vercel-compatible server.js with hardcoded configuration
const express = require('express');
const { Client } = require('@notionhq/client');
const cors = require('cors');

// Firebase Admin SDK
let admin = null;
let db = null;
let isFirebaseEnabled = false;

try {
  admin = require('firebase-admin');
  
  // 🔥 REGENERATE THESE CREDENTIALS IMMEDIATELY - THE ONES YOU SHARED ARE COMPROMISED
  const serviceAccount = {
    "type": "service_account",
    "project_id": "graphfornotion",
    "private_key_id": "NEW_PRIVATE_KEY_ID_HERE", // Get new one from Firebase
    "private_key": "-----BEGIN PRIVATE KEY-----\nNEW_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n", // REGENERATE THIS
    "client_email": "firebase-adminsdk-fbsvc@graphfornotion.iam.gserviceaccount.com",
    "client_id": "NEW_CLIENT_ID_HERE", // Get new one from Firebase
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robots/v1/metadata/x509/firebase-adminsdk-fbsvc%40graphfornotion.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com"
  };

  // Only initialize if credentials look valid
  if (serviceAccount.private_key.includes('NEW_PRIVATE_KEY_HERE')) {
    console.log('⚠️ Using placeholder Firebase credentials - Firebase disabled');
    isFirebaseEnabled = false;
  } else {
    // Initialize Firebase
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    db = admin.firestore();
    isFirebaseEnabled = true;
    console.log('🔥 Firebase initialized successfully');
  }
} catch (error) {
  console.log('⚠️ Firebase initialization failed, using in-memory storage:', error.message);
  isFirebaseEnabled = false;
}

const app = express();

// Enhanced CORS for Vercel
app.use(cors({
  origin: [
    'http://localhost:3001',
    'https://graphfornotion.web.app',
    'https://graphfornotion.firebaseapp.com',
    'https://*.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Hardcoded configuration
const NOTION_TOKEN = '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';
const GRAPH_BASE_URL = 'https://graphfornotion.web.app/';
const COLLECTION_NAME = 'graph_data';

// Initialize Notion client
const notion = new Client({
  auth: NOTION_TOKEN,
});

// In-memory storage fallback
const graphStorage = new Map();

// ===== FIREBASE FUNCTIONS =====

async function saveGraphToFirestore(pageId, graphData) {
  if (!isFirebaseEnabled) {
    // Fallback to in-memory storage
    graphStorage.set(pageId, {
      ...graphData,
      lastUpdated: new Date().toISOString(),
      version: 1,
      storage: 'memory'
    });
    console.log(`📦 Saved to in-memory storage: ${pageId}`);
    return true;
  }

  try {
    const docData = {
      pageId: pageId,
      graphData: graphData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      version: 1,
      storage: 'firebase'
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
      version: 1,
      storage: 'memory-fallback'
    });
    console.log(`📦 Saved to in-memory storage as fallback: ${pageId}`);
    return true;
  }
}

async function getGraphFromFirestore(pageId) {
  if (!isFirebaseEnabled) {
    const data = graphStorage.get(pageId);
    if (data) {
      console.log(`📦 Retrieved from in-memory storage: ${pageId}`);
      return data;
    }
    return null;
  }

  try {
    const doc = await db.collection(COLLECTION_NAME).doc(pageId).get();
    
    if (doc.exists) {
      const data = doc.data();
      console.log(`✅ Graph retrieved from Firestore: ${pageId}`);
      return { ...data.graphData, storage: 'firebase' };
    } else {
      console.log(`📄 Graph not found in Firestore: ${pageId}`);
      return null;
    }
  } catch (error) {
    console.error('❌ Error reading from Firestore:', error);
    const fallbackData = graphStorage.get(pageId);
    if (fallbackData) {
      console.log(`📦 Retrieved from in-memory storage as fallback: ${pageId}`);
      return fallbackData;
    }
    return null;
  }
}

// ===== UTILITY FUNCTIONS =====

function sanitizeGraphData(graphData) {
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '')
      .replace(/â/g, '')
      .replace(/\u0000/g, '')
      .trim();
  };

  const sanitizeNode = (node) => ({
    ...node,
    data: {
      ...node.data,
      label: sanitizeString(node.data?.label || ''),
      originalContent: sanitizeString(node.data?.originalContent || ''),
      cleanedContent: sanitizeString(node.data?.cleanedContent || '')
    }
  });

  return {
    ...graphData,
    nodes: (graphData.nodes || []).map(sanitizeNode),
    edges: graphData.edges || []
  };
}

function generateGraphUrl(pageId) {
  return `${GRAPH_BASE_URL}?page=${pageId}`;
}

// ===== NOTION INTEGRATION FUNCTIONS =====

async function appendGraphToNotionPage(notionPageId, graphUrl, graphTitle) {
  try {
    console.log(`📝 Attempting to append graph to Notion page: ${notionPageId}`);
    
    // Verify the page exists and we have access
    const page = await notion.pages.retrieve({ page_id: notionPageId });
    
    if (!page) {
      throw new Error('Notion page not found or access denied');
    }

    console.log('✅ Page found, appending content...');

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
                content: `Generated: ${new Date().toLocaleString()} | Storage: ${isFirebaseEnabled ? 'Firebase' : 'Memory'}` 
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

    console.log('✅ Successfully appended blocks to Notion page');

    return {
      success: true,
      blocksAdded: response.results.length,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error appending to Notion page:', error);
    throw new Error(`Failed to append to Notion page: ${error.message}`);
  }
}

async function fetchToggleBlockStructure({ pageId, text }) {
  const baseUrl = 'https://api.notion.com/v1/blocks';
  const startTime = Date.now();
  const TIMEOUT_BUFFER = 20000; // 20 seconds for Vercel (max 30s)

  const checkTimeout = () => {
    if (Date.now() - startTime > TIMEOUT_BUFFER) {
      throw new Error('Operation timed out - structure too complex for serverless');
    }
  };

  try {
    checkTimeout();
    
    const headers = {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-02-22',
      'Content-Type': 'application/json'
    };

    // Fetch page children with timeout
    console.log(`🔍 Fetching page children for: ${pageId}`);
    const pageResponse = await fetch(`${baseUrl}/${pageId}/children`, { 
      method: 'GET', 
      headers,
      signal: AbortSignal.timeout(10000) // 10s timeout
    });
    
    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch page: ${pageResponse.status} ${pageResponse.statusText}`);
    }

    const pageData = await pageResponse.json();
    console.log(`📄 Found ${pageData.results?.length || 0} blocks in page`);
    
    const calloutBlocks = pageData.results.filter(block => block.type === 'callout');
    console.log(`📋 Found ${calloutBlocks.length} callout blocks`);

    if (!calloutBlocks.length) {
      throw new Error('No callout blocks found in the specified page');
    }

    checkTimeout();

    // Find toggle in callouts
    for (let i = 0; i < calloutBlocks.length; i++) {
      const callout = calloutBlocks[i];
      console.log(`🔍 Checking callout ${i + 1}/${calloutBlocks.length}`);
      
      try {
        const childResponse = await fetch(`${baseUrl}/${callout.id}/children`, { 
          method: 'GET', 
          headers,
          signal: AbortSignal.timeout(8000) // 8s timeout per callout
        });
        
        if (!childResponse.ok) {
          console.log(`⚠️ Failed to fetch callout children: ${childResponse.status}`);
          continue;
        }

        const childData = await childResponse.json();
        console.log(`📄 Found ${childData.results?.length || 0} children in callout`);
        
        const toggle = childData.results.find(block => {
          const isToggle = block.type === 'toggle';
          if (!isToggle) return false;
          
          const hasText = block.toggle?.rich_text?.some(t => 
            t.plain_text && t.plain_text.includes(text)
          );
          
          if (hasText) {
            console.log(`✅ Found matching toggle: ${block.toggle.rich_text[0]?.plain_text?.substring(0, 50)}...`);
          }
          
          return hasText;
        });

        if (toggle) {
          console.log(`🎯 Processing toggle structure...`);
          const result = {
            toggleBlock: await simplifyBlockForVercel(toggle, headers, 0),
            metadata: {
              searchText: text,
              processingTimeMs: Date.now() - startTime,
              foundInCalloutId: callout.id
            }
          };
          return { result: JSON.stringify(result, null, 2) };
        }
      } catch (error) {
        console.log(`⚠️ Error processing callout ${i + 1}: ${error.message}`);
        continue;
      }
    }

    throw new Error(`No toggle block found containing "${text}" in any callout block`);
  } catch (error) {
    console.error('❌ Error in fetchToggleBlockStructure:', error);
    throw error;
  }
}

async function simplifyBlockForVercel(block, headers, depth) {
  if (depth > 4) return null; // Limit depth for Vercel performance

  const extractContent = (richText) => {
    if (!richText || !Array.isArray(richText)) return '';
    return richText.map(text => text.plain_text || '').join('');
  };

  const simplified = {
    id: block.id,
    type: block.type,
    content: '',
    depth: depth
  };

  // Extract content based on block type
  switch (block.type) {
    case 'toggle':
      simplified.content = extractContent(block.toggle?.rich_text);
      break;
    case 'paragraph':
      simplified.content = extractContent(block.paragraph?.rich_text);
      break;
    case 'bulleted_list_item':
      simplified.content = extractContent(block.bulleted_list_item?.rich_text);
      break;
    case 'numbered_list_item':
      simplified.content = extractContent(block.numbered_list_item?.rich_text);
      break;
    default:
      simplified.content = `[${block.type}]`;
      break;
  }

  // Fetch children with strict limits for Vercel
  if (block.has_children && depth < 3) {
    try {
      const childResponse = await fetch(`https://api.notion.com/v1/blocks/${block.id}/children`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000) // 5s timeout
      });
      
      if (childResponse.ok) {
        const childData = await childResponse.json();
        // Limit to first 8 children for performance
        const limitedChildren = childData.results.slice(0, 8);
        
        simplified.children = await Promise.all(
          limitedChildren.map(child => simplifyBlockForVercel(child, headers, depth + 1))
        );
        simplified.children = simplified.children.filter(Boolean);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to fetch children for ${block.id}: ${error.message}`);
      simplified.hasChildren = true;
    }
  }

  return simplified;
}

// Simplified transformation for Vercel
function transformToggleToReactFlow(toggleStructureJson) {
  const toggleStructure = JSON.parse(toggleStructureJson);
  const nodes = [];
  const edges = [];
  let nodeIdCounter = 1;

  function processBlock(block, parentId = null, level = 0, xOffset = 0) {
    if (!block || !block.content || level > 6) return null;

    const content = block.content.trim();
    let shouldCreate = false;
    let nodeData = null;
    let nodeStyle = {};

    // Business ECP (root)
    if (level === 0 && content.includes('Business ECP:')) {
      shouldCreate = true;
      const cleanedContent = content.replace(/Business ECP:\s*\(.*?\)/, '').replace(/Business ECP:\s*/, '').trim();
      nodeData = {
        label: `🏢 Business ECP: ${cleanedContent || 'ECP Name'}`,
        originalContent: content,
        blockType: block.type,
        nodeType: 'businessECP',
        depth: level
      };
      nodeStyle = {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        padding: '20px 24px',
        minWidth: '240px',
        boxShadow: '0 8px 25px rgba(102, 126, 234, 0.4)'
      };
    }
    // Conditions
    else if (/[❶❷❸❹❺❻❼❽❾❿]\s*Condition/.test(content)) {
      shouldCreate = true;
      const match = content.match(/[❶❷❸❹❺❻❼❽❾❿]\s*Condition\s*\(→\s*(.+?)\s*←\)/);
      const conditionText = match ? match[1].trim() : content.replace(/[❶❷❸❹❺❻❼❽❾❿]\s*Condition\s*/, '').trim();
      nodeData = {
        label: `❓ ${conditionText}`,
        originalContent: content,
        blockType: block.type,
        nodeType: 'condition',
        depth: level
      };
      nodeStyle = {
        background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
        color: '#8b4513',
        border: 'none',
        borderRadius: '12px',
        padding: '18px 22px',
        minWidth: '200px',
        boxShadow: '0 6px 20px rgba(246, 173, 85, 0.3)'
      };
    }
    // Policies
    else if (/←\s*Policy\s*:/.test(content)) {
      shouldCreate = true;
      let policyTitle = content.replace(/←\s*Policy\s*:\s*/, '').trim();
      
      // If it's a generic placeholder, try to get content from children
      if (!policyTitle || policyTitle.includes('Type your Policy Name Here')) {
        if (block.children && block.children.length > 0) {
          const firstChild = block.children.find(child => 
            child.type === 'bulleted_list_item' && child.content && child.content.trim()
          );
          if (firstChild) {
            policyTitle = firstChild.content.split(' ').slice(0, 5).join(' ');
          }
        }
        if (!policyTitle) policyTitle = 'Policy';
      }
      
      nodeData = {
        label: `📋 ${policyTitle}`,
        originalContent: content,
        blockType: block.type,
        nodeType: 'policy',
        depth: level
      };
      nodeStyle = {
        background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        color: '#2d3748',
        border: 'none',
        borderRadius: '12px',
        padding: '18px 22px',
        minWidth: '200px',
        boxShadow: '0 6px 20px rgba(79, 209, 199, 0.3)'
      };
    }

    if (shouldCreate && nodeData) {
      const nodeId = String(nodeIdCounter++);
      
      // Calculate position
      const x = xOffset;
      const y = level * 220; // Vertical spacing
      
      nodes.push({
        id: nodeId,
        position: { x, y },
        data: nodeData,
        style: nodeStyle,
        type: 'default'
      });

      // Create edge from parent
      if (parentId) {
        edges.push({
          id: `e${parentId}-${nodeId}`,
          source: parentId,
          target: nodeId,
          type: 'smoothstep',
          style: {
            stroke: nodeData.nodeType === 'condition' ? '#f6ad55' : '#4fd1c7',
            strokeWidth: nodeData.nodeType === 'condition' ? 3 : 2
          },
          markerEnd: {
            type: 'arrowclosed',
            color: nodeData.nodeType === 'condition' ? '#f6ad55' : '#4fd1c7'
          }
        });
      }

      // Process children with horizontal offset
      if (block.children && block.children.length > 0) {
        const childSpacing = 350; // Horizontal spacing between siblings
        const startOffset = xOffset - (block.children.length - 1) * childSpacing / 2;
        
        block.children.forEach((child, index) => {
          const childX = startOffset + index * childSpacing;
          processBlock(child, nodeId, level + 1, childX);
        });
      }

      return nodeId;
    }

    // Process children even if not creating node
    if (block.children && block.children.length > 0) {
      block.children.forEach((child, index) => {
        const childX = xOffset + index * 350;
        processBlock(child, parentId, level, childX);
      });
    }

    return null;
  }

  processBlock(toggleStructure.toggleBlock, null, 0, 0);

  // Center the layout
  if (nodes.length > 0) {
    const minX = Math.min(...nodes.map(n => n.position.x));
    const maxX = Math.max(...nodes.map(n => n.position.x));
    const centerOffset = -(minX + maxX) / 2;
    
    nodes.forEach(node => {
      node.position.x += centerOffset;
    });
  }

  return {
    nodes,
    edges,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      sourceMetadata: toggleStructure.metadata,
      layout: 'topToBottom',
      storage: isFirebaseEnabled ? 'firebase' : 'memory'
    }
  };
}

// ===== API ROUTES =====

// Root route for Vercel
app.get('/', (req, res) => {
  res.json({
    message: 'Notion Graph Proxy Service - Vercel Deployment',
    status: 'running',
    timestamp: new Date().toISOString(),
    firebase: isFirebaseEnabled ? 'enabled' : 'disabled (using memory)',
    notion: NOTION_TOKEN ? 'configured' : 'missing',
    endpoints: [
      'GET /health',
      'GET /api/firebase-status', 
      'POST /api/create-graph',
      'POST /api/quick-test',
      'GET /api/graph-data/:pageId'
    ]
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    platform: 'vercel',
    firebase: isFirebaseEnabled ? 'connected' : 'memory-fallback',
    notion: NOTION_TOKEN ? 'configured' : 'missing',
    storage: isFirebaseEnabled ? 'firestore' : 'memory',
    memoryGraphs: graphStorage.size
  });
});

// Firebase status
app.get('/api/firebase-status', (req, res) => {
  res.json({
    firebase: {
      enabled: isFirebaseEnabled,
      status: isFirebaseEnabled ? 'connected' : 'using-memory-fallback',
      projectId: isFirebaseEnabled ? 'graphfornotion' : null
    },
    storage: {
      type: isFirebaseEnabled ? 'firestore' : 'memory',
      itemCount: graphStorage.size
    },
    platform: 'vercel'
  });
});

// Get graph data
app.get('/api/graph-data/:pageId', async (req, res) => {
  try {
    const { pageId } = req.params;
    console.log(`📡 Fetching graph data for: ${pageId}`);
    
    const graphData = await getGraphFromFirestore(pageId);

    if (!graphData) {
      return res.status(404).json({
        error: 'Graph not found',
        pageId: pageId,
        storage: isFirebaseEnabled ? 'firebase' : 'memory'
      });
    }

    res.json({
      success: true,
      pageId,
      storage: graphData.storage || (isFirebaseEnabled ? 'firebase' : 'memory'),
      ...graphData
    });
  } catch (error) {
    console.error('❌ Error serving graph data:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      platform: 'vercel'
    });
  }
});

// Create graph - Main API endpoint
app.post('/api/create-graph', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { pageId, text } = req.body;

    if (!pageId || !text) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: pageId and text'
      });
    }

    console.log(`🚀 Creating graph for page ${pageId} with text "${text}"`);

    // Extract and transform with timeout protection
    const toggleStructure = await fetchToggleBlockStructure({ pageId, text });
    console.log(`✅ Toggle structure extracted in ${Date.now() - startTime}ms`);
    
    const graphData = transformToggleToReactFlow(toggleStructure.result);
    console.log(`✅ Graph transformed: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
    
    const cleanedGraphData = sanitizeGraphData(graphData);

    // Store with unique ID
    const uniquePageId = `notion-${pageId}-${Date.now()}`;
    await saveGraphToFirestore(uniquePageId, cleanedGraphData);
    console.log(`✅ Graph stored with ID: ${uniquePageId}`);

    // Generate URL
    const graphUrl = generateGraphUrl(uniquePageId);
    console.log(`🔗 Generated graph URL: ${graphUrl}`);

    // ✨ APPEND GRAPH TO NOTION PAGE ✨
    try {
      const graphTitle = `📊 Process Flow: ${text}`;
      const appendResult = await appendGraphToNotionPage(pageId, graphUrl, graphTitle);
      console.log(`✅ Graph successfully added to Notion page`);
      
      res.json({
        success: true,
        graphUrl: graphUrl,
        graphId: uniquePageId,
        stats: {
          nodes: cleanedGraphData.nodes.length,
          edges: cleanedGraphData.edges.length,
          storage: isFirebaseEnabled ? 'firebase' : 'memory',
          processingTimeMs: Date.now() - startTime
        },
        notionResult: appendResult,
        message: `✅ Graph created and added to Notion page successfully! ${isFirebaseEnabled ? 'Stored in Firebase.' : 'Stored in memory.'}`
      });
      
    } catch (notionError) {
      console.error('❌ Failed to add graph to Notion page:', notionError);
      
      // Still return success for graph creation, but note the Notion error
      res.json({
        success: true,
        graphUrl: graphUrl,
        graphId: uniquePageId,
        stats: {
          nodes: cleanedGraphData.nodes.length,
          edges: cleanedGraphData.edges.length,
          storage: isFirebaseEnabled ? 'firebase' : 'memory',
          processingTimeMs: Date.now() - startTime
        },
        warning: `Graph created but failed to add to Notion page: ${notionError.message}`,
        message: `⚠️ Graph created successfully but couldn't add to Notion page. You can access it directly via the URL.`
      });
    }

  } catch (error) {
    console.error('❌ Error creating graph:', error);
    
    let errorMessage = error.message;
    if (error.message.includes('No toggle')) {
      errorMessage = `No toggle block found containing "${req.body?.text || 'N/A'}" inside any callout block`;
    } else if (error.message.includes('No callout')) {
      errorMessage = 'No callout blocks found in the page. Toggle blocks must be inside callout blocks.';
    } else if (error.message.includes('timed out')) {
      errorMessage = 'Request timed out - the toggle structure is too complex for serverless functions';
    } else if (error.message.includes('Failed to fetch page')) {
      errorMessage = 'Could not access the Notion page. Check the page ID and permissions.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      platform: 'vercel',
      processingTimeMs: Date.now() - startTime
    });
  }
});

// Quick test endpoint
app.post('/api/quick-test', async (req, res) => {
  try {
    const testPageId = '2117432eb8438055a473fc7198dc3fdc';
    const testText = 'Business ECP:';
    
    console.log('🧪 Running quick test with hardcoded values...');
    
    // Call our own create-graph endpoint
    const createResponse = await fetch(`${req.protocol}://${req.get('host')}/api/create-graph`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: testPageId, text: testText })
    });

    const data = await createResponse.json();
    
    res.json({
      ...data,
      testMode: true,
      platform: 'vercel',
      firebase: isFirebaseEnabled ? 'enabled' : 'memory-fallback'
    });

  } catch (error) {
    console.error('❌ Quick test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      testMode: true,
      platform: 'vercel'
    });
  }
});

// Export for Vercel
module.exports = app;

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3002;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔥 Firebase: ${isFirebaseEnabled ? 'Enabled' : 'Memory fallback'}`);
    console.log(`📝 Notion: ${NOTION_TOKEN ? 'Configured' : 'Missing'}`);
  });
}