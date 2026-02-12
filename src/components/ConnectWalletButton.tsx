"use client";

import { useState } from "react";

export default function ConnectWalletButton() {
  const [account, setAccount] = useState<string | null>(null);

  async function connect() {
    if (!window.ethereum) {
      alert("Install MetaMask or Coinbase Wallet extension.");
      return;
    }

    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    setAccount(accounts[0]);
  }

  return (
    <button
      onClick={connect}
      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition text-white text-sm"
    >
      {account
        ? `${account.slice(0, 6)}...${account.slice(-4)}`
        : "Connect Wallet"}
    </button>
  );
}
