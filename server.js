const express = require('express');
const { Client } = require('@notionhq/client');
const cors = require('cors');

// Firebase Admin SDK
let admin = null;
let db = null;
let isFirebaseEnabled = false;

try {
  admin = require('firebase-admin');
  
  const serviceAccount = {
    "type": "service_account",
    "project_id": "graphfornotion",
    "private_key_id": "NEW_PRIVATE_KEY_ID_HERE",
    "private_key": "-----BEGIN PRIVATE KEY-----\nNEW_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n",
    "client_email": "firebase-adminsdk-fbsvc@graphfornotion.iam.gserviceaccount.com",
    "client_id": "NEW_CLIENT_ID_HERE",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robots/v1/metadata/x509/firebase-adminsdk-fbsvc%40graphfornotion.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com"
  };

  if (serviceAccount.private_key.includes('NEW_PRIVATE_KEY_HERE')) {
    console.log('⚠️ Using placeholder Firebase credentials - Firebase disabled');
    isFirebaseEnabled = false;
  } else {
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

const NOTION_TOKEN = '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';
const GRAPH_BASE_URL = 'https://graphfornotion.web.app/';
const COLLECTION_NAME = 'graph_data';

const notion = new Client({
  auth: NOTION_TOKEN,
});

const graphStorage = new Map();

// ===== LAYOUT CONFIGURATION =====
const LAYOUT_CONFIG = {
  NODE_WIDTH: 200,           
  NODE_HEIGHT: 150,          
  HORIZONTAL_SPACING: 50,    // Gap between consecutive siblings
  VERTICAL_SPACING: 200,     
  CHILDLESS_NODE_OFFSET: 100, 
  CENTER_SINGLE_NODES: true, 
  PRESERVE_HIERARCHY: true   
};

function updateLayoutConfig(newConfig) {
  Object.assign(LAYOUT_CONFIG, newConfig);
  console.log('📐 Layout configuration updated:', LAYOUT_CONFIG);
}

// ===== FIREBASE FUNCTIONS =====
async function saveGraphToFirestore(pageId, graphData) {
  if (!isFirebaseEnabled) {
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
    
    const page = await notion.pages.retrieve({ page_id: notionPageId });
    
    if (!page) {
      throw new Error('Notion page not found or access denied');
    }

    console.log('✅ Page found, appending content...');

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
                content: `Generated: ${new Date().toLocaleString()} | Storage: ${isFirebaseEnabled ? 'Firebase' : 'Memory'} | Layout: Sibling Sorting Applied` 
              },
              annotations: {
                color: 'gray'
              }
            }
          ]
        }
      }
    ];

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
  const TIMEOUT_BUFFER = 50000;

  const checkTimeout = () => {
    if (Date.now() - startTime > TIMEOUT_BUFFER) {
      throw new Error('Operation timed out after 50 seconds');
    }
  };

  try {
    checkTimeout();
    
    const headers = {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-02-22',
      'Content-Type': 'application/json'
    };

    console.log(`🔍 Fetching page children for: ${pageId}`);
    const pageResponse = await fetch(`${baseUrl}/${pageId}/children`, { 
      method: 'GET', 
      headers,
      signal: AbortSignal.timeout(20000)
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

    for (let i = 0; i < calloutBlocks.length; i++) {
      const callout = calloutBlocks[i];
      console.log(`🔍 Checking callout ${i + 1}/${calloutBlocks.length}`);
      
      try {
        const childResponse = await fetch(`${baseUrl}/${callout.id}/children`, { 
          method: 'GET', 
          headers,
          signal: AbortSignal.timeout(15000)
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
  console.log(`📊 Processing block at depth ${depth}`);

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
    case 'heading_1':
      simplified.content = extractContent(block.heading_1?.rich_text);
      break;
    case 'heading_2':
      simplified.content = extractContent(block.heading_2?.rich_text);
      break;
    case 'heading_3':
      simplified.content = extractContent(block.heading_3?.rich_text);
      break;
    case 'to_do':
      simplified.content = extractContent(block.to_do?.rich_text);
      break;
    case 'quote':
      simplified.content = extractContent(block.quote?.rich_text);
      break;
    case 'callout':
      simplified.content = extractContent(block.callout?.rich_text);
      break;
    case 'code':
      simplified.content = extractContent(block.code?.rich_text);
      if (block.code?.language) {
        simplified.language = block.code.language;
      }
      break;
    default:
      simplified.content = `[${block.type}]`;
      break;
  }

  if (block.has_children) {
    try {
      const childResponse = await fetch(`https://api.notion.com/v1/blocks/${block.id}/children`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000)
      });
      
      if (childResponse.ok) {
        const childData = await childResponse.json();
        console.log(`📄 Found ${childData.results.length} children at depth ${depth}`);
        
        simplified.children = await Promise.all(
          childData.results.map(child => simplifyBlockForVercel(child, headers, depth + 1))
        );
        simplified.children = simplified.children.filter(Boolean);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to fetch children for ${block.id} at depth ${depth}: ${error.message}`);
      simplified.hasChildren = true;
    }
  }

  return simplified;
}

// ===== SIBLING SORTING AND REPOSITIONING LAYER =====
// ===== IMPROVED SIBLING SORTING FOR ALL LEVELS INCLUDING CHILDLESS NODES =====
function applySiblingSortingLayer(graphData, config = {}) {
  const {
    NODE_WIDTH = 200,
    NODE_HEIGHT = 150,
    HORIZONTAL_SPACING = 50,
    VERTICAL_SPACING = 200,
    GROUP_SEPARATION = 150  // Gap between different parent groups
  } = config;

  console.log(`🔄 APPLYING IMPROVED SIBLING SORTING LAYER (ALL LEVELS)...`);
  console.log(`📊 Input: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
  
  // Clone the data to avoid mutations
  const nodes = JSON.parse(JSON.stringify(graphData.nodes));
  const edges = [...graphData.edges];
  
  // Build parent-child relationships from edges
  const parentToChildren = new Map();
  const childToParent = new Map();
  
  edges.forEach(edge => {
    const parentId = edge.source;
    const childId = edge.target;
    
    if (!parentToChildren.has(parentId)) {
      parentToChildren.set(parentId, []);
    }
    parentToChildren.get(parentId).push(childId);
    childToParent.set(childId, parentId);
  });
  
  console.log(`🔗 Found ${parentToChildren.size} parents with children`);
  
  // Group nodes by level
  const nodesByLevel = new Map();
  nodes.forEach(node => {
    const level = node.data.depth;
    if (!nodesByLevel.has(level)) {
      nodesByLevel.set(level, []);
    }
    nodesByLevel.get(level).push(node);
  });
  
  const maxLevel = Math.max(...nodesByLevel.keys());
  console.log(`📏 Processing ${maxLevel + 1} levels`);
  
  // **IMPROVED ALGORITHM: Process each level to group ALL siblings (including childless)**
  for (let level = maxLevel; level >= 0; level--) {
    const levelNodes = nodesByLevel.get(level) || [];
    if (levelNodes.length === 0) continue;
    
    console.log(`\n🔄 LEVEL ${level}: Processing ${levelNodes.length} nodes (INCLUDING CHILDLESS)`);
    
    // **CRITICAL FIX: Group ALL nodes by their parent (including childless ones)**
    const nodesByParent = new Map();
    const rootNodes = []; // Nodes with no parent (level 0)
    
    levelNodes.forEach(node => {
      const parentId = childToParent.get(node.id);
      if (parentId) {
        // This node has a parent - group with siblings
        if (!nodesByParent.has(parentId)) {
          nodesByParent.set(parentId, []);
        }
        nodesByParent.get(parentId).push(node);
        console.log(`👥 Node ${node.id} grouped under parent ${parentId}`);
      } else {
        // This node has no parent (root level)
        rootNodes.push(node);
        console.log(`🌳 Root node ${node.id} (no parent)`);
      }
    });
    
    console.log(`👥 Level ${level}: ${nodesByParent.size} parent groups, ${rootNodes.length} root nodes`);
    
    // **STEP 1: Sort siblings within each parent group (INCLUDING CHILDLESS)**
    nodesByParent.forEach((siblings, parentId) => {
      // Sort siblings by their current X position to maintain relative order
      siblings.sort((a, b) => a.position.x - b.position.x);
      
      // Log what we're grouping
      const hasChildren = siblings.filter(s => parentToChildren.has(s.id));
      const noChildren = siblings.filter(s => !parentToChildren.has(s.id));
      
      console.log(`📋 Parent ${parentId}: ${siblings.length} total siblings`);
      console.log(`   - ${hasChildren.length} with children: ${hasChildren.map(s => s.id).join(', ')}`);
      console.log(`   - ${noChildren.length} childless: ${noChildren.map(s => s.id).join(', ')}`);
    });
    
    // **STEP 2: Position sibling groups consecutively**
    const parentGroups = Array.from(nodesByParent.entries());
    let currentX = 0;
    
    // Calculate total width needed for all groups
    let totalWidth = 0;
    parentGroups.forEach(([parentId, siblings]) => {
      const groupWidth = (siblings.length - 1) * (NODE_WIDTH + HORIZONTAL_SPACING) + NODE_WIDTH;
      totalWidth += groupWidth;
    });
    
    // Add space for root nodes
    if (rootNodes.length > 0) {
      const rootWidth = (rootNodes.length - 1) * (NODE_WIDTH + HORIZONTAL_SPACING) + NODE_WIDTH;
      totalWidth += rootWidth;
      if (parentGroups.length > 0) totalWidth += GROUP_SEPARATION;
    }
    
    // Add separations between groups
    if (parentGroups.length > 1) {
      totalWidth += (parentGroups.length - 1) * GROUP_SEPARATION;
    }
    
    // Start from center
    currentX = -totalWidth / 2;
    
    console.log(`📐 Total width needed: ${totalWidth}, starting at X=${currentX}`);
    
    // **Position each parent's siblings consecutively (ALL siblings, including childless)**
    parentGroups.forEach(([parentId, siblings], groupIndex) => {
      console.log(`🎯 Positioning parent ${parentId}'s ${siblings.length} siblings (ALL types) starting at X=${currentX}`);
      
      // Position ALL siblings consecutively (childless and with children together)
      siblings.forEach((sibling, siblingIndex) => {
        const newX = currentX + (siblingIndex * (NODE_WIDTH + HORIZONTAL_SPACING));
        const newY = level * VERTICAL_SPACING;
        
        const hasChildren = parentToChildren.has(sibling.id);
        const childType = hasChildren ? 'WITH_CHILDREN' : 'CHILDLESS';
        
        console.log(`  📍 ${childType} Sibling ${sibling.id}: (${sibling.position.x}, ${sibling.position.y}) → (${newX}, ${newY})`);
        
        sibling.position = { x: newX, y: newY };
      });
      
      // Move to next group
      const groupWidth = (siblings.length - 1) * (NODE_WIDTH + HORIZONTAL_SPACING) + NODE_WIDTH;
      currentX += groupWidth + GROUP_SEPARATION;
      
      console.log(`✅ Parent ${parentId} group positioned (${siblings.length} siblings), next group starts at X=${currentX}`);
    });
    
    // **Position root nodes (level 0) at the end**
    if (rootNodes.length > 0) {
      console.log(`🌳 Positioning ${rootNodes.length} root nodes starting at X=${currentX}`);
      
      rootNodes.forEach((node, index) => {
        const newX = currentX + (index * (NODE_WIDTH + HORIZONTAL_SPACING));
        const newY = level * VERTICAL_SPACING;
        
        console.log(`🌳 Root node ${node.id}: (${node.position.x}, ${node.position.y}) → (${newX}, ${newY})`);
        
        node.position = { x: newX, y: newY };
      });
    }
  }
  
  // **STEP 3: Re-center parents over their newly positioned children**
  console.log(`\n👨‍👩‍👧‍👦 RE-CENTERING PARENTS OVER REPOSITIONED CHILDREN...`);
  
  for (let level = maxLevel - 1; level >= 0; level--) {
    const levelNodes = nodesByLevel.get(level) || [];
    
    levelNodes.forEach(parent => {
      const childIds = parentToChildren.get(parent.id) || [];
      if (childIds.length === 0) {
        console.log(`🔸 Parent ${parent.id} has no children - keeping current position`);
        return;
      }
      
      // Find children's new positions
      const childNodes = childIds.map(childId => nodes.find(n => n.id === childId)).filter(Boolean);
      const childXPositions = childNodes.map(child => child.position.x);
      
      if (childXPositions.length > 0) {
        const leftmost = Math.min(...childXPositions);
        const rightmost = Math.max(...childXPositions);
        const centerX = (leftmost + rightmost) / 2;
        const parentY = level * VERTICAL_SPACING;
        
        console.log(`👨‍👩‍👧‍👦 Parent ${parent.id}: (${parent.position.x}, ${parent.position.y}) → (${centerX}, ${parentY})`);
        console.log(`    Children span: ${leftmost} to ${rightmost} (${childXPositions.length} children)`);
        
        parent.position = { x: centerX, y: parentY };
      }
    });
  }
  
  // **STEP 4: Enhanced verification logging**
  console.log(`\n🔍 COMPREHENSIVE SIBLING GROUPING VERIFICATION:`);
  console.log(`===============================================`);
  
  for (let level = maxLevel; level >= 0; level--) {
    const levelNodes = nodesByLevel.get(level) || [];
    if (levelNodes.length === 0) continue;
    
    console.log(`\n📊 LEVEL ${level} VERIFICATION:`);
    
    // Group by parent for verification
    const verificationGroups = new Map();
    const verificationRoots = [];
    
    levelNodes.forEach(node => {
      const parentId = childToParent.get(node.id);
      if (parentId) {
        if (!verificationGroups.has(parentId)) {
          verificationGroups.set(parentId, []);
        }
        verificationGroups.get(parentId).push(node);
      } else {
        verificationRoots.push(node);
      }
    });
    
    // Verify each parent group
    verificationGroups.forEach((siblings, parentId) => {
      const sortedSiblings = siblings.sort((a, b) => a.position.x - b.position.x);
      const positions = sortedSiblings.map(s => ({ id: s.id, x: s.position.x, hasChildren: parentToChildren.has(s.id) }));
      
      console.log(`👨‍👩‍👧‍👦 Parent ${parentId} - ${siblings.length} siblings:`);
      console.log(`    ${positions.map(p => `${p.id}(${p.x})${p.hasChildren ? '[+]' : '[-]'}`).join(', ')}`);
      
      // Check if consecutive
      let isConsecutive = true;
      let gaps = [];
      for (let i = 1; i < positions.length; i++) {
        const expectedGap = NODE_WIDTH + HORIZONTAL_SPACING;
        const actualGap = positions[i].x - positions[i-1].x;
        gaps.push(actualGap);
        if (Math.abs(actualGap - expectedGap) > 1) {
          isConsecutive = false;
        }
      }
      
      console.log(`    Gaps: ${gaps.join(', ')} (expected: ${NODE_WIDTH + HORIZONTAL_SPACING})`);
      console.log(`    Status: ${isConsecutive ? '✅ CONSECUTIVE' : '❌ NOT CONSECUTIVE'}`);
    });
    
    // Verify root nodes
    if (verificationRoots.length > 0) {
      const positions = verificationRoots.map(n => ({ id: n.id, x: n.position.x }));
      console.log(`🌳 Root nodes: ${positions.map(p => `${p.id}(${p.x})`).join(', ')}`);
    }
  }
  
  console.log(`\n✅ IMPROVED SIBLING SORTING LAYER COMPLETED`);
  console.log(`   - ALL siblings (including childless) are now grouped with their siblings`);
  console.log(`   - No more overlapping between different parent groups`);
  
  return {
    nodes,
    edges,
    metadata: {
      ...graphData.metadata,
      siblingSortingApplied: true,
      improvedSortingApplied: true,
      sortingConfig: {
        NODE_WIDTH,
        NODE_HEIGHT,
        HORIZONTAL_SPACING,
        GROUP_SEPARATION
      },
      algorithm: 'improved-sibling-grouping-all-levels'
    }
  };
}

// ===== LAYOUT TRANSFORMATION WITH SIBLING SORTING =====
function transformToggleToReactFlow(toggleStructureJson, customConfig = {}) {
  const config = { ...LAYOUT_CONFIG, ...customConfig };
  
  const {
    NODE_WIDTH,
    NODE_HEIGHT,
    HORIZONTAL_SPACING,
    VERTICAL_SPACING,
    CHILDLESS_NODE_OFFSET,
    CENTER_SINGLE_NODES,
    PRESERVE_HIERARCHY
  } = config;

  console.log(`🔧 Using layout configuration:`, config);
  
  const toggleStructure = JSON.parse(toggleStructureJson);
  const nodes = [];
  const edges = [];
  let nodeIdCounter = 1;

  const nodeRelationships = new Map();
  const allNodes = new Map();
  const nodesByLevel = new Map();
  
  function isBusinessECP(content) {
    return content.includes('Business ECP:');
  }
  
  function isBusinessTool(content) {
    return /Business\s*Tool/i.test(content);
  }
  
  function isCondition(content) {
    return /[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition/.test(content);
  }
  
  function isPolicy(content) {
    return /←\s*Policy\s*:/.test(content);
  }
  
  function isEvent(content) {
    return /←\s*Event/.test(content);
  }
  
  function isJsonCode(content) {
    return /←\s*JSON\s*Code/.test(content);
  }
  
  function extractTitle(content, type) {
    let title = content;
    
    if (type === 'businessECP') {
      title = content.replace(/Business ECP:\s*\(?\s*→?\s*/, '').replace(/\s*←?\s*\)?\s*.*$/, '').trim();
      if (!title || title.includes('Type')) title = 'ECP Name';
    } else if (type === 'businessTool') {
      title = content.replace(/Business\s*Tool\s*:?\s*/i, '').trim();
      if (!title) title = 'Tool';
    } else if (type === 'condition') {
      const match = content.match(/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition\s*\(→\s*(.+?)\s*←\)/);
      if (match) {
        title = match[1].trim();
      } else {
        const match2 = content.match(/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition\s+(.+)/);
        if (match2) title = match2[1].trim();
      }
    } else if (type === 'policy') {
      const match = content.match(/←\s*Policy\s*:\s*\(→\s*(.+?)\s*←\)/);
      if (match) {
        title = match[1].trim();
        if (title.includes('Type your Policy Name Here')) title = 'Policy (Template)';
      } else {
        const match2 = content.match(/←\s*Policy\s*:\s*(.+)/);
        if (match2) {
          title = match2[1].trim().replace(/^\(→\s*/, '').replace(/\s*←\)$/, '');
          if (!title || title === "Type your Policy Name Here") title = 'Policy (Empty)';
        } else {
          title = 'Policy (No Title)';
        }
      }
    } else if (type === 'event') {
      if (content.match(/^\s*←\s*Event\s*$/)) {
        title = 'Event (No Title)';
      } else {
        const match = content.match(/←\s*Event\s+(.+)/);
        if (match) title = match[1].trim();
        else title = 'Event (Unknown)';
      }
    } else if (type === 'jsonCode') {
      const match = content.match(/←\s*JSON\s*Code\s*(.*)/);
      if (match) {
        const codeTitle = match[1].trim() || 'Required';
        title = `JSON Code ${codeTitle}`;
      } else {
        title = 'JSON Code';
      }
    }
    
    return title.substring(0, 50) + (title.length > 50 ? '...' : '');
  }
  
  function createNode(block, parentId = null, level = 0) {
    if (!block.content || 
        block.content.trim() === '' || 
        block.content === '—' || 
        block.content === '[divider]' ||
        block.type === 'divider' ||
        block.type === 'unsupported') {
      
      if (block.children && Array.isArray(block.children)) {
        for (const child of block.children) {
          createNode(child, parentId, level);
        }
      }
      return null;
    }
    
    const content = block.content.trim();
    let nodeType = null;
    
    if (level === 0 && isBusinessECP(content)) {
      nodeType = 'businessECP';
    } else if (level === 0 && isBusinessTool(content)) {
      nodeType = 'businessTool';
    } else if (isCondition(content)) {
      nodeType = 'condition';
    } else if (isPolicy(content)) {
      nodeType = 'policy';
    } else if (isEvent(content)) {
      nodeType = 'event';
    } else if (isJsonCode(content)) {
      nodeType = 'jsonCode';
    }
    
    if (!nodeType) {
      if (block.children && Array.isArray(block.children)) {
        for (const child of block.children) {
          createNode(child, parentId, level);
        }
      }
      return null;
    }
    
    const nodeId = String(nodeIdCounter++);
    const title = extractTitle(content, nodeType);
    
    const nodeData = {
      id: nodeId,
      label: title,
      originalContent: content,
      cleanedContent: title,
      blockType: block.type,
      nodeType: nodeType,
      depth: level,
      parentId: parentId,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      hasChildren: false
    };
    
    allNodes.set(nodeId, nodeData);
    
    if (!nodesByLevel.has(level)) {
      nodesByLevel.set(level, []);
    }
    nodesByLevel.get(level).push(nodeData);
    
    if (parentId) {
      if (!nodeRelationships.has(parentId)) {
        nodeRelationships.set(parentId, []);
      }
      nodeRelationships.get(parentId).push(nodeId);
      
      const parentNode = allNodes.get(parentId);
      if (parentNode) {
        parentNode.hasChildren = true;
      }
      
      edges.push({
        id: `e${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: 'smoothstep',
        style: { stroke: 'black', strokeWidth: 2 },
        markerEnd: { type: 'arrowclosed', color: 'black', width: 20, height: 20 }
      });
    }
    
    console.log(`✅ Created ${nodeType} node: ${title}`);
    
    if (block.children && Array.isArray(block.children)) {
      for (const child of block.children) {
        createNode(child, nodeId, level + 1);
      }
    }
    
    return nodeId;
  }
  
  console.log(`🚀 Starting layout transformation...`);
  
  createNode(toggleStructure.toggleBlock);
  
  console.log(`📊 Created ${allNodes.size} nodes and ${edges.length} edges`);
  
  // Basic layout algorithm (will be fixed by sibling sorting layer)
  const maxLevel = Math.max(...nodesByLevel.keys());
  console.log(`📏 Processing ${maxLevel + 1} levels`);
  
  // Position nodes level by level
  for (let level = maxLevel; level >= 0; level--) {
    const levelNodes = nodesByLevel.get(level) || [];
    const y = level * VERTICAL_SPACING;
    
    if (levelNodes.length === 0) continue;
    
    console.log(`🔄 Level ${level}: ${levelNodes.length} nodes`);
    
    // Simple horizontal positioning (will be reorganized by sibling sorting)
    const totalWidth = (levelNodes.length - 1) * (NODE_WIDTH + HORIZONTAL_SPACING);
    let startX = -totalWidth / 2;
    
    levelNodes.forEach((nodeData, index) => {
      const x = startX + (index * (NODE_WIDTH + HORIZONTAL_SPACING));
      nodeData.position = { x, y };
      console.log(`📍 Node ${nodeData.id}: (${x}, ${y})`);
    });
  }
  
  // Convert to React Flow format
  allNodes.forEach((nodeData) => {
    const node = {
      id: nodeData.id,
      position: nodeData.position,
      data: {
        label: nodeData.label,
        originalContent: nodeData.originalContent,
        cleanedContent: nodeData.cleanedContent,
        blockType: nodeData.blockType,
        nodeType: nodeData.nodeType,
        depth: nodeData.depth,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        hasChildren: nodeData.hasChildren
      },
      type: 'custom',
      style: {
        width: NODE_WIDTH,
        height: NODE_HEIGHT
      }
    };
    
    nodes.push(node);
  });
  
  const nodeTypes = {
    businessTool: nodes.filter(n => n.data.nodeType === 'businessTool').length,
    businessECP: nodes.filter(n => n.data.nodeType === 'businessECP').length,
    conditions: nodes.filter(n => n.data.nodeType === 'condition').length,
    events: nodes.filter(n => n.data.nodeType === 'event').length,
    policies: nodes.filter(n => n.data.nodeType === 'policy').length,
    jsonCode: nodes.filter(n => n.data.nodeType === 'jsonCode').length,
    other: nodes.filter(n => !['businessTool', 'businessECP', 'condition', 'event', 'policy', 'jsonCode'].includes(n.data.nodeType)).length
  };
  
  // **APPLY SIBLING SORTING LAYER**
  console.log(`\n🚀 APPLYING SIBLING SORTING POST-PROCESSING...`);
  
  const initialGraphData = {
    nodes,
    edges,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      maxDepth: nodes.length > 0 ? Math.max(...nodes.map(n => n.data.depth)) : 0,
      sourceMetadata: toggleStructure.metadata,
      nodeTypes: nodeTypes,
      layout: {
        ...config,
        type: 'consecutiveSiblingsWithSorting',
        algorithm: 'post-processing-sibling-grouping'
      }
    }
  };
  
  const finalGraphData = applySiblingSortingLayer(initialGraphData, {
    NODE_WIDTH: config.NODE_WIDTH || 200,
    NODE_HEIGHT: config.NODE_HEIGHT || 150,
    HORIZONTAL_SPACING: config.HORIZONTAL_SPACING || 50,
    VERTICAL_SPACING: config.VERTICAL_SPACING || 200,
    GROUP_SEPARATION: 150 // Moderate gap between parent groups
  });
  
  return finalGraphData;
}

// ===== API ROUTES =====

app.get('/', (req, res) => {
  res.json({
    message: 'Notion Graph Service - Sibling Sorting Applied',
    status: 'running',
    timestamp: new Date().toISOString(),
    firebase: isFirebaseEnabled ? 'enabled' : 'disabled',
    notion: NOTION_TOKEN ? 'configured' : 'missing',
    supportedTypes: ['Business ECP', 'Business Tool', 'Conditions', 'Policies', 'Events', 'JSON Code'],
    layoutConfig: LAYOUT_CONFIG,
    layoutAlgorithm: 'sibling-sorting-post-processing',
    endpoints: [
      'GET /health',
      'POST /api/create-graph',
      'POST /api/create-business-tool-graph',
      'GET /api/graph-data/:pageId',
      'POST /api/update-layout-config',
      'GET /api/layout-config'
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    platform: 'vercel',
    firebase: isFirebaseEnabled ? 'connected' : 'memory-fallback',
    notion: NOTION_TOKEN ? 'configured' : 'missing',
    storage: isFirebaseEnabled ? 'firestore' : 'memory',
    memoryGraphs: graphStorage.size,
    supportedGraphTypes: ['businessECP', 'businessTool'],
    layoutConfig: LAYOUT_CONFIG,
    layoutAlgorithm: 'sibling-sorting-post-processing'
  });
});

app.post('/api/update-layout-config', (req, res) => {
  try {
    const { horizontalSpacing, verticalSpacing, nodeWidth, nodeHeight, childlessNodeOffset } = req.body;
    
    const newConfig = {};
    if (horizontalSpacing !== undefined) newConfig.HORIZONTAL_SPACING = horizontalSpacing;
    if (verticalSpacing !== undefined) newConfig.VERTICAL_SPACING = verticalSpacing;
    if (nodeWidth !== undefined) newConfig.NODE_WIDTH = nodeWidth;
    if (nodeHeight !== undefined) newConfig.NODE_HEIGHT = nodeHeight;
    if (childlessNodeOffset !== undefined) newConfig.CHILDLESS_NODE_OFFSET = childlessNodeOffset;
    
    updateLayoutConfig(newConfig);
    
    res.json({
      success: true,
      message: 'Layout configuration updated successfully',
      currentConfig: LAYOUT_CONFIG,
      algorithm: 'sibling-sorting-post-processing'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/layout-config', (req, res) => {
  res.json({
    success: true,
    config: LAYOUT_CONFIG,
    algorithm: 'sibling-sorting-post-processing'
  });
});

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

app.post('/api/create-graph', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { pageId, text, layoutConfig } = req.body;

    if (!pageId || !text) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: pageId and text'
      });
    }

    console.log(`🏢 Creating Business ECP graph with sibling sorting for page ${pageId} with text "${text}"`);

    const toggleStructure = await fetchToggleBlockStructure({ pageId, text });
    console.log(`✅ Toggle structure extracted in ${Date.now() - startTime}ms`);
    
    const graphData = transformToggleToReactFlow(toggleStructure.result, layoutConfig);
    console.log(`✅ Graph transformed with sibling sorting: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
    
    const cleanedGraphData = sanitizeGraphData(graphData);

    const uniquePageId = `ecp-${pageId}-${Date.now()}`;
    await saveGraphToFirestore(uniquePageId, cleanedGraphData);
    console.log(`✅ Graph stored with ID: ${uniquePageId}`);

    const graphUrl = generateGraphUrl(uniquePageId);
    console.log(`🔗 Generated graph URL: ${graphUrl}`);

    try {
      const graphTitle = `🏢 Business ECP: ${text}`;
      const appendResult = await appendGraphToNotionPage(pageId, graphUrl, graphTitle);
      console.log(`✅ Graph successfully added to Notion page`);
      
      res.json({
        success: true,
        graphUrl: graphUrl,
        graphId: uniquePageId,
        graphType: 'businessECP',
        stats: {
          nodes: cleanedGraphData.nodes.length,
          edges: cleanedGraphData.edges.length,
          nodeTypes: cleanedGraphData.metadata.nodeTypes,
          storage: isFirebaseEnabled ? 'firebase' : 'memory',
          processingTimeMs: Date.now() - startTime,
          layoutConfig: cleanedGraphData.metadata.layout,
          algorithm: 'sibling-sorting-post-processing',
          siblingSortingApplied: cleanedGraphData.metadata.siblingSortingApplied
        },
        notionResult: appendResult,
        message: `✅ Business ECP graph created with sibling sorting! ${isFirebaseEnabled ? 'Stored in Firebase.' : 'Stored in memory.'}`
      });
      
    } catch (notionError) {
      console.error('❌ Failed to add graph to Notion page:', notionError);
      
      res.json({
        success: true,
        graphUrl: graphUrl,
        graphId: uniquePageId,
        graphType: 'businessECP',
        stats: {
          nodes: cleanedGraphData.nodes.length,
          edges: cleanedGraphData.edges.length,
          nodeTypes: cleanedGraphData.metadata.nodeTypes,
          storage: isFirebaseEnabled ? 'firebase' : 'memory',
          processingTimeMs: Date.now() - startTime,
          layoutConfig: cleanedGraphData.metadata.layout,
          algorithm: 'sibling-sorting-post-processing',
          siblingSortingApplied: cleanedGraphData.metadata.siblingSortingApplied
        },
        warning: `Graph created but failed to add to Notion page: ${notionError.message}`,
        message: `⚠️ Business ECP graph created with sibling sorting but couldn't add to Notion page.`
      });
    }

  } catch (error) {
    console.error('❌ Error creating Business ECP graph:', error);
    
    let errorMessage = error.message;
    if (error.message.includes('No toggle')) {
      errorMessage = `No toggle block found containing "${req.body?.text || 'N/A'}" inside any callout block`;
    } else if (error.message.includes('No callout')) {
      errorMessage = 'No callout blocks found in the page. Toggle blocks must be inside callout blocks.';
    } else if (error.message.includes('timed out')) {
      errorMessage = 'Request timed out - the toggle structure is too complex';
    } else if (error.message.includes('Failed to fetch page')) {
      errorMessage = 'Could not access the Notion page. Check the page ID and permissions.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      graphType: 'businessECP',
      platform: 'vercel',
      processingTimeMs: Date.now() - startTime
    });
  }
});

app.post('/api/create-business-tool-graph', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { pageId, text = 'Business Tool', layoutConfig } = req.body;

    if (!pageId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: pageId'
      });
    }

    console.log(`🛠️ Creating Business Tool graph with sibling sorting for page ${pageId} with text "${text}"`);

    const toggleStructure = await fetchToggleBlockStructure({ pageId, text });
    console.log(`✅ Toggle structure extracted in ${Date.now() - startTime}ms`);
    
    const graphData = transformToggleToReactFlow(toggleStructure.result, layoutConfig);
    console.log(`✅ Graph transformed with sibling sorting: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
    
    const cleanedGraphData = sanitizeGraphData(graphData);

    const uniquePageId = `tool-${pageId}-${Date.now()}`;
    await saveGraphToFirestore(uniquePageId, cleanedGraphData);
    console.log(`✅ Graph stored with ID: ${uniquePageId}`);

    const graphUrl = generateGraphUrl(uniquePageId);
    console.log(`🔗 Generated graph URL: ${graphUrl}`);

    try {
      const graphTitle = `🛠️ Business Tool: ${text}`;
      const appendResult = await appendGraphToNotionPage(pageId, graphUrl, graphTitle);
      console.log(`✅ Graph successfully added to Notion page`);
      
      res.json({
        success: true,
        graphUrl: graphUrl,
        graphId: uniquePageId,
        graphType: 'businessTool',
        stats: {
          nodes: cleanedGraphData.nodes.length,
          edges: cleanedGraphData.edges.length,
          nodeTypes: cleanedGraphData.metadata.nodeTypes,
          storage: isFirebaseEnabled ? 'firebase' : 'memory',
          processingTimeMs: Date.now() - startTime,
          layoutConfig: cleanedGraphData.metadata.layout,
          algorithm: 'sibling-sorting-post-processing',
          siblingSortingApplied: cleanedGraphData.metadata.siblingSortingApplied
        },
        notionResult: appendResult,
        message: `✅ Business Tool graph created with sibling sorting! ${isFirebaseEnabled ? 'Stored in Firebase.' : 'Stored in memory.'}`
      });
      
    } catch (notionError) {
      console.error('❌ Failed to add graph to Notion page:', notionError);
      
      res.json({
        success: true,
        graphUrl: graphUrl,
        graphId: uniquePageId,
        graphType: 'businessTool',
        stats: {
          nodes: cleanedGraphData.nodes.length,
          edges: cleanedGraphData.edges.length,
          nodeTypes: cleanedGraphData.metadata.nodeTypes,
          storage: isFirebaseEnabled ? 'firebase' : 'memory',
          processingTimeMs: Date.now() - startTime,
          layoutConfig: cleanedGraphData.metadata.layout,
          algorithm: 'sibling-sorting-post-processing',
          siblingSortingApplied: cleanedGraphData.metadata.siblingSortingApplied
        },
        warning: `Graph created but failed to add to Notion page: ${notionError.message}`,
        message: `⚠️ Business Tool graph created with sibling sorting but couldn't add to Notion page.`
      });
    }

  } catch (error) {
    console.error('❌ Error creating Business Tool graph:', error);
    
    let errorMessage = error.message;
    if (error.message.includes('No toggle')) {
      errorMessage = `No toggle block found containing "${req.body?.text || 'Business Tool'}" inside any callout block`;
    } else if (error.message.includes('No callout')) {
      errorMessage = 'No callout blocks found in the page. Toggle blocks must be inside callout blocks.';
    } else if (error.message.includes('timed out')) {
      errorMessage = 'Request timed out - the toggle structure is too complex';
    } else if (error.message.includes('Failed to fetch page')) {
      errorMessage = 'Could not access the Notion page. Check the page ID and permissions.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      graphType: 'businessTool',
      platform: 'vercel',
      processingTimeMs: Date.now() - startTime
    });
  }
});

app.post('/api/quick-test', async (req, res) => {
  try {
    const testPageId = '2117432eb8438055a473fc7198dc3fdc';
    const testText = 'Business Tool';
    
    console.log('🧪 Running quick test with sibling sorting...');
    
    const createResponse = await fetch(`${req.protocol}://${req.get('host')}/api/create-business-tool-graph`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: testPageId, text: testText })
    });

    const data = await createResponse.json();
    
    res.json({
      ...data,
      testMode: true,
      testType: 'businessTool',
      platform: 'vercel',
      firebase: isFirebaseEnabled ? 'enabled' : 'memory-fallback',
      algorithm: 'sibling-sorting-post-processing'
    });

  } catch (error) {
    console.error('❌ Quick test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      testMode: true,
      testType: 'businessTool',
      platform: 'vercel'
    });
  }
});

app.post('/api/graph-structure', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { pageId, text } = req.body;

    if (!pageId || !text) {
      return res.status(400).json({
        error: 'Missing required parameters: pageId and text'
      });
    }

    console.log(`📊 Extracting graph structure for page ${pageId} with text "${text}"`);

    const toggleStructure = await fetchToggleBlockStructure({ pageId, text });
    console.log(`✅ Toggle structure extracted in ${Date.now() - startTime}ms`);
    
    const nodes = [];
    let nodeIdCounter = 1;
    
    function extractStructure(block, parentId = null, level = 0) {
      if (!block.content || block.content.trim() === '' || block.content === '—') {
        if (block.children && Array.isArray(block.children)) {
          for (const child of block.children) {
            extractStructure(child, parentId, level);
          }
        }
        return null;
      }
      
      const content = block.content.trim();
      let nodeType = null;
      
      if (level === 0 && content.includes('Business ECP:')) {
        nodeType = 'businessECP';
      } else if (level === 0 && /Business\s*Tool/i.test(content)) {
        nodeType = 'businessTool';
      } else if (/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition/.test(content)) {
        nodeType = 'condition';
      } else if (/←\s*Policy\s*:/.test(content)) {
        nodeType = 'policy';
      } else if (/←\s*Event/.test(content)) {
        nodeType = 'event';
      } else if (/←\s*JSON\s*Code/.test(content)) {
        nodeType = 'jsonCode';
      }
      
      if (nodeType) {
        const nodeData = {
          id: String(nodeIdCounter++),
          type: nodeType,
          title: content,
          level: level,
          parentId: parentId,
          notionBlockId: block.id
        };
        
        if (nodeType === 'policy' && block.children && Array.isArray(block.children)) {
          const policyContentBlocks = [];
          
          for (const child of block.children) {
            if (child.content && child.content.trim() !== '' && child.content !== '—') {
              const childContent = child.content.trim();
              
              if (!/←\s*Policy\s*:/.test(childContent) && 
                  !/←\s*Event/.test(childContent) &&
                  !/←\s*JSON\s*Code/.test(childContent) &&
                  !/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition/.test(childContent)) {
                
                policyContentBlocks.push(childContent);
                
                if (child.children && Array.isArray(child.children)) {
                  const collectNestedContent = (nestedBlock) => {
                    if (nestedBlock.content && nestedBlock.content.trim() !== '' && nestedBlock.content !== '—') {
                      const nestedContent = nestedBlock.content.trim();
                      if (!/←\s*Policy\s*:/.test(nestedContent) && 
                          !/←\s*Event/.test(nestedContent) &&
                          !/←\s*JSON\s*Code/.test(nestedContent) &&
                          !/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition/.test(nestedContent)) {
                        policyContentBlocks.push(nestedContent);
                      }
                    }
                    if (nestedBlock.children && Array.isArray(nestedBlock.children)) {
                      nestedBlock.children.forEach(collectNestedContent);
                    }
                  };
                  child.children.forEach(collectNestedContent);
                }
              }
            }
          }
          
          if (policyContentBlocks.length > 0) {
            nodeData.policyContent = policyContentBlocks.join('\n\n');
          }
        }
        
        nodes.push(nodeData);
        
        if (block.children && Array.isArray(block.children)) {
          for (const child of block.children) {
            extractStructure(child, nodeData.id, level + 1);
          }
        }
        
        return nodeData.id;
      } else {
        if (block.children && Array.isArray(block.children)) {
          for (const child of block.children) {
            extractStructure(child, parentId, level);
          }
        }
        return null;
      }
    }
    
    const parsedStructure = JSON.parse(toggleStructure.result);
    extractStructure(parsedStructure.toggleBlock);
    
    console.log(`✅ Simplified structure created: ${nodes.length} nodes`);

    res.json({
      results: nodes,
      resultsJson: JSON.stringify(nodes, null, 2),
      algorithm: 'sibling-sorting-post-processing'
    });

  } catch (error) {
    console.error('❌ Error extracting graph structure:', error);
    
    let errorMessage = error.message;
    if (error.message.includes('No toggle')) {
      errorMessage = `No toggle block found containing "${req.body?.text || 'N/A'}" inside any callout block`;
    } else if (error.message.includes('No callout')) {
      errorMessage = 'No callout blocks found in the page. Toggle blocks must be inside callout blocks.';
    }

    res.status(500).json({
      error: errorMessage
    });
  }
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3002;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔥 Firebase: ${isFirebaseEnabled ? 'Enabled' : 'Memory fallback'}`);
    console.log(`📝 Notion: ${NOTION_TOKEN ? 'Configured' : 'Missing'}`);
    console.log(`🏢 Business ECP support: Enabled`);
    console.log(`🛠️ Business Tool support: Enabled`);
    console.log(`📊 Graph structure extraction: Enabled`);
    console.log(`🎯 Sibling sorting post-processing: Active`);
    console.log(`📐 Default layout config:`, LAYOUT_CONFIG);
    console.log(`🔧 Algorithm: sibling-sorting-post-processing`);
  });
}