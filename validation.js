// validation.js - Notion Page Processor for ECP Validation
// Converted from n8n JavaScript Code Node to Express module

const { Client } = require('@notionhq/client');
const { processNotionPage } = require('./validation')
/***************************************************************
 * Constants                                                    *
 **************************************************************/
const NOTION_VERSION = "2022-06-28";
const BASE_URL = "https://api.notion.com/v1";

/***************************************************************
 * HTTP Helper Function                                         *
 **************************************************************/
async function notionApiRequest(notionToken, url, options = {}) {
  const requestOptions = {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    }
  };

  // Add body for POST/PATCH requests
  if (options.body) {
    requestOptions.body = JSON.stringify(options.body);
  }

  console.log(`Making ${requestOptions.method} request to: ${url}`);
  console.log(`Request headers:`, requestOptions.headers);
  if (options.body) {
    console.log(`Request body:`, JSON.stringify(options.body, null, 2));
  }
  
  try {
    const response = await fetch(url, requestOptions);
    console.log(`Response status: ${response.status}`);
    
    const responseData = await response.json();
    console.log(`Response received:`, JSON.stringify(responseData, null, 2));
    
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      json: async () => responseData
    };
    
  } catch (error) {
    console.error(`API request failed:`, error.message);
    console.error(`Error details:`, error);
    
    return {
      ok: false,
      status: 500,
      statusText: error.message || 'Request Failed',
      json: async () => ({ error: error.message })
    };
  }
}

/***************************************************************
 * Main processing function                                     *
 **************************************************************/
async function processNotionPage(notionToken, pageId, searchText) {
  // First, let's test the authentication with a simple API call
  console.log("Testing Notion API authentication...");
  try {
    const testResponse = await notionApiRequest(notionToken, `${BASE_URL}/users/me`);
    console.log("Auth test response:", testResponse);
    if (!testResponse.ok) {
      const errorData = await testResponse.json();
      throw new Error(`Authentication failed: ${JSON.stringify(errorData)}`);
    }
    console.log("✅ Authentication successful");
  } catch (authError) {
    console.error("❌ Authentication failed:", authError.message);
    throw new Error(`Authentication failed: ${authError.message}`);
  }

  // Clean the pageId and create different format variations
  const cleanId = pageId.replace(/-/g, "");
  
  // Create properly formatted UUID from clean ID
  let formattedId = pageId;
  if (cleanId.length === 32) {
    formattedId = cleanId.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
  }
  
  // Remove duplicates and create unique formats
  const pageIdFormats = Array.from(new Set([
    pageId,           // Original format as provided
    cleanId,          // No dashes (32 char string)  
    formattedId       // Properly formatted UUID
  ]));
  
  console.log(`Generated page ID formats:`, pageIdFormats);

  const allErrors = [];
  
  for (const testPageId of pageIdFormats) {
    console.log(`\n=== Trying page ID: ${testPageId} ===`);
    
    try {
      // Try pages endpoint first
      console.log(`Attempting pages endpoint...`);
      let pageResponse = await notionApiRequest(notionToken, `${BASE_URL}/pages/${testPageId}`);

      console.log(`Pages endpoint result - Success: ${pageResponse.ok}`);

      if (pageResponse.ok) {
        console.log(`✅ Successfully accessed page with ID: ${testPageId}`);
        return await processValidation(notionToken, testPageId, searchText);
      }

      // Capture pages endpoint error
      const pagesError = await pageResponse.json();
      allErrors.push({
        pageId: testPageId,
        endpoint: 'pages',
        status: pageResponse.status,
        error: pagesError
      });

      // If pages endpoint fails, try databases endpoint
      console.log(`Pages endpoint failed, trying databases endpoint...`);
      pageResponse = await notionApiRequest(notionToken, `${BASE_URL}/databases/${testPageId}`);
      
      console.log(`Databases endpoint result - Success: ${pageResponse.ok}`);

      if (pageResponse.ok) {
        console.log(`✅ Successfully accessed database with ID: ${testPageId}`);
        return await processValidation(notionToken, testPageId, searchText);
      }

      // Capture databases endpoint error
      const databasesError = await pageResponse.json();
      allErrors.push({
        pageId: testPageId,
        endpoint: 'databases', 
        status: pageResponse.status,
        error: databasesError
      });

      console.log(`❌ Both endpoints failed for ${testPageId}`);
      
    } catch (err) {
      console.log(`❌ Exception with ${testPageId}:`, err.message);
      allErrors.push({
        pageId: testPageId,
        endpoint: 'exception',
        error: err.message
      });
    }
  }

  // Log all errors for debugging
  console.log('\n=== ALL API ERRORS ===');
  console.log(JSON.stringify(allErrors, null, 2));

  throw new Error(
    `Could not access page with any ID format. Original: ${pageId}.\n` +
      `Tried formats: ${pageIdFormats.join(", ")}.\n` +
      `API Errors: ${JSON.stringify(allErrors, null, 2)}\n` +
      `Check: 1) Page exists and is accessible, 2) Integration has page permissions, 3) Integration is connected to the correct workspace.\n` +
      `Last API calls made: GET ${BASE_URL}/pages/{id} and GET ${BASE_URL}/databases/{id}`
  );
}

/***************************************************************
 * Optimized processing pipeline                               *
 **************************************************************/
async function processValidation(notionToken, pageId, searchText) {
  console.log("Starting validation process...");
  
  // Step 1: Read the immediate children of the target page
  const firstBatch = await notionApiRequest(notionToken, `${BASE_URL}/blocks/${pageId}/children?page_size=100`);
  const blocksData = await firstBatch.json();

  // Step 2: Find the toggle block that contains the supplied searchText inside callouts
  let toggleBlock = null;
  console.log("Searching for toggle block...");

  // First, look for callout blocks (limit search to avoid timeout)
  const calloutBlocks = blocksData.results.filter(block => block.type === "callout").slice(0, 10); // Limit callouts
  
  for (const block of calloutBlocks) {
    console.log(`Checking callout block ${block.id}...`);
    // Get children of the callout with depth limit
    const calloutChildren = await getAllChildrenRecursively(notionToken, block.id, 5); // Limit depth to 5
    
    // Look for toggle blocks within the callout
    const foundToggle = calloutChildren.find((child) => {
      if (child.type !== "toggle") return false;
      const toggleText = extractBlockText(child).toLowerCase();
      return toggleText.includes(searchText.toLowerCase());
    });

    if (foundToggle) {
      toggleBlock = foundToggle;
      console.log(`Found target toggle block: ${toggleBlock.id}`);
      break;
    }
  }

  if (!toggleBlock) {
    throw new Error(`No toggle found containing "${searchText}" inside any callout`);
  }

  // Step 3: Get all descendants with controlled depth to prevent timeout
  console.log("Getting all children recursively...");
  const allChildren = await getAllChildrenRecursively(notionToken, toggleBlock.id, 8); // Limit to 8 levels deep

  /********************* VALIDATION ***************************/
  console.log("Starting validation checks...");
  const validationIssues = [];

  // Check main ECP title completeness
  const toggleTitle = extractBlockText(toggleBlock);
  if (
    toggleTitle.includes("(→ Type your ECP Name Here ←)") ||
    toggleTitle.trim() === "Business ECP:"
  ) {
    validationIssues.push({
      message: "Main ECP block name is incomplete. Please replace '(→ Type your ECP Name Here ←)' with an actual ECP name.",
      blockId: toggleBlock.id,
      location: "Main ECP Block",
    });
  }

  // Walk the tree → collect blocks (with early termination if too many blocks)
  const allBlocks = collectAllBlocks(allChildren);
  console.log(`Collected ${allBlocks.length} blocks for validation`);
  
  // Limit validation to prevent timeout
  const maxBlocksToValidate = 1000;
  const blocksToValidate = allBlocks.slice(0, maxBlocksToValidate);
  
  if (allBlocks.length > maxBlocksToValidate) {
    console.warn(`Too many blocks (${allBlocks.length}), validating first ${maxBlocksToValidate} only`);
  }

  // Validate blocks in batches
  const batchSize = 50;
  for (let i = 0; i < blocksToValidate.length; i += batchSize) {
    const batch = blocksToValidate.slice(i, i + batchSize);
    
    for (const block of batch) {
      validateSingleBlock(block, validationIssues, block._conditionLevel ?? 0, block._parentType ?? "root");
    }
    
    // Small pause between validation batches
    if (i + batchSize < blocksToValidate.length) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  console.log(`Validation complete. Found ${validationIssues.length} issues.`);

  // If any issues → comment + abort
  if (validationIssues.length) {
    // Limit the number of comments to prevent timeout
    const maxComments = 20;
    const issuesToComment = validationIssues.slice(0, maxComments);
    
    if (validationIssues.length > maxComments) {
      console.warn(`Too many issues (${validationIssues.length}), adding comments for first ${maxComments} only`);
    }
    
    await addValidationComments(notionToken, issuesToComment);

    return {
      result: `❌ Structure validation failed. Added comments to ${issuesToComment.length} issue(s) on specific blocks.` + 
              (validationIssues.length > maxComments ? ` (${validationIssues.length - maxComments} additional issues found but not commented)` : ''),
      validated: false,
      mainBlockId: toggleBlock.id,
      issues: validationIssues
    };
  }

  /********************* SUCCESS ************/
  console.log("Cleaning up old validation comments...");
  // Cleanup old validation comments (with limited scope to prevent timeout)
  const limitedChildren = allChildren.slice(0, 200); // Limit cleanup scope
  await removeAllValidationComments(notionToken, limitedChildren);

  return {
    result: `✅ Structure validation passed successfully.`,
    validated: true,
    mainBlockId: toggleBlock.id,
    issues: []
  };
}

/***************************************************************
 * Optimized recursive tree builder with batching              *
 **************************************************************/
async function getAllChildrenRecursively(notionToken, parentId, maxDepth = 10, currentDepth = 0) {
  // Prevent infinite recursion
  if (currentDepth >= maxDepth) {
    console.warn(`Max depth ${maxDepth} reached for parent ${parentId}`);
    return [];
  }

  const children = [];
  let cursor = undefined;
  let batchCount = 0;
  const maxBatches = 20; // Limit total batches per parent

  do {
    // Build URL with query parameters manually instead of using URL constructor
    let url = `${BASE_URL}/blocks/${parentId}/children?page_size=100`;
    if (cursor) {
      url += `&start_cursor=${encodeURIComponent(cursor)}`;
    }

    const res = await notionApiRequest(notionToken, url);
    const data = await res.json();

    // Process children in smaller batches to avoid timeout
    const childPromises = [];
    for (const child of data.results) {
      if (child.has_children && currentDepth < maxDepth - 1) {
        // Batch child requests to avoid overwhelming the API
        childPromises.push(
          getAllChildrenRecursively(notionToken, child.id, maxDepth, currentDepth + 1)
            .then(childChildren => {
              child.children = childChildren;
              return child;
            })
            .catch(err => {
              console.warn(`Failed to get children for ${child.id}:`, err.message);
              child.children = [];
              return child;
            })
        );
      } else {
        childPromises.push(Promise.resolve(child));
      }
    }

    // Process children in smaller concurrent batches
    const batchSize = 5;
    for (let i = 0; i < childPromises.length; i += batchSize) {
      const batch = childPromises.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch);
      children.push(...batchResults);
      
      // Add small delay between batches to avoid rate limiting
      if (i + batchSize < childPromises.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    cursor = data.has_more ? data.next_cursor : undefined;
    batchCount++;
    
    // Safety valve to prevent infinite loops
    if (batchCount >= maxBatches) {
      console.warn(`Max batches ${maxBatches} reached for parent ${parentId}`);
      break;
    }
    
  } while (cursor);

  return children;
}

/***************************************************************
 * Block collection with depth tracking                       *
 **************************************************************/
function collectAllBlocks(blocks) {
  const all = [];

  function traverse(list, depth = 0, parentType = "root") {
    for (const blk of list) {
      const txt = extractBlockText(blk);
      const isCondition = isConditionBlock(txt);

      const level = isCondition ? depth + 1 : depth;
      blk._conditionLevel = level;
      blk._parentType = parentType;
      all.push(blk);

      if (blk.children?.length) {
        const nextParentType = isCondition ? "condition" : isPolicyBlock(txt) ? "policy" : "other";
        traverse(blk.children, level, nextParentType);
      }
    }
  }

  traverse(blocks);
  return all;
}

/***************************************************************
 * Validation helpers                                          *
 **************************************************************/
function validateSingleBlock(block, issues, currentConditionLevel = 0, parentType = "root") {
  if (block.type !== "toggle") return;

  const text = extractBlockText(block);

  if (text.includes("Business ECP:")) {
    issues.push({
      message: "Nested Business ECP blocks are not allowed.",
      blockId: block.id,
      location: `Block ${block.id}`,
    });
    return;
  }

  if (isConditionBlock(text)) {
    const expected = getExpectedConditionLevel(text);
    if (expected !== null && expected !== currentConditionLevel) {
      issues.push({
        message: `Condition is not at its correct level. Expected level ${expected}, but found ${currentConditionLevel}.`,
        blockId: block.id,
        location: `Condition ${block.id}`,
      });
    }

    const policyCount = countPoliciesDeep(block.children ?? []);
    if (policyCount > 1) {
      issues.push({
        message: `Condition has ${policyCount} policies but should not exceed 1 policy.`,
        blockId: block.id,
        location: `Condition ${block.id}`,
      });
    }

    const hasNestedCondition = hasNestedConditionDeep(block.children ?? []);
    const hasNonEmptyPolicy = hasNonEmptyPolicyDeep(block.children ?? []);
    
    if (!hasNestedCondition && !hasNonEmptyPolicy) {
      issues.push({
        message: `Condition must have either a nested condition OR a non-empty policy.`,
        blockId: block.id,
        location: `Condition ${block.id}`,
      });
    }

    validateConditionBlock(block, text, issues);
    return;
  }

  if (isPolicyBlock(text)) {
    validatePolicyBlock(block, text, issues);
    return;
  }
}

function countPoliciesDeep(nodes) {
  let total = 0;

  for (const node of nodes) {
    const text = extractBlockText(node);

    if (isPolicyBlock(text)) {
      total += 1;
      continue;
    }

    if (isConditionBlock(text)) {
      continue;
    }

    if (node.children?.length) {
      total += countPoliciesDeep(node.children);
    }
  }

  return total;
}

function hasNestedConditionDeep(nodes) {
  for (const node of nodes) {
    const text = extractBlockText(node);

    if (isConditionBlock(text)) {
      return true;
    }

    if (isPolicyBlock(text)) {
      continue;
    }

    if (node.children?.length && hasNestedConditionDeep(node.children)) {
      return true;
    }
  }

  return false;
}

function hasNonEmptyPolicyDeep(nodes) {
  for (const node of nodes) {
    const text = extractBlockText(node);

    if (isPolicyBlock(text)) {
      if (isPolicyNonEmpty(node)) {
        return true;
      }
      continue;
    }

    if (isConditionBlock(text)) {
      continue;
    }

    if (node.children?.length && hasNonEmptyPolicyDeep(node.children)) {
      return true;
    }
  }

  return false;
}

function isPolicyNonEmpty(policyBlock) {
  const text = extractBlockText(policyBlock);
  
  const hasTemplateTitle = text.includes("Type your Policy Name Here") || text.trim() === "← Policy:";
  
  if (!hasTemplateTitle) {
    return true;
  }
  
  return hasNonEmptyContent(policyBlock.children ?? []);
}

function hasNonEmptyContent(nodes) {
  for (const node of nodes) {
    const text = extractBlockText(node).trim();
    
    if (text && text.length > 0) {
      return true;
    }
    
    if (node.children?.length && hasNonEmptyContent(node.children)) {
      return true;
    }
  }
  
  return false;
}

function getExpectedConditionLevel(text) {
  const map = {
    "❶": 1, "❷": 2, "❸": 3, "❹": 4, "❺": 5,
    "❻": 6, "❼": 7, "❽": 8, "❾": 9,
  };

  const emoji = Object.keys(map).find((e) => text.includes(e));
  return emoji ? map[emoji] : null;
}

function isConditionBlock(text) {
  return /❶|❷|❸|❹|❺|❻|❼|❽|❾/.test(text) || text.includes("Condition");
}

function isPolicyBlock(text) {
  return text.trim().startsWith("← Policy");
}

function validateConditionBlock(block, text, issues) {
  if (text.includes("(→ Type your Condition Here ←)")) {
    issues.push({
      message: "Condition title is incomplete.",
      blockId: block.id,
      location: `Condition ${block.id}`,
    });
  }
}

function validatePolicyBlock(block, text, issues) {
  // Add policy-specific validation as needed
}

/***************************************************************
 * Optimized comment helpers with batching                     *
 **************************************************************/
async function addValidationComments(notionToken, issues) {
  if (issues.length === 0) return;
  
  const grouped = new Map();
  for (const issue of issues) {
    if (!grouped.has(issue.blockId)) grouped.set(issue.blockId, []);
    grouped.get(issue.blockId).push(issue);
  }

  // Process comments in batches to avoid timeout
  const entries = Array.from(grouped.entries());
  const batchSize = 3;
  
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    
    const commentPromises = batch.map(async ([blockId, list]) => {
      try {
        await removeValidationCommentsForBlock(notionToken, blockId);

        const commentText =
          list.length === 1
            ? `🚨 ECP Validation Issue: ${list[0].message}`
            : `🚨 ECP Validation Issues:\n` +
              list.map((it, i) => `${i + 1}. ${it.message}`).join("\n");

        await notionApiRequest(notionToken, `${BASE_URL}/comments`, {
          method: "POST",
          body: {
            parent: { type: "block_id", block_id: blockId },
            rich_text: [{ type: "text", text: { content: commentText } }],
          }
        });
      } catch (error) {
        console.warn(`Failed to add comment to block ${blockId}:`, error.message);
      }
    });

    await Promise.all(commentPromises);
    
    // Small delay between batches
    if (i + batchSize < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

async function removeValidationCommentsForBlock(notionToken, blockId) {
  try {
    const res = await notionApiRequest(notionToken,
      `${BASE_URL}/comments?block_id=${blockId}&page_size=100`
    );
    const data = await res.json();

    const validationComments = data.results?.filter((c) =>
      c.rich_text?.some((t) => t.type === "text" && t.text.content.startsWith("🚨 ECP Validation"))
    ) || [];

    if (validationComments.length === 0) return;

    // Delete comments in smaller batches
    const batchSize = 3;
    for (let i = 0; i < validationComments.length; i += batchSize) {
      const batch = validationComments.slice(i, i + batchSize);
      const deletePromises = batch.map(comment => 
        notionApiRequest(notionToken, `${BASE_URL}/comments/${comment.id}`, {
          method: "DELETE"
        }).catch(err => console.warn(`Failed to delete comment ${comment.id}:`, err.message))
      );
      
      await Promise.all(deletePromises);
      
      // Small delay between batches
      if (i + batchSize < validationComments.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    console.warn(`Failed to remove validation comments for block ${blockId}:`, error.message);
  }
}

async function removeAllValidationComments(notionToken, blocks) {
  if (!blocks || blocks.length === 0) return;
  
  // Collect all block IDs first (breadth-first)
  const allBlockIds = [];
  
  function collectBlockIds(blockList) {
    for (const blk of blockList) {
      allBlockIds.push(blk.id);
      if (blk.children?.length) {
        collectBlockIds(blk.children);
      }
    }
  }
  
  collectBlockIds(blocks);
  
  // Process block IDs in batches
  const batchSize = 5;
  for (let i = 0; i < allBlockIds.length; i += batchSize) {
    const batch = allBlockIds.slice(i, i + batchSize);
    
    const cleanupPromises = batch.map(blockId => 
      removeValidationCommentsForBlock(notionToken, blockId)
        .catch(e => console.warn(`Failed to clean comments for ${blockId}:`, e.message))
    );
    
    await Promise.all(cleanupPromises);
    
    // Small delay between batches
    if (i + batchSize < allBlockIds.length) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
}

/***************************************************************
 * Utility helpers                                             *
 **************************************************************/
function extractBlockText(block) {
  if (!block?.[block.type]) return "";
  const richText = block[block.type].rich_text || [];
  return richText.map((t) => t.plain_text || "").join(" ");
}

/***************************************************************
 * Export the main function                                    *
 **************************************************************/
module.exports = {
  processNotionPage
};