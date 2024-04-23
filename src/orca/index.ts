import {
  MAX_SQRT_PRICE_BN,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
  SwapInput,
  SwapUtils,
  TickUtil,
  WhirlpoolContext,
  WhirlpoolIx,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
  toTx,
} from '@orca-so/whirlpools-sdk';
import { ZERO, MathUtil } from '@raydium-io/raydium-sdk';
import { Percentage, DecimalUtil } from '@orca-so/common-sdk';
import { solanaConnection, wallet } from '../solana';
import { Transaction, VersionedTransaction, PublicKey, Commitment } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

export type WalletFake = {
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
  publicKey: PublicKey;
};

const walletFake: WalletFake = {
  publicKey: wallet.publicKey,
  signTransaction: function <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    return new Promise((resolve) => setTimeout(resolve, 10));
  },
  signAllTransactions: function <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return new Promise((resolve) => setTimeout(resolve, 10));
  },
};

const getProvider = () => {
  const walletAnchor = new Wallet(wallet);
  const provider = new AnchorProvider(solanaConnection, walletAnchor, {
    commitment: process.env.COMMITMENT as Commitment,
  });
  return provider;
};

export async function swapOrca(
  aToB: true,
  tokenADecimal: number,
  tokenBDecimal: number,
  tokenAccountA: PublicKey,
  tokenAccountB: PublicKey,
  whirlpoolAddress: PublicKey,
  amount: number,
) {
  const ctx = WhirlpoolContext.fromWorkspace(getProvider(), solanaConnection);
  const client = buildWhirlpoolClient(ctx);
  const fetcher = client.getFetcher();

  const whirlpoolData = await fetcher.getPool(whirlpoolAddress);

  // Option 1 - Get the current tick-array PDA based on your desired sequence
  const startTick = TickUtil.getStartTickIndex(whirlpoolData!.tickCurrentIndex, whirlpoolData!.tickSpacing);
  const tickArrayKey = PDAUtil.getTickArray(ORCA_WHIRLPOOL_PROGRAM_ID, whirlpoolAddress, startTick);

  // Option 2 - Get the sequence of tick-arrays to trade in based on your trade direction.
  const tickArrays = await SwapUtils.getTickArrays(
    whirlpoolData!.tickCurrentIndex,
    whirlpoolData!.tickSpacing,
    aToB,
    ORCA_WHIRLPOOL_PROGRAM_ID,
    whirlpoolAddress,
    fetcher,
  );
  // This swap assumes the swap will not cross the current tick-array's boundaries
  // Swap 10 tokenA for tokenB. Or up until the price hits $4.95.
  const amountIn = DecimalUtil.fromNumber(amount, tokenADecimal);
  const swapInput: SwapInput = {
    amount: amountIn,
    otherAmountThreshold: ZERO,
    sqrtPriceLimit: MAX_SQRT_PRICE_BN, //min?
    amountSpecifiedIsInput: aToB,
    aToB: aToB,
    tickArray0: tickArrays[0].address,
    tickArray1: tickArrays[1].address,
    tickArray2: tickArrays[2].address,
  };

  const oraclePda = PDAUtil.getOracle(ctx.program.programId, tickArrayKey.publicKey);
  const txBuilder = toTx(
    ctx,
    WhirlpoolIx.swapIx(ctx.program, {
      whirlpool: whirlpoolAddress,
      tokenAuthority: ctx.wallet.publicKey,
      tokenOwnerAccountA: tokenAccountA,
      tokenVaultA: whirlpoolData!.tokenVaultA,
      tokenOwnerAccountB: tokenAccountB,
      tokenVaultB: whirlpoolData!.tokenVaultB,
      ...swapInput,
      oracle: oraclePda.publicKey,
    }),
  );

  const tx = await txBuilder.build();
  const txs = tx.transaction;
  console.log(txs);
}
