require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';

const TOKENS_FILE = path.join(__dirname, 'tokens.json');

// Load stored tokens from file
function loadStoredTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = fs.readFileSync(TOKENS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading stored tokens:', error.message);
  }
  return null;
}

// Save tokens to file
function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
    console.log('[Tokens] Saved to tokens.json');
  } catch (error) {
    console.error('Error saving tokens:', error.message);
  }
}

// Generate authorization URL for user to visit
function getAuthorizationUrl() {
  const authUrl = 'https://appcenter.intuit.com/connect/oauth2';
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: REDIRECT_URI,
    state: 'security_token_' + Date.now()
  });

  const fullUrl = `${authUrl}?${params.toString()}`;
  console.log('\n[Auth] Please visit this URL to authorize:');
  console.log(fullUrl);
  return fullUrl;
}

// Exchange authorization code for access token
async function getAccessToken(authorizationCode, realmId = null) {
  try {
    console.log('[Auth] Exchanging authorization code for access token...');
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const tokens = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      realmId: realmId, // Passed from callback or user input
      expiresAt: Date.now() + (response.data.expires_in * 1000),
      obtainedAt: new Date().toISOString()
    };

    saveTokens(tokens);
    console.log('[Auth] Access token obtained successfully');
    return tokens;
  } catch (error) {
    console.error('[Auth Error] Failed to get access token');
    console.error('Status:', error.response?.status);
    console.error('URL:', error.config?.url);
    console.error('Response:', error.response?.data);
    console.error('Message:', error.message);
    throw error;
  }
}

// Refresh access token
async function refreshAccessToken(refreshToken) {
  try {
    console.log('[Auth] Refreshing access token...');
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const tokens = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + (response.data.expires_in * 1000),
      obtainedAt: new Date().toISOString()
    };

    saveTokens(tokens);
    console.log('[Auth] Token refreshed successfully');
    return tokens;
  } catch (error) {
    console.error('[Auth Error] Failed to refresh token:', error.response?.data || error.message);
    throw error;
  }
}

// Get valid access token (refresh if needed)
async function getValidAccessToken() {
  let tokens = loadStoredTokens();

  if (!tokens) {
    console.log('[Auth] No stored tokens found. Please run authorization first.');
    return null;
  }

  // Check if token is expired or expiring soon (within 5 minutes)
  if (Date.now() + (5 * 60 * 1000) > tokens.expiresAt) {
    console.log('[Auth] Token expired or expiring soon, refreshing...');
    tokens = await refreshAccessToken(tokens.refreshToken);
  }

  return tokens.accessToken;
}

module.exports = {
  getAuthorizationUrl,
  getAccessToken,
  refreshAccessToken,
  getValidAccessToken,
  loadStoredTokens,
  REDIRECT_URI
};
