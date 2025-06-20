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
  const TIMEOUT_BUFFER = 50000; // 50 seconds - removed time constraint since user doesn't care about time

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

    // Fetch page children with longer timeout
    console.log(`🔍 Fetching page children for: ${pageId}`);
    const pageResponse = await fetch(`${baseUrl}/${pageId}/children`, { 
      method: 'GET', 
      headers,
      signal: AbortSignal.timeout(20000) // 20s timeout for page fetch
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
          signal: AbortSignal.timeout(15000) // 15s timeout per callout
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
          console.log(`🎯 Processing toggle structure with NO DEPTH LIMIT...`);
          const result = {
            toggleBlock: await simplifyBlockForVercel(toggle, headers, 0),
            metadata: {
              searchText: text,
              processingTimeMs: Date.now() - startTime,
              foundInCalloutId: callout.id,
              depthLimit: 'NONE'
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
  // REMOVED DEPTH LIMIT - process all levels
  console.log(`📊 Processing block at depth ${depth} (no limit)`);

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
    default:
      simplified.content = `[${block.type}]`;
      break;
  }

  // Fetch ALL children regardless of depth
  if (block.has_children) {
    try {
      const childResponse = await fetch(`https://api.notion.com/v1/blocks/${block.id}/children`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000) // 10s timeout per block
      });
      
      if (childResponse.ok) {
        const childData = await childResponse.json();
        console.log(`📄 Found ${childData.results.length} children at depth ${depth}`);
        
        // Process ALL children - no limit on number or depth
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

// Proper transformation function to extract real Notion content
function transformToggleToReactFlow(toggleStructureJson) {
  const toggleStructure = JSON.parse(toggleStructureJson);
  const nodes = [];
  const edges = [];
  let nodeIdCounter = 1;

  // Layout configuration with proper spacing
  const HORIZONTAL_SPACING = 350;
  const VERTICAL_SPACING = 220;
  
  // Track positions for layout
  const levelPositions = new Map();
  
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
    
    console.log(`🔍 Extracting policy title from: "${content}"`);
    
    // First try to match with parentheses
    const matchWithParens = content.match(/←\s*Policy\s*:\s*\(→\s*(.+?)\s*←\)/);
    if (matchWithParens) {
      const title = matchWithParens[1].trim();
      console.log(`✅ Found policy title in parentheses: "${title}"`);
      
      // Even if it's a placeholder, we'll show it and try to get better content from children
      if (title.includes('Type your Policy Name Here')) {
        const betterTitle = getFirstFiveWordsFromFirstListItem(block);
        if (betterTitle && betterTitle !== 'Policy') {
          console.log(`✅ Found better policy title from children: "${betterTitle}"`);
          return betterTitle;
        }
        return 'Policy (Template)'; // Show even template policies
      }
      
      return title;
    }
    
    // Then try to match everything after "← Policy: "
    const matchAfterPolicy = content.match(/←\s*Policy\s*:\s*(.+)/);
    if (matchAfterPolicy) {
      const title = matchAfterPolicy[1].trim();
      console.log(`✅ Found policy title after colon: "${title}"`);
      
      // Clean up common patterns
      const cleanedTitle = title
        .replace(/\s*-\s*optional title.*$/i, '')
        .replace(/^\(→\s*/, '')
        .replace(/\s*←\)$/, '')
        .trim();
      
      if (!cleanedTitle || cleanedTitle === "Type your Policy Name Here") {
        const betterTitle = getFirstFiveWordsFromFirstListItem(block);
        if (betterTitle && betterTitle !== 'Policy') {
          console.log(`✅ Found better policy title from children: "${betterTitle}"`);
          return betterTitle;
        }
        return 'Policy (Empty)'; // Show even empty policies
      }
      
      return cleanedTitle;
    }
    
    // Handle cases without anything after colon like "← Policy:" or "← Policy: "
    if (content.match(/←\s*Policy\s*:\s*$/)) {
      console.log(`🔍 Empty policy found, checking children...`);
      const childTitle = getFirstFiveWordsFromFirstListItem(block);
      if (childTitle && childTitle !== 'Policy') {
        console.log(`✅ Found policy title from children: "${childTitle}"`);
        return childTitle;
      }
      return 'Policy (No Title)'; // Show even untitled policies
    }
    
    console.log(`⚠️ Could not extract policy title from: "${content}"`);
    return 'Policy (Unknown)';
  }
  
  function getFirstFiveWordsFromFirstListItem(block) {
    if (!block.children || block.children.length === 0) {
      console.log(`⚠️ No children found for policy block`);
      return null;
    }
    
    console.log(`🔍 Checking ${block.children.length} children for policy content...`);
    
    // Find the first list item (bulleted_list_item or numbered_list_item)
    for (const child of block.children) {
      if (child.type === 'bulleted_list_item' || child.type === 'numbered_list_item') {
        const listContent = child.content;
        console.log(`📄 Found list item with content: "${listContent}"`);
        
        if (listContent && listContent.trim()) {
          const words = listContent.trim().split(/\s+/);
          const firstFiveWords = words.slice(0, 5).join(' ');
          console.log(`✅ Extracted first 5 words: "${firstFiveWords}"`);
          return firstFiveWords || "List Content";
        }
      }
    }
    
    console.log(`⚠️ No meaningful list content found`);
    return null;
  }
  
  function isPolicyEmpty(block) {
    // We'll be more lenient - show policies even if they seem "empty"
    // Only skip if there's absolutely no content structure
    
    if (!block.children || block.children.length === 0) {
      console.log(`📋 Policy has no children - will still show as placeholder`);
      return false; // Don't skip - show as placeholder
    }
    
    // Check if all list children are completely empty
    const listItems = block.children.filter(child => 
      child.type === 'bulleted_list_item' || child.type === 'numbered_list_item'
    );
    
    if (listItems.length === 0) {
      console.log(`📋 Policy has children but no list items - will still show`);
      return false; // Don't skip - might have other content
    }
    
    // Only consider it truly empty if ALL list items are completely empty
    const allEmpty = listItems.every(item => {
      const content = item.content;
      return !content || !content.trim();
    });
    
    if (allEmpty) {
      console.log(`📋 All policy list items are empty - will still show as template`);
      return false; // Even completely empty policies should be shown
    }
    
    console.log(`📋 Policy has some content in list items`);
    return false; // Never skip policies
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
    
    console.log(`🔍 Processing block at level ${level}: "${content.substring(0, 100)}..."`);
    
    // Check if this is a Business ECP root node
    if (level === 0 && content.includes('Business ECP:')) {
      shouldCreateNode = true;
      // Extract the ECP name from patterns like "Business ECP: (→ TyptestECP Name Here ←)"
      let cleanedContent = content
        .replace(/Business ECP:\s*\(?\s*→?\s*/, '')
        .replace(/\s*←?\s*\)?\s*.*$/, '')
        .replace(/â/g, '')
        .trim();
      
      // If still contains placeholder text, clean it up
      if (cleanedContent.includes('TyptestECP') || cleanedContent.includes('Type')) {
        cleanedContent = cleanedContent.replace(/TyptestECP\s*/, '').replace(/Type.*/, '').trim();
      }
      
      if (!cleanedContent) cleanedContent = 'ECP Name';
      
      nodeData = {
        label: `🏢 Business ECP: ${cleanedContent}`,
        originalContent: content,
        cleanedContent: cleanedContent,
        blockType: block.type,
        nodeType: 'businessECP',
        depth: level
      };
      nodeStyle = {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        border: 'none',
        borderRadius: '12px',
        fontSize: '15px',
        fontWeight: '700',
        padding: '20px 24px',
        minWidth: '240px',
        maxWidth: '320px',
        boxShadow: '0 8px 25px rgba(102, 126, 234, 0.4)',
        textAlign: 'center',
        color: 'white'
      };
      console.log(`✅ Created Business ECP node: ${nodeData.label}`);
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
        border: 'none',
        borderRadius: '12px',
        fontSize: '14px',
        fontWeight: '600',
        padding: '18px 22px',
        minWidth: '200px',
        maxWidth: '300px',
        boxShadow: '0 6px 20px rgba(246, 173, 85, 0.3)',
        textAlign: 'center',
        color: '#8b4513'
      };
      console.log(`✅ Created Condition node: ${nodeData.label}`);
    }
    // Check if it's a policy
    else if (isPolicy(content)) {
      console.log(`📋 Found policy block: "${content.substring(0, 100)}..."`);
      
      const policyTitle = extractPolicyTitle(content, block);
      console.log(`📋 Extracted policy title: "${policyTitle}"`);
      
      // Always create policy nodes - don't skip any
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
        border: 'none',
        borderRadius: '12px',
        fontSize: '14px',
        fontWeight: '600',
        padding: '18px 22px',
        minWidth: '200px',
        maxWidth: '300px',
        boxShadow: '0 6px 20px rgba(79, 209, 199, 0.3)',
        textAlign: 'center',
        color: '#2d3748'
      };
      console.log(`✅ Created Policy node: ${nodeData.label}`);
    }
    else {
      // Log blocks that don't match our patterns
      console.log(`⚠️ Block doesn't match any pattern at level ${level}: "${content.substring(0, 50)}..." (type: ${block.type})`);
    }
    
    let currentNodeId = null;
    
    if (shouldCreateNode && nodeData) {
      const nodeId = String(nodeIdCounter++);
      currentNodeId = nodeId;
      
      // Initialize level tracking
      if (!levelPositions.has(level)) {
        levelPositions.set(level, 0);
      }
      
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
  
  console.log(`🚀 Starting transformation of toggle structure...`);
  
  // Start processing from the root toggle block
  createNode(toggleStructure.toggleBlock);
  
  console.log(`📊 Created ${nodes.length} nodes and ${edges.length} edges`);
  
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
  
  console.log(`📈 Node breakdown: ${JSON.stringify(nodeTypes)}`);
  
  return {
    nodes,
    edges,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      maxDepth: nodes.length > 0 ? Math.max(...nodes.map(n => n.data.depth)) : 0,
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
      'POST /api/graph-structure',
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

// MODIFICATION: Update the /api/graph-structure endpoint response
// Replace the existing endpoint with this simplified version:

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

    // Extract toggle structure using existing function
    const toggleStructure = await fetchToggleBlockStructure({ pageId, text });
    console.log(`✅ Toggle structure extracted in ${Date.now() - startTime}ms`);
    
    // Transform to simplified graph structure
    const simplifiedStructure = extractSimplifiedGraphStructure(toggleStructure.result);
    console.log(`✅ Simplified structure created: ${simplifiedStructure.length} nodes`);

    // Return the simplified structure wrapped in results object
    res.json({
      results: simplifiedStructure
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

// NEW FUNCTION: Extract simplified graph structure
function extractSimplifiedGraphStructure(toggleStructureJson) {
  const toggleStructure = JSON.parse(toggleStructureJson);
  const nodes = [];
  let nodeIdCounter = 1;

  // Helper functions (reusing existing logic)
  function isCondition(content) {
    return /[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition/.test(content);
  }
  
  function isPolicy(content) {
    return /←\s*Policy\s*:/.test(content);
  }

  function extractPolicyContentAsString(block) {
    if (!block.children || block.children.length === 0) {
      return "";
    }

    const contentItems = [];
    
    function extractFromChildren(children) {
      for (const child of children) {
        if (child.type === 'bulleted_list_item' || child.type === 'numbered_list_item') {
          if (child.content && child.content.trim()) {
            contentItems.push(child.content.trim());
          }
        }
        
        // Recursively process nested children
        if (child.children && child.children.length > 0) {
          extractFromChildren(child.children);
        }
      }
    }
    
    extractFromChildren(block.children);
    
    // Join all content items with newlines or spaces
    return contentItems.join(' ');
  }
  
  function createSimplifiedNode(block, parentId = null, level = 0) {
    if (!block.content || 
        block.content.trim() === '' || 
        block.content === '—' || 
        block.content === '[divider]' ||
        block.type === 'divider' ||
        block.type === 'unsupported') {
      
      if (block.children && Array.isArray(block.children)) {
        for (const child of block.children) {
          createSimplifiedNode(child, parentId, level);
        }
      }
      return null;
    }
    
    const content = block.content.trim();
    let shouldCreateNode = false;
    let nodeData = null;
    
    console.log(`🔍 Processing block at level ${level}: "${content.substring(0, 100)}..." (Block ID: ${block.id})`);
    
    // Business ECP
    if (level === 0 && content.includes('Business ECP:')) {
      shouldCreateNode = true;
      
      nodeData = {
        id: String(nodeIdCounter++),
        type: 'businessECP',
        title: content, // Use original content as title
        level: level,
        parentId: parentId,
        notionBlockId: block.id
      };
      console.log(`✅ Created Business ECP node (Block ID: ${block.id})`);
    }
    // Condition
    else if (isCondition(content)) {
      shouldCreateNode = true;
      
      nodeData = {
        id: String(nodeIdCounter++),
        type: 'condition',
        title: content, // Use original content as title
        level: level,
        parentId: parentId,
        notionBlockId: block.id
      };
      console.log(`✅ Created Condition node (Block ID: ${block.id})`);
    }
    // Policy
    else if (isPolicy(content)) {
      console.log(`📋 Found policy block: "${content.substring(0, 100)}..." (Block ID: ${block.id})`);
      
      shouldCreateNode = true;
      const policyContentString = extractPolicyContentAsString(block);
      
      nodeData = {
        id: String(nodeIdCounter++),
        type: 'policy',
        title: content, // Use original content as title
        content: policyContentString, // Single string instead of array
        level: level,
        parentId: parentId,
        notionBlockId: block.id
      };
      console.log(`✅ Created Policy node with content length: ${policyContentString.length} chars (Block ID: ${block.id})`);
    }
    
    let currentNodeId = null;
    
    if (shouldCreateNode && nodeData) {
      currentNodeId = nodeData.id;
      nodes.push(nodeData);
    }
    
    // Process children recursively
    if (block.children && Array.isArray(block.children)) {
      for (const child of block.children) {
        createSimplifiedNode(child, currentNodeId || parentId, level + (shouldCreateNode ? 1 : 0));
      }
    }
    
    return currentNodeId;
  }
  
  console.log(`🚀 Starting simplified structure extraction...`);
  
  // Start processing from the root toggle block
  createSimplifiedNode(toggleStructure.toggleBlock);
  
  console.log(`📊 Created ${nodes.length} simplified nodes`);
  
  return nodes;
}
// ===== NEW FUNCTION: EXTRACT DETAILED GRAPH STRUCTURE =====
function extractDetailedGraphStructure(toggleStructureJson) {
  const toggleStructure = JSON.parse(toggleStructureJson);
  const nodes = [];
  const edges = [];
  let nodeIdCounter = 1;

  // Helper functions (reusing existing logic)
  function isCondition(content) {
    return /[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition/.test(content);
  }
  
  function isPolicy(content) {
    return /←\s*Policy\s*:/.test(content);
  }
  
  function extractConditionTitle(content) {
    const matchWithParens = content.match(/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition\s*\(→\s*(.+?)\s*←\)/);
    if (matchWithParens) {
      return matchWithParens[1].trim();
    }
    
    const matchAfterCondition = content.match(/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]\s*Condition\s+(.+)/);
    if (matchAfterCondition) {
      return matchAfterCondition[1].trim();
    }
    
    return content;
  }
  
  function extractPolicyTitle(content, block) {
    console.log(`🔍 Extracting policy title from: "${content}"`);
    
    const matchWithParens = content.match(/←\s*Policy\s*:\s*\(→\s*(.+?)\s*←\)/);
    if (matchWithParens) {
      const title = matchWithParens[1].trim();
      if (title.includes('Type your Policy Name Here')) {
        const betterTitle = getFirstWordsFromFirstListItem(block, 10);
        if (betterTitle && betterTitle !== 'Policy') {
          return betterTitle;
        }
        return 'Policy (Template)';
      }
      return title;
    }
    
    const matchAfterPolicy = content.match(/←\s*Policy\s*:\s*(.+)/);
    if (matchAfterPolicy) {
      const title = matchAfterPolicy[1].trim()
        .replace(/\s*-\s*optional title.*$/i, '')
        .replace(/^\(→\s*/, '')
        .replace(/\s*←\)$/, '')
        .trim();
      
      if (!title || title === "Type your Policy Name Here") {
        const betterTitle = getFirstWordsFromFirstListItem(block, 10);
        if (betterTitle && betterTitle !== 'Policy') {
          return betterTitle;
        }
        return 'Policy (Empty)';
      }
      return title;
    }
    
    if (content.match(/←\s*Policy\s*:\s*$/)) {
      const childTitle = getFirstWordsFromFirstListItem(block, 10);
      if (childTitle && childTitle !== 'Policy') {
        return childTitle;
      }
      return 'Policy (No Title)';
    }
    
    return 'Policy (Unknown)';
  }
  
  function getFirstWordsFromFirstListItem(block, wordLimit = 10) {
    if (!block.children || block.children.length === 0) {
      return null;
    }
    
    for (const child of block.children) {
      if (child.type === 'bulleted_list_item' || child.type === 'numbered_list_item') {
        const listContent = child.content;
        if (listContent && listContent.trim()) {
          const words = listContent.trim().split(/\s+/);
          return words.slice(0, wordLimit).join(' ');
        }
      }
    }
    return null;
  }

  function extractPolicyContent(block) {
    if (!block.children || block.children.length === 0) {
      return [];
    }
  
    const policyItems = [];
    
    function extractFromChildren(children, level = 0) {
      for (const child of children) {
        if (child.type === 'bulleted_list_item' || child.type === 'numbered_list_item') {
          if (child.content && child.content.trim()) {
            policyItems.push({
              type: child.type,
              content: child.content.trim(),
              level: level,
              notionBlockId: child.id  // ✨ ADD NOTION BLOCK ID TO CONTENT ITEMS
            });
          }
        }
        
        // Recursively process nested children
        if (child.children && child.children.length > 0) {
          extractFromChildren(child.children, level + 1);
        }
      }
    }
    
    extractFromChildren(block.children);
    return policyItems;
  }

  function cleanText(text) {
    return text
      .replace(/["\[\]]/g, '')
      .replace(/[❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴]/g, '')
      .replace(/^\s*←?\s*/, '')
      .replace(/^\s*→?\s*/, '')
      .replace(/\s*←\s*$/, '')
      .replace(/\s*→\s*$/, '')
      .replace(/\(\s*→\s*/, '(')
      .replace(/\s*←\s*\)/, ')')
      .replace(/â/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  function createStructureNode(block, parentId = null, level = 0) {
    if (!block.content || 
        block.content.trim() === '' || 
        block.content === '—' || 
        block.content === '[divider]' ||
        block.type === 'divider' ||
        block.type === 'unsupported') {
      
      if (block.children && Array.isArray(block.children)) {
        for (const child of block.children) {
          createStructureNode(child, parentId, level);
        }
      }
      return null;
    }
    
    const content = block.content.trim();
    let shouldCreateNode = false;
    let nodeData = null;
    
    console.log(`🔍 Processing block at level ${level}: "${content.substring(0, 100)}..." (Block ID: ${block.id})`);
    
    // Business ECP
    if (level === 0 && content.includes('Business ECP:')) {
      shouldCreateNode = true;
      let cleanedContent = content
        .replace(/Business ECP:\s*\(?\s*→?\s*/, '')
        .replace(/\s*←?\s*\)?\s*.*$/, '')
        .replace(/â/g, '')
        .trim();
      
      if (cleanedContent.includes('TyptestECP') || cleanedContent.includes('Type')) {
        cleanedContent = cleanedContent.replace(/TyptestECP\s*/, '').replace(/Type.*/, '').trim();
      }
      
      if (!cleanedContent) cleanedContent = 'ECP Name';
      
      nodeData = {
        id: String(nodeIdCounter++),
        type: 'businessECP',
        title: cleanedContent,
        originalContent: content,
        level: level,
        parentId: parentId,
        notionBlockId: block.id  // ✨ ADD NOTION BLOCK ID
      };
      console.log(`✅ Created Business ECP node: ${nodeData.title} (Block ID: ${block.id})`);
    }
    // Condition
    else if (isCondition(content)) {
      shouldCreateNode = true;
      const conditionTitle = extractConditionTitle(content);
      const cleanedContent = cleanText(conditionTitle);
      
      nodeData = {
        id: String(nodeIdCounter++),
        type: 'condition',
        title: cleanedContent,
        originalContent: content,
        level: level,
        parentId: parentId,
        notionBlockId: block.id  // ✨ ADD NOTION BLOCK ID
      };
      console.log(`✅ Created Condition node: ${nodeData.title} (Block ID: ${block.id})`);
    }
    // Policy
    else if (isPolicy(content)) {
      console.log(`📋 Found policy block: "${content.substring(0, 100)}..." (Block ID: ${block.id})`);
      
      shouldCreateNode = true;
      const policyTitle = extractPolicyTitle(content, block);
      const policyContent = extractPolicyContent(block);
      const cleanedTitle = cleanText(policyTitle);
      
      nodeData = {
        id: String(nodeIdCounter++),
        type: 'policy',
        title: cleanedTitle,
        originalContent: content,
        content: policyContent,
        level: level,
        parentId: parentId,
        notionBlockId: block.id  // ✨ ADD NOTION BLOCK ID
      };
      console.log(`✅ Created Policy node: ${nodeData.title} with ${policyContent.length} content items (Block ID: ${block.id})`);
    }
    
    let currentNodeId = null;
    
    if (shouldCreateNode && nodeData) {
      currentNodeId = nodeData.id;
      nodes.push(nodeData);
      
      // Create edge if there's a parent
      if (parentId) {
        edges.push({
          id: `edge_${parentId}_to_${currentNodeId}`,
          source: parentId,
          target: currentNodeId
        });
      }
    }
    
    // Process children recursively
    if (block.children && Array.isArray(block.children)) {
      for (const child of block.children) {
        createStructureNode(child, currentNodeId || parentId, level + (shouldCreateNode ? 1 : 0));
      }
    }
    
    return currentNodeId;
  }
  console.log(`🚀 Starting detailed structure extraction...`);
  
  // Start processing from the root toggle block
  createStructureNode(toggleStructure.toggleBlock);
  
  console.log(`📊 Created ${nodes.length} nodes and ${edges.length} edges`);
  
  return {
    nodes,
    edges,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      maxLevel: nodes.length > 0 ? Math.max(...nodes.map(n => n.level)) : 0,
      nodeTypes: {
        businessECP: nodes.filter(n => n.type === 'businessECP').length,
        conditions: nodes.filter(n => n.type === 'condition').length,
        policies: nodes.filter(n => n.type === 'policy').length
      }
    }
  };
}

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