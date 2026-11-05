import { rawInteger, formatRaw, decimalText, LEGACY_DECIMALS } from "./amounts";
/**
 * Utility to parse genesis wallet funding from AsiGenerator deployment
 */

import { CURRENT_TOKEN } from "./constants";

export interface GenesisFunding {
  wallet_address: string;
  amount_dust: string;
  amount_asi: string;
  status: 'genesis_funding';
  timestamp: number;
  deploy_id: string;
}

/**
 * Parses the genesis deployment term to extract wallet funding information
 */
export function parseGenesisFunding(deploymentTerm: string, deployId: string, timestamp: number, decimals = LEGACY_DECIMALS): GenesisFunding[] {
  const fundings: GenesisFunding[] = [];
  
  try {
    // Look for the match pattern with wallet addresses and amounts
    // Pattern: match [("address1", amount1), ("address2", amount2), ...]
    const matchRegex = /match\s*\[\s*(?:\("([^"]+)",\s*(\d+)n?\)(?:\s*,\s*)?)+\s*\]/g;
    const match = matchRegex.exec(deploymentTerm);
    
    if (match) {
      // Extract individual wallet funding entries
      const entryRegex = /\("([^"]+)",\s*(\d+)n?\)/g;
      let entryMatch;
      
      while ((entryMatch = entryRegex.exec(deploymentTerm)) !== null) {
        const walletAddress = entryMatch[1];
        const amountDust = rawInteger(entryMatch[2]).toString();
        const amountAsi = formatRaw(amountDust, decimals);
        
        fundings.push({
          wallet_address: walletAddress,
          amount_dust: amountDust,
          amount_asi: amountAsi,
          status: 'genesis_funding',
          timestamp,
          deploy_id: deployId
        });
      }
    }
  } catch (error) {
    console.error('Error parsing genesis funding:', error);
  }
  
  return fundings;
}

/**
 * Formats genesis funding amount for display
 */
export function formatGenesisFunding(amount: string | number): string {
  return decimalText(amount) + ` ${CURRENT_TOKEN}`;
}

/**
 * Known genesis deployment ID containing wallet funding data
 */
export const GENESIS_FUNDING_DEPLOY_ID = "3045022100f39285089f6e50247620e71b79161ddc371c94e453f6bc12afd78bfe857640dd0220614965bda9c405816d6b5c7af9ad415149593a08e763835b621769059402524e";