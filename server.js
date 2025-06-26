const express = require('express');
const { Client } = require('@notionhq/client');
const cors = require('cors');
const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: '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'
});

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

// ===== OPENAI FUNCTIONS =====
async function generatePolicyTitle(policyContent) {
  try {
    console.log(`🤖 Generating policy title for content: ${policyContent.substring(0, 100)}...`);
    
    const prompt = `Summarize the policy into exactly 1-6 words that capture the main action or rule. Focus on the key instruction or outcome. Use simple, clear language.

Policy: ${policyContent}

1-6-word title:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 50,
      temperature: 0.3
    });

    const title = completion.choices[0].message.content.trim();
    console.log(`✅ Generated policy title: "${title}"`);
    return title;
  } catch (error) {
    console.error('❌ Error generating policy title:', error);
    return 'Policy Summary';
  }
}

async function generateEventTitle(eventContent) {
  try {
    console.log(`🤖 Generating event title for content: ${eventContent.substring(0, 100)}...`);
    
    const prompt = `Summarize this event or process into 1-6 words that capture the main action being performed. Focus on what is being done or accomplished. Use active, clear language.

Event/Process: ${eventContent}

1-6-word title:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 50,
      temperature: 0.3
    });

    const title = completion.choices[0].message.content.trim();
    console.log(`✅ Generated event title: "${title}"`);
    return title;
  } catch (error) {
    console.error('❌ Error generating event title:', error);
    return 'Event Summary';
  }
}

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
                content: `Generated: ${new Date().toLocaleString()} | Storage: ${isFirebaseEnabled ? 'Firebase' : 'Memory'} | Layout: Sibling Sorting Applied | AI Summaries: Enabled` 
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

// ===== SIBLING SORTING LAYER =====
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

// ===== LAYOUT TRANSFORMATION WITH AI TITLES =====
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

  // Extract content from within policies and events
  function extractContentFromBlock(block) {
    let content = '';
    
    if (block.children && Array.isArray(block.children)) {
      function collectContent(childBlock) {
        if (childBlock.content && childBlock.content.trim() !== '' && childBlock.content !== '—') {
          const childContent = childBlock.content.trim();
          
          // Skip structural elements
          if (!/←\s*Policy\s*:/.test(childContent) && 
              !/←\s*Event/.test(childContent) &&
              !/←\s*JSON\s*Code/.test(childContent) &&
              !/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition/.test(childContent)) {
            
            content += childContent + '\n';
          }
        }
        
        if (childBlock.children && Array.isArray(childBlock.children)) {
          childBlock.children.forEach(collectContent);
        }
      }
      
      block.children.forEach(collectContent);
    }
    
    return content.trim();
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
      // For policies, use AI to generate title from content
      if (block) {
        const policyContent = extractContentFromBlock(block);
        if (policyContent && policyContent.length > 10) {
          console.log(`🤖 Generating AI title for policy content...`);
          try {
            title = await generatePolicyTitle(policyContent);
          } catch (error) {
            console.error('❌ Failed to generate policy title, using fallback');
            title = 'Policy Summary';
          }
        } else {
          // Fallback to manual extraction
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
        }
      }
    } else if (type === 'event') {
      // For events, use AI to generate title from content
      if (block) {
        const eventContent = extractContentFromBlock(block);
        if (eventContent && eventContent.length > 10) {
          console.log(`🤖 Generating AI title for event content...`);
          try {
            title = await generateEventTitle(eventContent);
          } catch (error) {
            console.error('❌ Failed to generate event title, using fallback');
            title = 'Event Summary';
          }
        } else {
          // Fallback to manual extraction
          if (content.match(/^\s*←\s*Event\s*$/)) {
            title = 'Event (No Title)';
          } else {
            const match = content.match(/←\s*Event\s+(.+)/);
            if (match) title = match[1].trim();
            else title = 'Event (Unknown)';
          }
        }
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
    const title = await extractTitle(content, nodeType, shouldUsePageTitle ? pageTitle : null, block);
    
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
        await createNode(child, nodeId, level + 1);
      }
    }
    
    return nodeId;
  }
  
  console.log(`🚀 Starting layout transformation with AI summaries...`);
  
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
      },
      pageTitle: pageTitle,
      aiSummariesEnabled: true
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
    message: 'Notion Graph Service - Sibling Sorting Applied + AI Summaries',
    status: 'running',
    timestamp: new Date().toISOString(),
    firebase: isFirebaseEnabled ? 'enabled' : 'disabled',
    notion: NOTION_TOKEN ? 'configured' : 'missing',
    openai: 'enabled',
    supportedTypes: ['Business ECP', 'Business Tool', 'Conditions', 'Policies', 'Events', 'JSON Code'],
    layoutConfig: LAYOUT_CONFIG,
    layoutAlgorithm: 'sibling-sorting-post-processing',
    aiFeatures: 'Policy and Event AI summaries enabled',
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
    openai: 'configured',
    storage: isFirebaseEnabled ? 'firestore' : 'memory',
    memoryGraphs: graphStorage.size,
    supportedGraphTypes: ['businessECP', 'businessTool'],
    layoutConfig: LAYOUT_CONFIG,
    layoutAlgorithm: 'sibling-sorting-post-processing',
    aiFeatures: 'Policy and Event AI summaries enabled'
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
      aiFeatures: 'Policy and Event AI summaries enabled'
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
    aiFeatures: 'Policy and Event AI summaries enabled'
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

    console.log(`🏢 Creating Business ECP graph with sibling sorting and AI summaries for page ${pageId} with text "${text}"`);

    const pageTitle = await fetchNotionPageTitle(pageId);
    console.log(`📖 Using page title: "${pageTitle}"`);

    const toggleStructure = await fetchToggleBlockStructure({ pageId, text });
    console.log(`✅ Toggle structure extracted in ${Date.now() - startTime}ms`);
    
    const graphData = await transformToggleToReactFlow(toggleStructure.result, layoutConfig, pageTitle);
    console.log(`✅ Graph transformed with sibling sorting and AI summaries: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
    
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
          processingTimeMs: Date.now() - startTime,
          layoutConfig: cleanedGraphData.metadata.layout,
          algorithm: 'sibling-sorting-post-processing',
          siblingSortingApplied: cleanedGraphData.metadata.siblingSortingApplied,
          aiSummariesEnabled: cleanedGraphData.metadata.aiSummariesEnabled
        },
        notionResult: appendResult,
        message: `✅ Business ECP graph created for "${pageTitle}" with sibling sorting and AI summaries! ${isFirebaseEnabled ? 'Stored in Firebase.' : 'Stored in memory.'}`
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
          processingTimeMs: Date.now() - startTime,
          layoutConfig: cleanedGraphData.metadata.layout,
          algorithm: 'sibling-sorting-post-processing',
          siblingSortingApplied: cleanedGraphData.metadata.siblingSortingApplied,
          aiSummariesEnabled: cleanedGraphData.metadata.aiSummariesEnabled
        },
        warning: `Graph created but failed to add to Notion page: ${notionError.message}`,
        message: `⚠️ Business ECP graph created for "${pageTitle}" with sibling sorting and AI summaries but couldn't add to Notion page.`
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

    console.log(`🛠️ Creating Business Tool graph with sibling sorting and AI summaries for page ${pageId} with text "${text}"`);

    const pageTitle = await fetchNotionPageTitle(pageId);
    console.log(`📖 Using page title: "${pageTitle}"`);

    const toggleStructure = await fetchToggleBlockStructure({ pageId, text });
    console.log(`✅ Toggle structure extracted in ${Date.now() - startTime}ms`);
    
    const graphData = await transformToggleToReactFlow(toggleStructure.result, layoutConfig, pageTitle);
    console.log(`✅ Graph transformed with sibling sorting and AI summaries: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
    
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
          processingTimeMs: Date.now() - startTime,
          layoutConfig: cleanedGraphData.metadata.layout,
          algorithm: 'sibling-sorting-post-processing',
          siblingSortingApplied: cleanedGraphData.metadata.siblingSortingApplied,
          aiSummariesEnabled: cleanedGraphData.metadata.aiSummariesEnabled
        },
        notionResult: appendResult,
        message: `✅ Business Tool graph created for "${pageTitle}" with sibling sorting and AI summaries! ${isFirebaseEnabled ? 'Stored in Firebase.' : 'Stored in memory.'}`
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
          processingTimeMs: Date.now() - startTime,
          layoutConfig: cleanedGraphData.metadata.layout,
          algorithm: 'sibling-sorting-post-processing',
          siblingSortingApplied: cleanedGraphData.metadata.siblingSortingApplied,
          aiSummariesEnabled: cleanedGraphData.metadata.aiSummariesEnabled
        },
        warning: `Graph created but failed to add to Notion page: ${notionError.message}`,
        message: `⚠️ Business Tool graph created for "${pageTitle}" with sibling sorting and AI summaries but couldn't add to Notion page.`
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
    
    console.log('🧪 Running quick test with sibling sorting and AI summaries...');
    
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
      algorithm: 'sibling-sorting-post-processing',
      aiFeatures: 'Policy and Event AI summaries enabled'
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
      algorithm: 'sibling-sorting-post-processing',
      aiFeatures: 'Policy and Event AI summaries enabled'
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
    console.log(`🤖 OpenAI: Configured for AI summaries`);
    console.log(`🏢 Business ECP support: Enabled`);
    console.log(`🛠️ Business Tool support: Enabled`);
    console.log(`📊 Graph structure extraction: Enabled`);
    console.log(`🎯 Sibling sorting post-processing: Active`);
    console.log(`🧠 AI Features: Policy and Event summaries enabled`);
    console.log(`📐 Default layout config:`, LAYOUT_CONFIG);
    console.log(`🔧 Algorithm: sibling-sorting-post-processing`);
  });
}