import { WalletService } from './walletService';

const address = '1111' + 'a'.repeat(50);
const originalFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});
afterEach(() => { global.fetch = originalFetch; });

function nodeResponses(expr: unknown, decimals?: number) {
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => url.endsWith('/api/explore-deploy') ? { expr: [expr] }
      : url.endsWith('/api/status') ? { nativeTokenDecimals: decimals }
      : { data: { deployments: [] } },
  }));
}

test.each([8, 10, 18])('displays BigInt wallet balances at node precision %i', async decimals => {
  nodeResponses({ ExprBigInt: { data: (10n ** BigInt(decimals) + 1n).toString() } }, decimals);
  const wallet = await WalletService.getWalletBalance(address);
  expect(wallet.balance.dust).toBe(10n ** BigInt(decimals) + 1n);
  expect(wallet.balance.asi).toBe('1.' + '0'.repeat(decimals - 1) + '1');
});

test('retains exact uint256 raw units', async () => {
  const raw = 2n ** 256n - 1n;
  nodeResponses({ ExprBigInt: { data: raw.toString() } }, 18);
  const wallet = await WalletService.getWalletBalance(address);
  expect(wallet.balance.dust).toBe(raw);
  expect(wallet.balance.asi.replace('.', '')).toBe(raw.toString());
});

test('reads legacy ExprInt and metadata-free nodes with eight decimals', async () => {
  nodeResponses({ ExprInt: { data: 123456789 } });
  expect((await WalletService.getWalletBalance(address)).balance.asi).toBe('1.23456789');
  nodeResponses({ ExprInt: { data: 0 } });
  expect((await WalletService.getWalletBalance(address)).balance.dust).toBe(0n);
});

test('rejects unsafe legacy numbers and malformed balances', async () => {
  nodeResponses({ ExprInt: { data: Number.MAX_SAFE_INTEGER + 1 } }, 8);
  await expect(WalletService.getWalletBalance(address)).rejects.toThrow('Unsafe integer');
  nodeResponses({ ExprBigInt: { data: '1e18' } }, 18);
  await expect(WalletService.getWalletBalance(address)).rejects.toThrow('Invalid raw amount');
  nodeResponses({ ExprInt: { data: 1 } }, 78);
  await expect(WalletService.getWalletBalance(address)).rejects.toThrow('Invalid token decimals');
});
