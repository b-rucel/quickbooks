#!/usr/bin/env node

require('dotenv').config();
const readline = require('readline');
const auth = require('./auth');
const api = require('./api');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt user for input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Display menu
async function showMenu() {
  console.log('\n=== QuickBooks API Integration ===');
  console.log('1. Authorize with QuickBooks');
  console.log('2. Get Company Info');
  console.log('3. Get All Customers');
  console.log('4. Get Customer by ID');
  console.log('5. Get All Invoices');
  console.log('6. View API History (Chat)');
  console.log('7. Exit');
  console.log('===================================\n');

  const choice = await prompt('Select an option (1-7): ');
  return choice.trim();
}

// Main application
async function main() {
  console.log('QuickBooks API Integration Script\n');

  let accessToken = null;
  let realmId = null;

  // Try to load existing tokens
  const tokens = auth.loadStoredTokens();
  if (tokens) {
    accessToken = await auth.getValidAccessToken();
    realmId = process.env.REALM_ID || tokens.realmId;
    if (accessToken) {
      console.log('[Info] Using stored authentication\n');
    }
  }

  let running = true;

  while (running) {
    const choice = await showMenu();

    switch (choice) {
      case '1': // Authorize
        try {
          const authUrl = auth.getAuthorizationUrl();
          const code = await prompt('\nEnter the authorization code from the callback URL: ');

          if (code.trim()) {
            // Get realm ID from user first
            realmId = await prompt('Enter your Realm ID (Company ID): ');

            if (realmId.trim()) {
              const tokens = await auth.getAccessToken(code.trim(), realmId.trim());
              accessToken = tokens.accessToken;
              console.log('[Success] Authorization complete!\n');
            } else {
              console.log('[Error] Realm ID is required\n');
            }
          }
        } catch (error) {
          console.error('[Error] Authorization failed\n');
        }
        break;

      case '2': // Get Company Info
        if (!accessToken || !realmId) {
          console.log('[Error] Please authorize first (option 1)\n');
        } else {
          try {
            const info = await api.getCompanyInfo(accessToken, realmId);
            console.log('\n[Company Info]');
            console.log(JSON.stringify(info, null, 2));
            console.log();
          } catch (error) {
            console.log('[Error] Failed to get company info\n');
          }
        }
        break;

      case '3': // Get Customers
        if (!accessToken || !realmId) {
          console.log('[Error] Please authorize first (option 1)\n');
        } else {
          try {
            const result = await api.getCustomers(accessToken, realmId);
            console.log('\n[Customers]');
            if (result.QueryResponse && result.QueryResponse.Customer) {
              console.log(`Found ${result.QueryResponse.Customer.length} customers`);
              result.QueryResponse.Customer.forEach((customer, index) => {
                console.log(`${index + 1}. ${customer.DisplayName} (ID: ${customer.Id})`);
              });
            } else {
              console.log('No customers found');
            }
            console.log();
          } catch (error) {
            console.log('[Error] Failed to get customers\n');
          }
        }
        break;

      case '4': // Get Customer by ID
        if (!accessToken || !realmId) {
          console.log('[Error] Please authorize first (option 1)\n');
        } else {
          try {
            const customerId = await prompt('Enter Customer ID: ');
            const result = await api.getCustomerById(accessToken, realmId, customerId.trim());
            console.log('\n[Customer Details]');
            if (result.QueryResponse && result.QueryResponse.Customer && result.QueryResponse.Customer.length > 0) {
              console.log(JSON.stringify(result.QueryResponse.Customer[0], null, 2));
            } else {
              console.log('Customer not found');
            }
            console.log();
          } catch (error) {
            console.log('[Error] Failed to get customer\n');
          }
        }
        break;

      case '5': // Get Invoices
        if (!accessToken || !realmId) {
          console.log('[Error] Please authorize first (option 1)\n');
        } else {
          try {
            const result = await api.getInvoices(accessToken, realmId);
            console.log('\n[Invoices]');
            if (result.QueryResponse && result.QueryResponse.Invoice) {
              console.log(`Found ${result.QueryResponse.Invoice.length} invoices`);
              result.QueryResponse.Invoice.forEach((invoice, index) => {
                console.log(`${index + 1}. ${invoice.DocNumber} - ${invoice.CustomerRef.name} ($${invoice.TotalAmt})`);
              });
            } else {
              console.log('No invoices found');
            }
            console.log();
          } catch (error) {
            console.log('[Error] Failed to get invoices\n');
          }
        }
        break;

      case '6': // View API History
        try {
          const history = api.getChatHistory(10);
          if (history.length === 0) {
            console.log('\n[API History] No requests yet\n');
          } else {
            console.log('\n[API History] (Last 10 requests)\n');
            history.forEach((entry, index) => {
              console.log(`${index + 1}. [${entry.timestamp}] ${entry.method} ${entry.endpoint}`);
              console.log(`   Status: ${entry.status}`);
              if (entry.error) {
                console.log(`   Error: ${entry.error.message}`);
              }
              console.log();
            });
          }
        } catch (error) {
          console.log('[Error] Failed to load history\n');
        }
        break;

      case '7': // Exit
        console.log('Goodbye!\n');
        running = false;
        break;

      default:
        console.log('[Error] Invalid option\n');
    }
  }

  rl.close();
}

// Run main application
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
