const fs = require('fs');
const { parseQBO } = require('./qbo.parser');

/**
 * Extract transactions from parsed QBO data
 */
function extractTransactions(qboData) {
  const transactions = [];

  // Navigate to OFX root
  const ofx = qboData.OFX?.[0];
  if (!ofx) {
    throw new Error('Could not find OFX root in QBO file');
  }

  // Navigate to the statement (credit card or bank)
  let stmtrs = null;

  // Try credit card path first
  if (ofx.CREDITCARDMSGSRSV1?.[0]?.CCSTMTTRNRS?.[0]?.CCSTMTRS?.[0]) {
    stmtrs = ofx.CREDITCARDMSGSRSV1[0].CCSTMTTRNRS[0].CCSTMTRS[0];
  }
  // Try bank path
  else if (ofx.BANKMSGSRSV1?.[0]?.STMTTRNRS?.[0]?.STMTRS?.[0]) {
    stmtrs = ofx.BANKMSGSRSV1[0].STMTTRNRS[0].STMTRS[0];
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

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const filePath = args[0];

  if (!filePath) {
    console.error('Usage: node read.js <qbo-file>');
    process.exit(1);
  }

  try {
    console.log(`Parsing QBO file: ${filePath}`);
    const qboData = parseQBO(filePath);

    // Save full parsed data
    const jsonPath = filePath.replace('.qbo', '-parsed.json');
    fs.writeFileSync(jsonPath, JSON.stringify(qboData, null, 2));
    console.log(`Full QBO data saved to: ${jsonPath}`);

    // Extract and display transactions
    const transactions = extractTransactions(qboData);
    formatTransactions(transactions);

    // Save transactions as JSON
    const txnPath = filePath.replace('.qbo', '-transactions.json');
    fs.writeFileSync(txnPath, JSON.stringify(transactions, null, 2));
    console.log(`Transactions saved to: ${txnPath}`);

  } catch (error) {
    console.error('Error parsing QBO file:', error.message);
    process.exit(1);
  }
}

// Export functions
module.exports = {
  extractTransactions,
  formatTransactions
};

// Run if called directly
if (require.main === module) {
  main();
}
