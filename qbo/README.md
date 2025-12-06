# QBO Sample Files

This folder contains sample QBO (QuickBooks Web Connect) files for testing transaction parsing and categorization.

## Files

### `sample-transactions-dec2025.qbo`
- **Account Type:** Checking
- **Date Range:** Nov 1 - Dec 5, 2025
- **Transaction Count:** 12
- **Mix:** Operating expenses, software subscriptions, and revenue transactions
- **Sample Transactions:**
  - Recurring subscriptions (GitHub, AWS, Slack)
  - Office supplies and meals
  - Wire fees
  - Customer payments (3 revenue transactions)
  - Software tools

### `sample-payroll-nov2025.qbo`
- **Account Type:** Checking
- **Date Range:** Nov 1 - 30, 2025
- **Transaction Count:** 10
- **Mix:** Payroll processing, insurance, taxes, and consulting revenue
- **Sample Transactions:**
  - Weekly payroll runs (4x)
  - Payroll taxes (IRS payment)
  - Employee health insurance
  - Rent and utilities
  - Client invoices for services

## File Format

All files use the **OFX (Open Financial Exchange) XML format**, which is the standard for QBO files. Structure:

```
<OFX>
  <SIGNONMSGSRSV1>        // Server response
  <BANKMSGSRSV1>          // Bank transaction messages
    <STMTTRNRS>           // Statement transaction response
      <BANKTRANLIST>      // Transaction list
        <STMTTRN>         // Individual transaction
          <TRNTYPE>       // DEBIT or CREDIT
          <DTPOSTED>      // YYYYMMDD format
          <TRNAMT>        // Transaction amount
          <FITID>         // Unique transaction ID
          <NAME>          // Payee/merchant
          <MEMO>          // Transaction description
        </STMTTRN>
        ...
      </BANKTRANLIST>
      <LEDGERBAL>         // Account balance
    </STMTRS>
  </BANKMSGSRSV1>
</OFX>
```

## Parsing

Use these files to test your QBO parser with:

1. **XML parsing** (recommended): Use `xml2js` or similar library
2. **Regex parsing** (quick): Extract transaction blocks with regex
3. **Manual parsing**: Line-by-line extraction

See [../../../qbo-transaction-research.md](../../../qbo-transaction-research.md) for detailed parsing strategy.
