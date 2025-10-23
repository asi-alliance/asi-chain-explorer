#!/usr/bin/env python3
"""Analyze all ASI transfers via GraphQL."""

import json
import requests
from collections import defaultdict

# GraphQL endpoint
url = "http://localhost:8080/v1/graphql"
headers = {
    "Content-Type": "application/json",
    "x-hasura-admin-secret": "myadminsecretkey"
}

# Fetch all transfers
query = """
{
  transfers(order_by: {block_number: asc}) {
    deploy_id
    block_number
    from_address
    to_address
    amount_dust
    amount_asi
    status
  }
  transfers_aggregate {
    aggregate {
      count
      sum { amount_asi }
    }
  }
}
"""

response = requests.post(url, json={"query": query}, headers=headers)
data = response.json()["data"]

transfers = data["transfers"]
aggregate = data["transfers_aggregate"]["aggregate"]

print("=" * 80)
print("ASI-CHAIN ASI TRANSFER ANALYSIS - COMPLETE REPORT")
print("=" * 80)
print()

# Summary
print("📊 OVERALL STATISTICS:")
print(f"  • Total Transfers: {aggregate['count']}")
print(f"  • Total ASI Moved: {float(aggregate['sum']['amount_asi']):,.2f} ASI")
print()

# Separate by type
genesis_transfers = [t for t in transfers if t["block_number"] == "0"]
user_transfers = [t for t in transfers if t["block_number"] != "0"]

print("🏛️ GENESIS TRANSFERS (Validator Bonds):")
print(f"  • Count: {len(genesis_transfers)}")
genesis_total = sum(float(t["amount_asi"]) for t in genesis_transfers)
print(f"  • Total: {genesis_total:,.0f} ASI")
for i, t in enumerate(genesis_transfers, 1):
    print(f"    {i}. {t['from_address'][:20]}... → PoS Vault: {float(t['amount_asi']):,.0f} ASI")
print()

print("💸 USER TRANSFERS:")
print(f"  • Count: {len(user_transfers)}")
user_total = sum(float(t["amount_asi"]) for t in user_transfers)
print(f"  • Total: {user_total:,.0f} ASI")
print()

print("  Details:")
for t in user_transfers:
    from_addr = t['from_address'][:30] + "..." if len(t['from_address']) > 33 else t['from_address']
    to_addr = t['to_address'][:30] + "..." if len(t['to_address']) > 33 else t['to_address']
    print(f"    Block {t['block_number']:>3}: {float(t['amount_asi']):>10,.0f} ASI")
    print(f"             From: {from_addr}")
    print(f"             To:   {to_addr}")
    print()

# Address analysis
print("📍 ADDRESS ANALYSIS (User Transfers Only):")
addresses = set()
for t in user_transfers:
    addresses.add(t['from_address'])
    addresses.add(t['to_address'])

print(f"  • Unique addresses: {len(addresses)}")
print()

# Calculate net flows
flows = defaultdict(float)
sent_count = defaultdict(int)
received_count = defaultdict(int)

for t in user_transfers:
    flows[t['from_address']] -= float(t['amount_asi'])
    flows[t['to_address']] += float(t['amount_asi'])
    sent_count[t['from_address']] += 1
    received_count[t['to_address']] += 1

print("  Net Balance Changes:")
for addr in sorted(addresses):
    display = addr[:35] + "..." if len(addr) > 38 else addr
    net = flows[addr]
    sent = sent_count[addr]
    received = received_count[addr]
    print(f"    {display}")
    print(f"      Sent: {sent} tx(s) | Received: {received} tx(s) | Net: {net:+,.0f} ASI")
print()

# Transfer patterns
print("🔄 TRANSFER PATTERNS:")
print(f"  • Blocks with transfers: {len(set(t['block_number'] for t in user_transfers))}")
print(f"  • Average user transfer: {user_total/len(user_transfers):,.2f} ASI")
print(f"  • Largest user transfer: {max(float(t['amount_asi']) for t in user_transfers):,.0f} ASI")
print(f"  • Smallest user transfer: {min(float(t['amount_asi']) for t in user_transfers):,.0f} ASI")

print()
print("=" * 80)
print("Report generated from ASI-Chain Indexer GraphQL API")
print("=" * 80)