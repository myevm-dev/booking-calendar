import { createWalletClient, custom, parseUnits } from "viem";
import { base } from "viem/chains";

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

async function ensureBaseChain(ethereum: NonNullable<Window["ethereum"]>) {
  const walletClient = createWalletClient({
    chain: base,
    transport: custom(ethereum),
  });

  const chainId = await walletClient.getChainId();
  if (chainId === base.id) return;

  try {
    await walletClient.switchChain({ id: base.id });
  } catch (err: any) {
    // If Base isn't added yet in the wallet, add it then switch.
    // 4902 = "Unrecognized chain" in many wallets.
    if (err?.code === 4902) {
      await ethereum.request?.({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${base.id.toString(16)}`,
            chainName: base.name,
            nativeCurrency: base.nativeCurrency,
            rpcUrls: base.rpcUrls.default.http,
            blockExplorerUrls: [base.blockExplorers.default.url],
          },
        ],
      });
      await walletClient.switchChain({ id: base.id });
      return;
    }
    throw err;
  }
}

export async function payUsdcOnBase(args: {
  usdc: `0x${string}`;
  to: `0x${string}`;
  amount: number; // ex: 0.1
}) {
  if (typeof window === "undefined") {
    throw new Error("payUsdcOnBase must be called in the browser.");
  }

  if (!window.ethereum) {
    throw new Error("No wallet extension detected (MetaMask/Coinbase Wallet).");
  }

  await ensureBaseChain(window.ethereum);

  const walletClient = createWalletClient({
    chain: base,
    transport: custom(window.ethereum),
  });

  const [account] = await walletClient.getAddresses();

  const hash = await walletClient.writeContract({
    address: args.usdc,
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [args.to, parseUnits(String(args.amount), 6)], // USDC = 6 decimals
    account,
  });

  return { hash, account };
}
