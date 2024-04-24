import {
  MAX_SQRT_PRICE,
  MAX_SQRT_PRICE_BN,
  MIN_SQRT_PRICE,
  MIN_SQRT_PRICE_BN,
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
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor';
import dotenv from 'dotenv';

dotenv.config();

const getProvider = () => {
  const walletAnchor = new Wallet(wallet);
  const provider = new AnchorProvider(solanaConnection, walletAnchor, {
    commitment: process.env.COMMITMENT as Commitment,
  });
  return provider;
};

export async function swapOrca(
  aToB: boolean,
  tokenAccountA: PublicKey,
  tokenAccountB: PublicKey,
  whirlpoolAddress: PublicKey,
  amount: BN,
) {
  const ctx = WhirlpoolContext.from(solanaConnection, new Wallet(wallet), ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);
  const fetcher = client.getFetcher();

  const whirlpoolData = await fetcher.getPool(whirlpoolAddress);

  //   // Option 1 - Get the current tick-array PDA based on your desired sequence
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
  //   const amountIn = DecimalUtil.fromNumber(amount, tokenADecimal);
  const swapInput: SwapInput = {
    amount: amount,
    otherAmountThreshold: ZERO,
    sqrtPriceLimit: aToB ? MIN_SQRT_PRICE_BN : MAX_SQRT_PRICE_BN, //min?
    amountSpecifiedIsInput: !aToB,
    aToB: aToB,
    tickArray0: tickArrays[0].address,
    tickArray1: tickArrays[1].address,
    tickArray2: tickArrays[2].address,
  };

  const oraclePda = PDAUtil.getOracle(ctx.program.programId, whirlpoolAddress);

  return WhirlpoolIx.swapIx(ctx.program, {
    whirlpool: whirlpoolAddress,
    tokenAuthority: ctx.wallet.publicKey,
    tokenOwnerAccountA: tokenAccountA,
    tokenVaultA: whirlpoolData!.tokenVaultA,
    tokenOwnerAccountB: tokenAccountB,
    tokenVaultB: whirlpoolData!.tokenVaultB,
    ...swapInput,
    oracle: oraclePda.publicKey,
  });
}
