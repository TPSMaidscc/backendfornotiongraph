
const express = require('express');
const { Client } = require('@notionhq/client');
const cors = require('cors');
const OpenAI = require('openai');

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

// OpenAI Configuration
let openai = null;
let isOpenAIEnabled = false;

try {
  const OPENAI_API_KEY = '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';
  
  if (OPENAI_API_KEY && OPENAI_API_KEY !== 'YOUR_OPENAI_API_KEY_HERE') {
    openai = new OpenAI({
      apiKey: OPENAI_API_KEY
    });
    isOpenAIEnabled = true;
    console.log('🤖 OpenAI initialized successfully');
  } else {
    console.log('⚠️ OpenAI API key not configured - using fallback summaries');
    isOpenAIEnabled = false;
  }
} catch (error) {
  console.error('❌ OpenAI initialization failed:', error.message);
  isOpenAIEnabled = false;
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
  HORIZONTAL_SPACING: 50,    
  VERTICAL_SPACING: 200,     
  CHILDLESS_NODE_OFFSET: 100, 
  CENTER_SINGLE_NODES: true, 
  PRESERVE_HIERARCHY: true   
};

function updateLayoutConfig(newConfig) {
  Object.assign(LAYOUT_CONFIG, newConfig);
  console.log('📐 Layout configuration updated:', LAYOUT_CONFIG);
}

// ===== OPENAI FUNCTIONS =====
async function generateSmartSummary(content, nodeType) {
  if (!isOpenAIEnabled) {
    console.log('⚠️ OpenAI not available, using fallback summary');
    return generateFallbackSummary(content, nodeType);
  }

  try {
    console.log(`🤖 Generating OpenAI summary for ${nodeType}: "${content.substring(0, 200)}..."`);
    
    const prompt = nodeType === 'policy' 
    ? `"Summarize the policy into exactly 1-6  words that capture the main action or rule. Focus on the key instruction or outcome. Use simple, clear language.
      1-6-word title:"
      **Example using your policy:**
      Policy: Explain to the customer that since the monthly bank payment forms are approved and the current month payment will be deducted within 24 hours, the customer can reach us after the 24 hours have passed to switch the customer to paying via credit card only when the customer asks to switch from paying via direct debit to credit card.
      4-word title: **"Wait 24hrs Switch Payment"**`
    : `"Summarize this event or process into 1-6 words that capture the main action being performed. Focus on what is being done or accomplished. Use active, clear language.
      Event/Process: [paste event description here]
      1-6-word title:"
      **Example using your event**
      Event: Refer to the Jira below for details to how it was supposed to be implemented.

      Steps:
      Add the refund related to the customer's contract ID
      Purpose should be: "Taxi reimbursement"
      Amount: Amount the bot agreed on with the customer
      Method of payment will then be automatically filled by the system

      Add the receipt
      Send the refund confirmation statement to the customer.

      1-6-word title: "Process Taxi Refund Request"
       `;    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: prompt
        },
        {
          role: "user",
          content: content
        }
      ],
      max_tokens: 15,
      temperature: 0.1
    });

    let summary = completion.choices[0]?.message?.content?.trim();
    
    if (!summary || summary.length === 0) {
      console.log('❌ OpenAI returned empty response, using fallback');
      return generateFallbackSummary(content, nodeType);
    }

    // Clean up the summary
    summary = summary.replace(/['"]/g, '').trim();
    
    console.log(`✅ OpenAI summary generated: "${summary}"`);
    return summary;

  } catch (error) {
    console.error('❌ OpenAI summarization failed:', error.message);
    return generateFallbackSummary(content, nodeType);
  }
}

function generateFallbackSummary(content, nodeType) {
  console.log(`🔄 Generating fallback summary for ${nodeType}`);
  
  // Clean the content first
  let cleanContent = content
    .replace(/←\s*Policy\s*:\s*/g, '')
    .replace(/←\s*Event\s*/g, '')
    .replace(/\(→\s*/g, '')
    .replace(/\s*←\)/g, '')
    .trim();

  // Remove common template text
  cleanContent = cleanContent
    .replace(/Type your Policy Name Here/gi, '')
    .replace(/Policy Name/gi, '')
    .replace(/Event Name/gi, '')
    .trim();

  if (!cleanContent || cleanContent.length === 0) {
    return nodeType === 'policy' ? 'Policy Rule' : 'Event Trigger';
  }

  // Extract key words (first 3-5 meaningful words)
  const words = cleanContent
    .split(/\s+/)
    .filter(word => word.length > 2) // Skip very short words
    .filter(word => !/^(the|and|or|but|for|with|by|at|in|on|to|from|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|can)$/i.test(word)) // Skip common words
    .slice(0, 4); // Take first 4 meaningful words

  if (words.length === 0) {
    return nodeType === 'policy' ? 'Policy Rule' : 'Event Trigger';
  }

  const summary = words.join(' ');
  console.log(`✅ Fallback summary generated: "${summary}"`);
  return summary.length > 25 ? summary.substring(0, 22) + '...' : summary;
}

// ===== CONTENT EXTRACTION FOR POLICIES AND EVENTS =====
function extractContentFromBlock(block) {
  console.log(`🔍 Extracting content from block type: ${block.type}`);
  
  if (!block.children || !Array.isArray(block.children)) {
    console.log('⚠️ No children found in block');
    return '';
  }

  const contentParts = [];
  
  function processChild(child) {
    if (!child.content) return;
    
    const content = child.content.trim();
    if (!content || content === '—') return;
    
    // Skip structured elements but collect everything else
    if (!/←\s*Policy\s*:/.test(content) && 
        !/←\s*Event/.test(content) &&
        !/←\s*JSON\s*Code/.test(content) &&
        !/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition/.test(content) &&
        !/Business\s*Tool/i.test(content) &&
        !/Business\s*ECP/i.test(content)) {
      
      console.log(`📝 Adding content: "${content.substring(0, 100)}..."`);
      contentParts.push(content);
    }
    
    // Process nested children
    if (child.children && Array.isArray(child.children)) {
      child.children.forEach(processChild);
    }
  }
  
  block.children.forEach(processChild);
  
  const result = contentParts.join(' ').trim();
  console.log(`✅ Extracted ${contentParts.length} parts, total: ${result.length} characters`);
  return result;
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

// ===== FETCH PAGE TITLE =====
async function fetchNotionPageTitle(pageId) {
  try {
    console.log(`📝 Fetching page title for: ${pageId}`);
    
    const page = await notion.pages.retrieve({ page_id: pageId });
    
    if (!page) {
      throw new Error('Notion page not found or access denied');
    }

    let title = 'Untitled Page';
    
    if (page.properties) {
      const titleProperty = page.properties.title || 
                           page.properties.Title || 
                           page.properties.Name || 
                           page.properties.name ||
                           Object.values(page.properties).find(prop => prop.type === 'title');
      
      if (titleProperty && titleProperty.title && titleProperty.title.length > 0) {
        title = titleProperty.title.map(text => text.plain_text || '').join('');
      }
    }

    if (title === 'Untitled Page' && page.title) {
      title = page.title;
    }

    console.log(`✅ Page title found: "${title}"`);
    return title;
    
  } catch (error) {
    console.error('❌ Error fetching page title:', error);
    return 'Unknown Page';
  }
}

// ===== NOTION INTEGRATION =====
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
                content: `Generated: ${new Date().toLocaleString()} | Storage: ${isFirebaseEnabled ? 'Firebase' : 'Memory'} | OpenAI: ${isOpenAIEnabled ? 'Enabled' : 'Fallback'} | Layout: Sibling Sorting Applied` 
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

// ===== LAYOUT FUNCTIONS =====
function applySiblingSortingLayer(graphData, cfg = {}) {
  const {
    NODE_WIDTH = 200,
    NODE_HEIGHT = 150,
    HORIZONTAL_SPACING = 50,
    VERTICAL_SPACING = 200,
    GROUP_SEPARATION = 150
  } = cfg;

  const nodes = graphData.nodes.map(n => ({ ...n }));
  const edges = [...graphData.edges];

  const idToNode = new Map(nodes.map(n => [n.id, n]));
  const parentToChildren = new Map();
  const childToParent = new Map();

  edges.forEach(({ source, target }) => {
    if (!parentToChildren.has(source)) parentToChildren.set(source, []);
    parentToChildren.get(source).push(target);
    childToParent.set(target, source);
  });

  const subtreeWidth = new Map();

  function measure(id) {
    const children = parentToChildren.get(id) || [];
    if (children.length === 0) {
      subtreeWidth.set(id, NODE_WIDTH);
      return NODE_WIDTH;
    }

    let width = 0;
    children.forEach((c, i) => {
      width += measure(c);
      if (i < children.length - 1) width += HORIZONTAL_SPACING;
    });

    width = Math.max(width, NODE_WIDTH);
    subtreeWidth.set(id, width);
    return width;
  }

  const rootIds = nodes
    .filter(n => !childToParent.has(n.id))
    .map(n => n.id);

  rootIds.forEach(measure);

  function place(id, centreX, level) {
    const node = idToNode.get(id);
    node.position = { x: centreX, y: level * VERTICAL_SPACING };

    const children = parentToChildren.get(id) || [];
    if (children.length === 0) return;

    let span = 0;
    children.forEach((c, i) => {
      span += subtreeWidth.get(c);
      if (i < children.length - 1) span += HORIZONTAL_SPACING;
    });

    let childLeft = centreX - span / 2;

    children.forEach(childId => {
      const childCentre = childLeft + subtreeWidth.get(childId) / 2;
      place(childId, childCentre, level + 1);
      childLeft += subtreeWidth.get(childId) + HORIZONTAL_SPACING;
    });
  }

  let cursorX = 0;
  rootIds.forEach(rid => {
    const centre = cursorX + subtreeWidth.get(rid) / 2;
    place(rid, centre, 0);
    cursorX += subtreeWidth.get(rid) + GROUP_SEPARATION;
  });

  return {
    ...graphData,
    nodes,
    metadata: {
      ...graphData.metadata,
      siblingSortingApplied: true,
      improvedSortingApplied: true,
      algorithm: 'tidy-tree-centred'
    }
  };
}

// ===== MAIN TRANSFORMATION FUNCTION =====
async function transformToggleToReactFlow(toggleStructureJson, customConfig = {}, pageTitle = null) {
  const config = { ...LAYOUT_CONFIG, ...customConfig };
  
  const {
    NODE_WIDTH,
    NODE_HEIGHT,
    HORIZONTAL_SPACING,
    VERTICAL_SPACING
  } = config;

  console.log(`🔧 Using layout configuration:`, config);
  console.log(`📖 Using page title: "${pageTitle}"`);
  console.log(`🤖 OpenAI enabled: ${isOpenAIEnabled}`);
  
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
  
  async function extractTitle(content, type, pageTitle = null, block = null) {
    let title = content;
    
    if (type === 'businessECP') {
      if (pageTitle) {
        title = pageTitle;
        console.log(`✅ Using page title for Business ECP: "${title}"`);
      } else {
        title = content.replace(/Business ECP:\s*\(?\s*→?\s*/, '').replace(/\s*←?\s*\)?\s*.*$/, '').trim();
        if (!title || title.includes('Type')) title = 'ECP Name';
      }
    } else if (type === 'businessTool') {
      if (pageTitle) {
        title = pageTitle;
        console.log(`✅ Using page title for Business Tool: "${title}"`);
      } else {
        title = content.replace(/Business\s*Tool\s*:?\s*/i, '').trim();
        if (!title) title = 'Tool';
      }
    } else if (type === 'condition') {
      const match = content.match(/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition\s*\(→\s*(.+?)\s*←\)/);
      if (match) {
        title = match[1].trim();
      } else {
        const match2 = content.match(/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition\s+(.+)/);
        if (match2) title = match2[1].trim();
      }
    } else if (type === 'policy') {
      console.log(`🤖 Processing policy for smart summary...`);
      
      if (block) {
        const policyContent = extractContentFromBlock(block);
        console.log(`📊 Policy content extracted: "${policyContent.substring(0, 100)}..." (${policyContent.length} chars)`);
        
        if (policyContent && policyContent.trim().length > 10) {
          console.log(`📝 Generating summary for policy content...`);
          title = await generateSmartSummary(policyContent, 'policy');
          console.log(`✅ Policy summary: "${title}"`);
        } else {
          console.log(`⚠️ No meaningful policy content, using fallback`);
          const match = content.match(/←\s*Policy\s*:\s*\(→\s*(.+?)\s*←\)/);
          if (match) {
            title = match[1].trim();
            if (title.includes('Type your Policy Name Here')) title = 'Policy Template';
          } else {
            title = 'Policy Content';
          }
        }
      } else {
        console.log(`⚠️ No block provided for policy`);
        title = 'Policy';
      }
    } else if (type === 'event') {
      console.log(`🤖 Processing event for smart summary...`);
      
      if (block) {
        const eventContent = extractContentFromBlock(block);
        console.log(`📊 Event content extracted: "${eventContent.substring(0, 100)}..." (${eventContent.length} chars)`);
        
        if (eventContent && eventContent.trim().length > 10) {
          console.log(`📝 Generating summary for event content...`);
          title = await generateSmartSummary(eventContent, 'event');
          console.log(`✅ Event summary: "${title}"`);
        } else {
          console.log(`⚠️ No meaningful event content, using fallback`);
          if (content.match(/^\s*←\s*Event\s*$/)) {
            title = 'Event Trigger';
          } else {
            const match = content.match(/←\s*Event\s+(.+)/);
            if (match) title = match[1].trim();
            else title = 'Event Action';
          }
        }
      } else {
        console.log(`⚠️ No block provided for event`);
        title = 'Event';
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
  
  async function createNode(block, parentId = null, level = 0) {
    if (!block.content || 
        block.content.trim() === '' || 
        block.content === '—' || 
        block.content === '[divider]' ||
        block.type === 'divider' ||
        block.type === 'unsupported') {
      
      if (block.children && Array.isArray(block.children)) {
        for (const child of block.children) {
          await createNode(child, parentId, level);
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
          await createNode(child, parentId, level);
        }
      }
      return null;
    }
    
    const nodeId = String(nodeIdCounter++);
    
    // Pass pageTitle only for root level business nodes (level 0)
    const shouldUsePageTitle = level === 0 && (nodeType === 'businessECP' || nodeType === 'businessTool');
    
    // IMPORTANT: Pass the block object for policies and events so we can extract content
    const title = await extractTitle(
      content, 
      nodeType, 
      shouldUsePageTitle ? pageTitle : null,
      (nodeType === 'policy' || nodeType === 'event') ? block : null
    );
    
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
      hasChildren: false,
      aiSummary: (nodeType === 'policy' || nodeType === 'event') // Mark if this used AI summarization
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
    
    console.log(`✅ Created ${nodeType} node: "${title}"`);
    
    if (block.children && Array.isArray(block.children)) {
      for (const child of block.children) {
        await createNode(child, nodeId, level + 1);
      }
    }
    
    return nodeId;
  }
  
  console.log(`🚀 Starting layout transformation...`);
  
  await createNode(toggleStructure.toggleBlock);
  
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
        hasChildren: nodeData.hasChildren,
        aiSummary: nodeData.aiSummary
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
  
  // Count AI summaries
  const aiSummaryCount = nodes.filter(n => n.data.aiSummary).length;
  
  console.log(`🤖 AI summaries generated: ${aiSummaryCount}`);
  
  // Apply sibling sorting layer
  console.log(`🚀 APPLYING SIBLING SORTING POST-PROCESSING...`);
  
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
      },
      pageTitle: pageTitle,
      openAIEnabled: isOpenAIEnabled,
      aiSummaryCount: aiSummaryCount
    }
  };
  
  const finalGraphData = applySiblingSortingLayer(initialGraphData, {
    NODE_WIDTH: config.NODE_WIDTH || 200,
    NODE_HEIGHT: config.NODE_HEIGHT || 150,
    HORIZONTAL_SPACING: config.HORIZONTAL_SPACING || 50,
    VERTICAL_SPACING: config.VERTICAL_SPACING || 200,
    GROUP_SEPARATION: 150
  });
  
  return finalGraphData;
}

// ===== API ROUTES =====

app.get('/', (req, res) => {
  res.json({
    message: 'Notion Graph Service - OpenAI Smart Summaries FIXED',
    status: 'running',
    timestamp: new Date().toISOString(),
    firebase: isFirebaseEnabled ? 'enabled' : 'disabled',
    notion: NOTION_TOKEN ? 'configured' : 'missing',
    openai: isOpenAIEnabled ? 'enabled' : 'fallback',
    supportedTypes: ['Business ECP', 'Business Tool', 'Conditions', 'Policies', 'Events', 'JSON Code'],
    layoutConfig: LAYOUT_CONFIG,
    layoutAlgorithm: 'sibling-sorting-post-processing',
    smartSummaries: isOpenAIEnabled ? 'OpenAI GPT-3.5' : 'Fallback Logic',
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
    openai: isOpenAIEnabled ? 'connected' : 'fallback',
    storage: isFirebaseEnabled ? 'firestore' : 'memory',
    memoryGraphs: graphStorage.size,
    supportedGraphTypes: ['businessECP', 'businessTool'],
    layoutConfig: LAYOUT_CONFIG,
    layoutAlgorithm: 'sibling-sorting-post-processing',
    smartSummaries: isOpenAIEnabled ? 'OpenAI GPT-3.5 Turbo' : 'Rule-based Fallback'
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
      algorithm: 'sibling-sorting-post-processing',
      openai: isOpenAIEnabled ? 'enabled' : 'fallback'
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
    algorithm: 'sibling-sorting-post-processing',
    openai: isOpenAIEnabled ? 'enabled' : 'fallback'
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
        storage: isFirebaseEnabled ? 'firebase' : 'memory',
        openai: isOpenAIEnabled ? 'enabled' : 'fallback'
      });
    }

    res.json({
      success: true,
      pageId,
      storage: graphData.storage || (isFirebaseEnabled ? 'firebase' : 'memory'),
      openai: isOpenAIEnabled ? 'enabled' : 'fallback',
      ...graphData
    });
  } catch (error) {
    console.error('❌ Error serving graph data:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      platform: 'vercel',
      openai: isOpenAIEnabled ? 'enabled' : 'fallback'
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

    console.log(`🏢 Creating Business ECP graph with OpenAI summaries for page ${pageId} with text "${text}"`);
    console.log(`🤖 OpenAI status: ${isOpenAIEnabled ? 'ENABLED' : 'DISABLED'}`);

    const pageTitle = await fetchNotionPageTitle(pageId);
    console.log(`📖 Using page title: "${pageTitle}"`);

    const toggleStructure = await fetchToggleBlockStructure({ pageId, text });
    console.log(`✅ Toggle structure extracted in ${Date.now() - startTime}ms`);
    
    const graphData = await transformToggleToReactFlow(toggleStructure.result, layoutConfig, pageTitle);
    console.log(`✅ Graph transformed: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
    console.log(`🤖 AI summaries created: ${graphData.metadata.aiSummaryCount || 0}`);
    
    const cleanedGraphData = sanitizeGraphData(graphData);

    const uniquePageId = `ecp-${pageId}-${Date.now()}`;
    await saveGraphToFirestore(uniquePageId, cleanedGraphData);
    console.log(`✅ Graph stored with ID: ${uniquePageId}`);

    const graphUrl = generateGraphUrl(uniquePageId);
    console.log(`🔗 Generated graph URL: ${graphUrl}`);

    try {
      const graphTitle = `🏢 Business ECP: ${pageTitle}`;
      const appendResult = await appendGraphToNotionPage(pageId, graphUrl, graphTitle);
      console.log(`✅ Graph successfully added to Notion page`);
      
      res.json({
        success: true,
        graphUrl: graphUrl,
        graphId: uniquePageId,
        graphType: 'businessECP',
        pageTitle: pageTitle,
        stats: {
          nodes: cleanedGraphData.nodes.length,
          edges: cleanedGraphData.edges.length,
          nodeTypes: cleanedGraphData.metadata.nodeTypes,
          storage: isFirebaseEnabled ? 'firebase' : 'memory',
          openai: isOpenAIEnabled ? 'enabled' : 'fallback',
          processingTimeMs: Date.now() - startTime,
          layoutConfig: cleanedGraphData.metadata.layout,
          algorithm: 'sibling-sorting-post-processing',
          siblingSortingApplied: cleanedGraphData.metadata.siblingSortingApplied,
          smartSummariesEnabled: cleanedGraphData.metadata.openAIEnabled,
          aiSummaryCount: cleanedGraphData.metadata.aiSummaryCount || 0
        },
        notionResult: appendResult,
        message: `✅ Business ECP graph created for "${pageTitle}" with ${isOpenAIEnabled ? 'OpenAI' : 'fallback'} summaries! ${cleanedGraphData.metadata.aiSummaryCount || 0} AI summaries generated.`
      });
      
    } catch (notionError) {
      console.error('❌ Failed to add graph to Notion page:', notionError);
      
      res.json({
        success: true,
        graphUrl: graphUrl,
        graphId: uniquePageId,
        graphType: 'businessECP',
        pageTitle: pageTitle,
        stats: {
          nodes: cleanedGraphData.nodes.length,
          edges: cleanedGraphData.edges.length,
          nodeTypes: cleanedGraphData.metadata.nodeTypes,
          storage: isFirebaseEnabled ? 'firebase' : 'memory',
          openai: isOpenAIEnabled ? 'enabled' : 'fallback',
          processingTimeMs: Date.now() - startTime,
          layoutConfig: cleanedGraphData.metadata.layout,
          algorithm: 'sibling-sorting-post-processing',
          siblingSortingApplied: cleanedGraphData.metadata.siblingSortingApplied,
          smartSummariesEnabled: cleanedGraphData.metadata.openAIEnabled,
          aiSummaryCount: cleanedGraphData.metadata.aiSummaryCount || 0
        },
        warning: `Graph created but failed to add to Notion page: ${notionError.message}`,
        message: `⚠️ Business ECP graph created for "${pageTitle}" with ${isOpenAIEnabled ? 'OpenAI' : 'fallback'} summaries but couldn't add to Notion page.`
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
      openai: isOpenAIEnabled ? 'enabled' : 'fallback',
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

    console.log(`🛠️ Creating Business Tool graph with OpenAI summaries for page ${pageId} with text "${text}"`);
    console.log(`🤖 OpenAI status: ${isOpenAIEnabled ? 'ENABLED' : 'DISABLED'}`);

    const pageTitle = await fetchNotionPageTitle(pageId);
    console.log(`📖 Using page title: "${pageTitle}"`);

    const toggleStructure = await fetchToggleBlockStructure({ pageId, text });
    console.log(`✅ Toggle structure extracted in ${Date.now() - startTime}ms`);
    
    const graphData = await transformToggleToReactFlow(toggleStructure.result, layoutConfig, pageTitle);
    console.log(`✅ Graph transformed: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
    console.log(`🤖 AI summaries created: ${graphData.metadata.aiSummaryCount || 0}`);
    
    const cleanedGraphData = sanitizeGraphData(graphData);

    const uniquePageId = `tool-${pageId}-${Date.now()}`;
    await saveGraphToFirestore(uniquePageId, cleanedGraphData);
    console.log(`✅ Graph stored with ID: ${uniquePageId}`);

    const graphUrl = generateGraphUrl(uniquePageId);
    console.log(`🔗 Generated graph URL: ${graphUrl}`);

    try {
      const graphTitle = `🛠️ Business Tool: ${pageTitle}`;
      const appendResult = await appendGraphToNotionPage(pageId, graphUrl, graphTitle);
      console.log(`✅ Graph successfully added to Notion page`);
      
      res.json({
        success: true,
        graphUrl: graphUrl,
        graphId: uniquePageId,
        graphType: 'businessTool',
        pageTitle: pageTitle,
        stats: {
          nodes: cleanedGraphData.nodes.length,
          edges: cleanedGraphData.edges.length,
          nodeTypes: cleanedGraphData.metadata.nodeTypes,
          storage: isFirebaseEnabled ? 'firebase' : 'memory',
          openai: isOpenAIEnabled ? 'enabled' : 'fallback',
          processingTimeMs: Date.now() - startTime,
          layoutConfig: cleanedGraphData.metadata.layout,
          algorithm: 'sibling-sorting-post-processing',
          siblingSortingApplied: cleanedGraphData.metadata.siblingSortingApplied,
          smartSummariesEnabled: cleanedGraphData.metadata.openAIEnabled,
          aiSummaryCount: cleanedGraphData.metadata.aiSummaryCount || 0
        },
        notionResult: appendResult,
        message: `✅ Business Tool graph created for "${pageTitle}" with ${isOpenAIEnabled ? 'OpenAI' : 'fallback'} summaries! ${cleanedGraphData.metadata.aiSummaryCount || 0} AI summaries generated.`
      });
      
    } catch (notionError) {
      console.error('❌ Failed to add graph to Notion page:', notionError);
      
      res.json({
        success: true,
        graphUrl: graphUrl,
        graphId: uniquePageId,
        graphType: 'businessTool',
        pageTitle: pageTitle,
        stats: {
          nodes: cleanedGraphData.nodes.length,
          edges: cleanedGraphData.edges.length,
          nodeTypes: cleanedGraphData.metadata.nodeTypes,
          storage: isFirebaseEnabled ? 'firebase' : 'memory',
          openai: isOpenAIEnabled ? 'enabled' : 'fallback',
          processingTimeMs: Date.now() - startTime,
          layoutConfig: cleanedGraphData.metadata.layout,
          algorithm: 'sibling-sorting-post-processing',
          siblingSortingApplied: cleanedGraphData.metadata.siblingSortingApplied,
          smartSummariesEnabled: cleanedGraphData.metadata.openAIEnabled,
          aiSummaryCount: cleanedGraphData.metadata.aiSummaryCount || 0
        },
        warning: `Graph created but failed to add to Notion page: ${notionError.message}`,
        message: `⚠️ Business Tool graph created for "${pageTitle}" with ${isOpenAIEnabled ? 'OpenAI' : 'fallback'} summaries but couldn't add to Notion page.`
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
      openai: isOpenAIEnabled ? 'enabled' : 'fallback',
      processingTimeMs: Date.now() - startTime
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
    console.log(`🤖 OpenAI: ${isOpenAIEnabled ? 'ENABLED (GPT-3.5 Turbo)' : 'DISABLED - Fallback summaries'}`);
    console.log(`🏢 Business ECP support: Enabled`);
    console.log(`🛠️ Business Tool support: Enabled`);
    console.log(`📊 Graph structure extraction: Enabled`);
    console.log(`🎯 Sibling sorting post-processing: Active`);
    console.log(`💡 Smart summaries: ${isOpenAIEnabled ? 'OpenAI GPT-3.5' : 'Rule-based fallback'}`);
    console.log(`📐 Default layout config:`, LAYOUT_CONFIG);
    console.log(`🔧 Algorithm: sibling-sorting-post-processing`);
    
    if (!isOpenAIEnabled) {
      console.log(`\n⚠️  IMPORTANT: Set OPENAI_API_KEY environment variable to enable AI summaries!`);
    }
  });
}