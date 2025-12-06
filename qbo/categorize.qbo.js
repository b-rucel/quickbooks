const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

/**
 * Categorization rules based on payee name and memo patterns
 */
const CATEGORIZATION_RULES = [
  // Revenue transactions
  { pattern: /invoice|payment received|retainer|revenue/i, category: 'REVENUE', type: 'SALES' },
  { pattern: /consulting|services|contract/i, category: 'REVENUE', type: 'SERVICE_REVENUE' },
  { pattern: /interest|earnings/i, category: 'REVENUE', type: 'INTEREST_INCOME' },
  { pattern: /refund|credit memo|return/i, category: 'REVENUE', type: 'REFUND_REVERSE' },

  // Operating expenses
  { pattern: /subscription|software|saas|cloud|online/i, category: 'EXPENSE', type: 'OPERATING_EXPENSE' },
  { pattern: /office|supplies|staples|paper|toner|equipment/i, category: 'EXPENSE', type: 'OPERATING_EXPENSE' },
  { pattern: /utilities|internet|phone|comcast|broadband/i, category: 'EXPENSE', type: 'OPERATING_EXPENSE' },
  { pattern: /maintenance|service|repair/i, category: 'EXPENSE', type: 'OPERATING_EXPENSE' },

  // Travel & entertainment
  { pattern: /hotel|airbnb|accommodation|lodging/i, category: 'EXPENSE', type: 'OPERATING_EXPENSE' },
  { pattern: /airline|delta|united|southwest|flight|travel/i, category: 'EXPENSE', type: 'OPERATING_EXPENSE' },
  { pattern: /uber|taxi|transportation|transit|parking/i, category: 'EXPENSE', type: 'OPERATING_EXPENSE' },
  { pattern: /restaurant|cafe|dining|meal|lunch|breakfast|dinner/i, category: 'EXPENSE', type: 'OPERATING_EXPENSE' },

  // Professional services
  { pattern: /shipping|fedex|ups|usps|delivery|courier/i, category: 'EXPENSE', type: 'OPERATING_EXPENSE' },
  { pattern: /linkedin|recruiter|recruitment|job posting/i, category: 'EXPENSE', type: 'OPERATING_EXPENSE' },
  { pattern: /bank|fee|charge|interest paid/i, category: 'EXPENSE', type: 'FEES' },

  // Payments & transfers
  { pattern: /credit card|payment|wire transfer|check/i, category: 'TRANSFER', type: 'LIABILITY_PAYMENT' },
];

/**
 * Categorize a transaction based on payee name and memo
 */
function categorizeTransaction(transaction) {
  const searchText = `${transaction.payee || ''} ${transaction.memo || ''}`;

  for (const rule of CATEGORIZATION_RULES) {
    if (rule.pattern.test(searchText)) {
      return {
        category: rule.category,
        type: rule.type
      };
    }
  }

  // Default categorization based on transaction type
  if (transaction.trntype === 'CREDIT') {
    return { category: 'REVENUE', type: 'SALES' };
  }
  return { category: 'EXPENSE', type: 'OPERATING_EXPENSE' };
}

/**
 * Normalize transaction from OFX to standard schema
 */
function normalizeTransaction(raw, accountInfo) {
  const dateStr = raw.DTPOSTED?.[0];
  const date = new Date(
    dateStr.substring(0, 4),
    parseInt(dateStr.substring(4, 6)) - 1,
    dateStr.substring(6, 8)
  );

  const transaction = {
    id: raw.FITID?.[0] || `TXN-${Date.now()}`,
    date: date.toISOString().split('T')[0],
    amount: parseFloat(raw.TRNAMT?.[0] || 0),
    currency: accountInfo.currency || 'USD',
    type: raw.TRNTYPE?.[0] || 'UNKNOWN',
    payee: raw.NAME?.[0] || 'Unknown',
    memo: raw.MEMO?.[0] || '',
    account_id: accountInfo.acctid || '',
    account_type: accountInfo.accttype || '',
    bank_id: accountInfo.bankid || '',
    source: 'QBO'
  };

  // Add categorization
  const categorization = categorizeTransaction(transaction);
  transaction.category = categorization.category;
  transaction.transaction_type = categorization.type;

  return transaction;
}

/**
 * Parse QBO file and return normalized transactions
 */
async function parseQBO(filePath) {
  let xmlContent = fs.readFileSync(filePath, 'utf8');

  // Remove QBO header lines (lines starting with !)
  let lines = xmlContent.split('\n');
  lines = lines.filter(line => !line.trim().startsWith('!'));
  xmlContent = lines.join('\n');

  const parser = new xml2js.Parser({
    explicitArray: true,
    trim: true
  });

  const result = await parser.parseStringPromise(xmlContent);

  const transactions = [];
  const ofx = result.OFX;

  // Extract account information
  const stmtrs = ofx.BANKMSGSRSV1?.[0]?.STMTTRNRS?.[0]?.STMTRS?.[0];
  if (!stmtrs) {
    throw new Error('Invalid QBO file format: Could not find statement');
  }

  const accountInfo = {
    currency: stmtrs.CURDEF?.[0] || 'USD',
    acctid: stmtrs.BANKACCTFROM?.[0]?.ACCTID?.[0] || '',
    accttype: stmtrs.BANKACCTFROM?.[0]?.ACCTTYPE?.[0] || '',
    bankid: stmtrs.BANKACCTFROM?.[0]?.BANKID?.[0] || ''
  };

  const balance = stmtrs.LEDGERBAL?.[0];
  const endingBalance = balance ? parseFloat(balance.BALAMT?.[0] || 0) : 0;

  // Extract transactions
  const tranList = stmtrs.BANKTRANLIST?.[0];
  if (tranList?.STMTTRN) {
    const stmtTrns = Array.isArray(tranList.STMTTRN) ? tranList.STMTTRN : [tranList.STMTTRN];

    for (const raw of stmtTrns) {
      const normalized = normalizeTransaction(raw, accountInfo);
      transactions.push(normalized);
    }
  }

  return {
    account: accountInfo,
    ending_balance: endingBalance,
    transaction_count: transactions.length,
    transactions
  };
}

/**
 * Group transactions by a specified dimension
 */
function groupTransactions(transactions, groupBy = 'category') {
  const grouped = {};

  for (const txn of transactions) {
    const key = txn[groupBy] || 'UNKNOWN';
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(txn);
  }

  return grouped;
}

/**
 * Calculate summary statistics
 */
function calculateSummary(transactions) {
  const summary = {
    total_transactions: transactions.length,
    total_debits: 0,
    total_credits: 0,
    by_category: {},
    by_type: {}
  };

  for (const txn of transactions) {
    if (txn.amount < 0) {
      summary.total_debits += Math.abs(txn.amount);
    } else {
      summary.total_credits += txn.amount;
    }

    // By category
    if (!summary.by_category[txn.category]) {
      summary.by_category[txn.category] = {
        count: 0,
        total: 0,
        transactions: []
      };
    }
    summary.by_category[txn.category].count++;
    summary.by_category[txn.category].total += txn.amount;
    summary.by_category[txn.category].transactions.push(txn);

    // By type
    if (!summary.by_type[txn.transaction_type]) {
      summary.by_type[txn.transaction_type] = {
        count: 0,
        total: 0,
        transactions: []
      };
    }
    summary.by_type[txn.transaction_type].count++;
    summary.by_type[txn.transaction_type].total += txn.amount;
    summary.by_type[txn.transaction_type].transactions.push(txn);
  }

  return summary;
}

/**
 * Format output for display
 */
function formatOutput(data) {
  console.log('\n' + '='.repeat(80));
  console.log('QBO FILE PARSING RESULTS');
  console.log('='.repeat(80));

  // Account info
  console.log('\nACCOUNT INFORMATION:');
  console.log(`  Bank ID: ${data.account.bankid}`);
  console.log(`  Account ID: ${data.account.acctid}`);
  console.log(`  Account Type: ${data.account.accttype}`);
  console.log(`  Currency: ${data.account.currency}`);
  console.log(`  Ending Balance: $${data.ending_balance.toFixed(2)}`);
  console.log(`  Total Transactions: ${data.transaction_count}`);

  // Calculate summary
  const summary = calculateSummary(data.transactions);

  // Summary by category
  console.log('\nSUMMARY BY CATEGORY:');
  console.log('-'.repeat(80));
  for (const [category, stats] of Object.entries(summary.by_category)) {
    console.log(`  ${category}:`);
    console.log(`    Count: ${stats.count}`);
    console.log(`    Total: $${stats.total.toFixed(2)}`);
  }

  // Summary by type
  console.log('\nSUMMARY BY TRANSACTION TYPE:');
  console.log('-'.repeat(80));
  for (const [type, stats] of Object.entries(summary.by_type)) {
    console.log(`  ${type}:`);
    console.log(`    Count: ${stats.count}`);
    console.log(`    Total: $${stats.total.toFixed(2)}`);
  }

  // Overall summary
  console.log('\nOVERALL SUMMARY:');
  console.log('-'.repeat(80));
  console.log(`  Total Debits (Expenses): $${summary.total_debits.toFixed(2)}`);
  console.log(`  Total Credits (Revenue): $${summary.total_credits.toFixed(2)}`);
  console.log(`  Net: $${(summary.total_credits - summary.total_debits).toFixed(2)}`);

  // Detailed transactions
  console.log('\nDETAILED TRANSACTIONS:');
  console.log('-'.repeat(80));

  for (const txn of data.transactions) {
    const sign = txn.amount >= 0 ? '+' : '';
    console.log(`  [${txn.date}] ${sign}$${txn.amount.toFixed(2)} | ${txn.payee}`);
    console.log(`    ID: ${txn.id}`);
    console.log(`    Category: ${txn.category} | Type: ${txn.transaction_type}`);
    console.log(`    Memo: ${txn.memo}`);
    console.log('');
  }

  console.log('='.repeat(80) + '\n');
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const filePath = args[0] || './sample-banking-oct2025.qbo';

  try {
    console.log(`Parsing QBO file: ${filePath}`);
    const data = await parseQBO(filePath);

    formatOutput(data);

    // Save JSON output
    const outputPath = filePath.replace('.qbo', '-parsed.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`Parsed data saved to: ${outputPath}`);

  } catch (error) {
    console.error('Error parsing QBO file:', error.message);
    process.exit(1);
  }
}

// Export functions for use as module
module.exports = {
  parseQBO,
  categorizeTransaction,
  normalizeTransaction,
  groupTransactions,
  calculateSummary,
  formatOutput
};

// Run if called directly
if (require.main === module) {
  main();
}
