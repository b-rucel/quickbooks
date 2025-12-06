const fs = require('fs');

/**
 * Parse a QBO (OFXSGML) file into JSON
 */
function parseQBO(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Normalize line endings and tabs
  let lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, '    ')
    .split('\n');

  // Skip QBO header lines (everything before first <)
  const firstTagIdx = lines.findIndex(line => line.trim().startsWith('<'));
  if (firstTagIdx > 0) {
    lines = lines.slice(firstTagIdx);
  }

  // Check if this is indented SGML or compact XML
  // If average tags per line is high, it's probably compact XML
  const avgTagsPerLine = content.split('<').length / lines.length;

  if (avgTagsPerLine > 10) {
    // Compact XML - format it first
    lines = formatCompactXML(lines);
  }

  // Parse into nested structure
  const result = parseLines(lines);
  return result;
}

/**
 * Format compact XML (all tags on few lines) into proper indentation
 */
function formatCompactXML(lines) {
  const xml = lines.join('\n');
  const formatted = [];
  let indent = 0;

  let i = 0;
  while (i < xml.length) {
    if (xml[i] === '<') {
      // Find end of tag
      const tagEnd = xml.indexOf('>', i);
      const tag = xml.substring(i, tagEnd + 1);

      if (tag.startsWith('</')) {
        // Closing tag
        indent = Math.max(0, indent - 1);
        formatted.push(' '.repeat(indent * 2) + tag);
        i = tagEnd + 1;
      } else if (tag.endsWith('/>')) {
        // Self-closing tag
        formatted.push(' '.repeat(indent * 2) + tag);
        i = tagEnd + 1;
      } else {
        // Opening tag - check if it has inline content
        const tagName = tag.match(/<(\w+[\w\.]*)/)[1];
        const closeTag = '</' + tagName + '>';
        const closeIdx = xml.indexOf(closeTag, tagEnd);

        if (closeIdx !== -1) {
          // Has content before close tag
          const content = xml.substring(tagEnd + 1, closeIdx);

          if (content && !content.includes('<')) {
            // Content is simple text - format as <TAG>VALUE followed by </TAG>
            formatted.push(' '.repeat(indent * 2) + tag + content);
            formatted.push(' '.repeat(indent * 2) + closeTag);
            i = closeIdx + closeTag.length;
          } else {
            // Content has nested tags
            formatted.push(' '.repeat(indent * 2) + tag);
            indent++;
            i = tagEnd + 1;
          }
        } else {
          // No closing tag found, just add opening tag
          formatted.push(' '.repeat(indent * 2) + tag);
          indent++;
          i = tagEnd + 1;
        }
      }
    } else {
      i++;
    }
  }

  return formatted;
}

/**
 * Parse lines into a nested object structure based on indentation
 */
function parseLines(lines) {
  const stack = [{ level: 0, name: 'root', children: {} }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) continue;

    // Parse closing tag - pop matching tag from stack
    const closeMatch = trimmed.match(/^<\/(\w+[\w\.]*)>$/);
    if (closeMatch) {
      const tagName = closeMatch[1];
      // Find and pop the matching tag
      for (let j = stack.length - 1; j > 0; j--) {
        if (stack[j].name === tagName) {
          stack.splice(j, 1);
          break;
        }
      }
      continue;
    }

    // Parse opening tag with optional value: <TAG>VALUE or <TAG>
    const openMatch = trimmed.match(/^<(\w+[\w\.]*)>(.*)$/);
    if (openMatch) {
      const tagName = openMatch[1];
      const value = openMatch[2];
      const parent = stack[stack.length - 1];

      if (value) {
        // Tag with a value - store it directly
        if (!parent.children[tagName]) {
          parent.children[tagName] = [];
        }
        parent.children[tagName].push(value);
      } else {
        // Empty tag - will have children
        const newObj = { name: tagName, children: {} };

        if (!parent.children[tagName]) {
          parent.children[tagName] = [];
        }
        parent.children[tagName].push(newObj.children);

        stack.push(newObj);
      }
    }
  }

  return stack[0].children;
}

/**
 * Extract transactions from parsed QBO structure
 */
function extractTransactions(qboData) {
  const transactions = [];

  // Navigate to the credit card statement if present
  let stmtrs = null;

  // Try credit card path
  if (qboData.CREDITCARDMSGSRSV1?.[0]?.CCSTMTTRNRS?.[0]?.CCSTMTRS?.[0]) {
    stmtrs = qboData.CREDITCARDMSGSRSV1[0].CCSTMTTRNRS[0].CCSTMTRS[0];
  }
  // Try bank statement path
  else if (qboData.BANKMSGSRSV1?.[0]?.STMTTRNRS?.[0]?.STMTRS?.[0]) {
    stmtrs = qboData.BANKMSGSRSV1[0].STMTTRNRS[0].STMTRS[0];
  }

  if (!stmtrs) {
    throw new Error('Could not find statement in QBO file');
  }

  // Get transactions
  const tranList = stmtrs.BANKTRANLIST?.[0];
  if (!tranList || !tranList.STMTTRN) {
    return transactions;
  }

  const stmtTrns = Array.isArray(tranList.STMTTRN) ? tranList.STMTTRN : [tranList.STMTTRN];

  for (const trn of stmtTrns) {
    const transaction = {
      id: trn.FITID?.[0] || '',
      type: trn.TRNTYPE?.[0] || '',
      date: trn.DTPOSTED?.[0] || '',
      amount: parseFloat(trn.TRNAMT?.[0] || 0),
      payee: trn.NAME?.[0] || '',
      memo: trn.MEMO?.[0] || '',
      category: trn.EXPCAT?.[0] || '',
      merchantCategory: trn.MERCHCAT?.[0] || ''
    };

    transactions.push(transaction);
  }

  return transactions;
}

/**
 * Format transaction data for display
 */
function formatTransactions(transactions) {
  console.log('\n' + '='.repeat(80));
  console.log('QBO TRANSACTIONS');
  console.log('='.repeat(80));
  console.log(`Total transactions: ${transactions.length}\n`);

  for (const txn of transactions) {
    const sign = parseFloat(txn.amount) >= 0 ? '+' : '';
    console.log(`[${txn.date}] ${sign}$${txn.amount.toFixed(2)} | ${txn.payee}`);
    console.log(`  Type: ${txn.type} | Category: ${txn.category}`);
    console.log(`  ID: ${txn.id}`);
    if (txn.memo) console.log(`  Memo: ${txn.memo}`);
    console.log('');
  }

  console.log('='.repeat(80) + '\n');
}

module.exports = {
  parseQBO,
  parseLines,
  extractTransactions,
  formatTransactions
};
