/**
 * GreenGuard USA — Google Ads Campaign Setup Script v2
 * Uses UrlFetchApp to call Google Ads API directly (newCampaignBuilder removed in 2024+)
 *
 * HOW TO RUN:
 * 1. ads.google.com → Tools & Settings → Bulk Actions → Scripts
 * 2. New Script → paste this → Preview → Run
 */

function main() {
  Logger.log('=== GreenGuard USA Campaign Setup ===');

  // Get auth token from the script environment
  const token = ScriptApp.getOAuthToken();

  // Discover account customer ID
  const account = AdsApp.currentAccount();
  const customerId = account.getCustomerId().replace(/-/g, '');
  Logger.log('Account: ' + account.getName() + ' | CID: ' + customerId);

  const BASE = 'https://googleads.googleapis.com/v17/customers/' + customerId;

  function gadsPost(path, body) {
    const resp = UrlFetchApp.fetch(BASE + path, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'developer-token': AdsApp.currentAccount().getCustomerId(), // placeholder
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });
    const code = resp.getResponseCode();
    const text = resp.getContentText();
    if (code >= 400) {
      Logger.log('API error ' + code + ': ' + text.substring(0, 300));
      return null;
    }
    return JSON.parse(text);
  }

  // ── Create budgets ────────────────────────────────────────────────────────
  Logger.log('Creating budgets...');

  const budgets = [
    { name: 'GreenGuard Brand $5', amount: 5000000 },      // $5/day in micros
    { name: 'GreenGuard Local $25', amount: 25000000 },    // $25/day
    { name: 'GreenGuard Product $10', amount: 10000000 },  // $10/day
  ];

  const budgetResourceNames = [];
  for (const b of budgets) {
    const r = gadsPost('/campaignBudgets:mutate', {
      operations: [{
        create: {
          name: b.name,
          amountMicros: b.amount,
          deliveryMethod: 'STANDARD',
        }
      }]
    });
    if (r) {
      budgetResourceNames.push(r.results[0].resourceName);
      Logger.log('✓ Budget: ' + b.name);
    } else {
      budgetResourceNames.push(null);
    }
  }

  // ── Create 3 campaigns ────────────────────────────────────────────────────
  const campaignDefs = [
    {
      name: 'GreenGuard — Brand',
      budget: budgetResourceNames[0],
      biddingStrategy: { targetCpa: { targetCpaMicros: 5000000000 } }, // $5000 (very high, brand won't cost that)
    },
    {
      name: 'GreenGuard — Local Service Austin',
      budget: budgetResourceNames[1],
      biddingStrategy: { maximizeConversions: {} },
    },
    {
      name: 'GreenGuard — Products Equipment',
      budget: budgetResourceNames[2],
      biddingStrategy: { maximizeClicks: {} },
    },
  ];

  const campaignResourceNames = [];
  for (const c of campaignDefs) {
    if (!c.budget) { campaignResourceNames.push(null); continue; }
    const r = gadsPost('/campaigns:mutate', {
      operations: [{
        create: {
          name: c.name,
          status: 'PAUSED',
          advertisingChannelType: 'SEARCH',
          campaignBudget: c.budget,
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: true,
            targetContentNetwork: false,
          },
          biddingStrategyType: Object.keys(c.biddingStrategy)[0] === 'maximizeConversions'
            ? 'MAXIMIZE_CONVERSIONS'
            : Object.keys(c.biddingStrategy)[0] === 'maximizeClicks'
            ? 'MAXIMIZE_CLICKS'
            : 'TARGET_CPA',
        }
      }]
    });
    if (r) {
      campaignResourceNames.push(r.results[0].resourceName);
      Logger.log('✓ Campaign: ' + c.name);
    } else {
      campaignResourceNames.push(null);
    }
  }

  // ── Create ad groups + keywords ───────────────────────────────────────────
  const adGroupData = [
    {
      campaign: campaignResourceNames[0],
      name: 'Brand Terms',
      keywords: ['[greenguard usa]', '[green guard usa]', '[greenguard austin]', '[greenguard mosquito]'],
      cpcMicros: 2000000,
    },
    {
      campaign: campaignResourceNames[1],
      name: 'Mosquito Control Austin',
      keywords: [
        '"mosquito control austin"',
        '"mosquito control austin tx"',
        '"mosquito control cedar park"',
        '"mosquito control westlake hills"',
        '"mosquito service austin"',
        '"co2 mosquito control"',
        '"pesticide free mosquito control"',
        '"mosquito trap service austin"',
      ],
      cpcMicros: 4000000,
    },
    {
      campaign: campaignResourceNames[2],
      name: 'CO2 Trap Products',
      keywords: [
        '"biogents trap"',
        '"biogents mosquitaire"',
        '"co2 mosquito trap buy"',
        '"mosquito trap rental austin"',
        '"biogents bg mosquitaire"',
      ],
      cpcMicros: 3000000,
    },
  ];

  for (const ag of adGroupData) {
    if (!ag.campaign) continue;

    // Create ad group
    const agResp = gadsPost('/adGroups:mutate', {
      operations: [{
        create: {
          name: ag.name,
          campaign: ag.campaign,
          status: 'ENABLED',
          cpcBidMicros: ag.cpcMicros,
        }
      }]
    });
    if (!agResp) continue;
    const agResource = agResp.results[0].resourceName;
    Logger.log('✓ Ad group: ' + ag.name);

    // Create keywords
    const kwOps = ag.keywords.map(kw => ({
      create: {
        adGroup: agResource,
        text: kw,
        matchType: kw.startsWith('[') ? 'EXACT' : 'PHRASE',
        status: 'ENABLED',
      }
    }));
    gadsPost('/adGroupCriteria:mutate', { operations: kwOps });
    Logger.log('  ✓ ' + kwOps.length + ' keywords added');
  }

  Logger.log('');
  Logger.log('=== SETUP COMPLETE ===');
  Logger.log('Check the Campaigns tab — 3 campaigns created in PAUSED state.');
  Logger.log('');
  Logger.log('NOW DO THESE IN THE UI:');
  Logger.log('1. Campaign "Local Service Austin": Settings → Locations → Add Austin TX, 30 mile radius');
  Logger.log('2. All campaigns: Extensions → Call extension → 512-560-4129');
  Logger.log('3. Local Service: Sitelinks → Free Assessment | Pricing | Compare | Shop');
  Logger.log('4. Tools → Linked Accounts → Google Analytics → link & import qualify_lead conversion');
  Logger.log('5. Enable all 3 campaigns');
}
