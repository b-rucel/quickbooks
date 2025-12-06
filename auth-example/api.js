const axios = require('axios');
const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, 'api-history.json');

// Load API history
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading history:', error.message);
  }
  return [];
}

// Save API history
function saveHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('Error saving history:', error.message);
  }
}

// Log API request/response
function logRequest(method, endpoint, status, requestData, responseData, error = null) {
  const history = loadHistory();

  const entry = {
    timestamp: new Date().toISOString(),
    method,
    endpoint,
    status: status || (error ? 'error' : 'pending'),
    request: {
      method,
      url: endpoint,
      data: requestData
    },
    response: {
      status: status,
      data: responseData
    },
    error: error ? {
      message: error.message,
      code: error.code,
      response: error.response?.data
    } : null
  };

  history.push(entry);

  // Keep only last 100 entries
  if (history.length > 100) {
    history.shift();
  }

  saveHistory(history);

  return entry;
}

// Get chat history
function getChatHistory(limit = 20) {
  const history = loadHistory();
  return history.slice(-limit);
}

// Make QuickBooks API request
async function makeQBRequest(accessToken, realmId, endpoint, method = 'GET', data = null) {
  const apiBase = 'https://sandbox-quickbooks.api.intuit.com/v3/company';
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${apiBase}/${realmId}/${endpoint}${separator}minorversion=73`;

  const config = {
    method,
    url,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };

  if (data) {
    config.data = data;
  }

  try {
    console.log(`[API] ${method} ${endpoint}`);
    const response = await axios(config);

    logRequest(method, endpoint, response.status, data, response.data);
    console.log(`[API] Response: ${response.status} OK`);

    return response.data;
  } catch (error) {
    const status = error.response?.status || 'error';
    logRequest(method, endpoint, status, data, null, error);
    console.error(`[API Error] ${status} - ${error.message}`);
    throw error;
  }
}

// Query endpoint (for SELECT queries)
async function query(accessToken, realmId, queryString) {
  const endpoint = `query?query=${encodeURIComponent(queryString)}`;
  return makeQBRequest(accessToken, realmId, endpoint, 'GET');
}

// Get company info
async function getCompanyInfo(accessToken, realmId) {
  const apiBase = 'https://sandbox-quickbooks.api.intuit.com/v3/company';
  const url = `${apiBase}/${realmId}/companyinfo/${realmId}?minorversion=73`;

  try {
    console.log(`[API] GET companyinfo/${realmId}`);
    console.log(`[API] Using RealmId: ${realmId}`);
    console.log(`[API] Token starts with: ${accessToken.substring(0, 20)}...`);

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    logRequest('GET', `companyinfo/${realmId}`, response.status, null, response.data);
    console.log(`[API] Response: ${response.status} OK`);
    return response.data;
  } catch (error) {
    const status = error.response?.status || 'error';
    logRequest('GET', `companyinfo/${realmId}`, status, null, null, error);
    console.error(`[API Error] ${status} - ${error.message}`);
    if (error.response?.data) {
      console.error('[API Error Details]', error.response.data);
    }
    throw error;
  }
}

// Get all customers
async function getCustomers(accessToken, realmId) {
  const queryString = 'SELECT * FROM Customer';
  return query(accessToken, realmId, queryString);
}

// Get customer by ID
async function getCustomerById(accessToken, realmId, customerId) {
  const queryString = `SELECT * FROM Customer WHERE Id='${customerId}'`;
  return query(accessToken, realmId, queryString);
}

// Create invoice
async function createInvoice(accessToken, realmId, invoiceData) {
  const endpoint = 'invoice';
  return makeQBRequest(accessToken, realmId, endpoint, 'POST', invoiceData);
}

// Get invoices
async function getInvoices(accessToken, realmId, customerId = null) {
  let queryString = 'SELECT * FROM Invoice';
  if (customerId) {
    queryString += ` WHERE CustomerRef='${customerId}'`;
  }
  return query(accessToken, realmId, queryString);
}

// Retry logic with exponential backoff
async function makeQBRequestWithRetry(accessToken, realmId, endpoint, method = 'GET', data = null, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await makeQBRequest(accessToken, realmId, endpoint, method, data);
    } catch (error) {
      const status = error.response?.status;

      // Retry on rate limit or server errors
      if ((status === 429 || status >= 500) && attempt < maxRetries - 1) {
        const delayMs = Math.pow(2, attempt) * 1000;
        console.log(`[API] Retry attempt ${attempt + 1} after ${delayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw error;
      }
    }
  }
}

module.exports = {
  makeQBRequest,
  makeQBRequestWithRetry,
  query,
  getCompanyInfo,
  getCustomers,
  getCustomerById,
  createInvoice,
  getInvoices,
  getChatHistory,
  loadHistory
};
