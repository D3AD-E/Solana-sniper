import * as fs from 'fs';
import { minBy, range } from 'lodash';

// Load the JSON data
const filePath = 'data.json';
const rawData = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(rawData);

// Display the keys (token addresses) and sample data
const tokenAddresses = Object.keys(data);

interface PriceEntry {
  time: number;
  price: number;
}

function findClosestIndex(tuples: PriceEntry[], number: number): number {
  // Find the index of the closest number
  const closestIndex = minBy(range(tuples.length), (i) => Math.abs(tuples[i].time - number));
  return closestIndex!;
}

function getChange(current: number, previous: number): number {
  if (current === previous) {
    return 0;
  }
  try {
    return (Math.abs(current - previous) / previous) * 100.0;
  } catch (e) {
    return 0;
  }
}

function simulateTrading(
  prices: PriceEntry[],
  takeProfitPct: number,
  stopLossPct: number,
  timeoutMs: number,
  randomBuy: number,
) {
  const buyIndex = findClosestIndex(prices, randomBuy);
  const initialPrice = prices[buyIndex].price;
  const buyTime = prices[buyIndex].time;
  for (let i = buyIndex; i < prices.length; i++) {
    const { time, price } = prices[i];
    // Check if take profit condition is met
    if (getChange(price, initialPrice) >= takeProfitPct) {
      const randomNumber = Math.floor(Math.random() * (3000 - 1000)) + 1000;
      const sellIndex = findClosestIndex(prices, randomNumber + time);
      // Return the selling price and holding time
      return [getChange(prices[sellIndex].price, initialPrice), prices[sellIndex].time, randomBuy];
    }

    // Check if stop loss condition is met
    if (getChange(price, initialPrice) <= -stopLossPct) {
      const randomNumber = Math.floor(Math.random() * (3000 - 1000)) + 1000;
      const sellIndex = findClosestIndex(prices, randomNumber + time);
      // Return the selling price and holding time
      return [getChange(prices[sellIndex].price, initialPrice), prices[sellIndex].time, randomBuy];
    }

    // Check if timeout condition is met
    if (time - buyTime >= timeoutMs) {
      const randomNumber = Math.floor(Math.random() * (3000 - 1000)) + 1000;
      const sellIndex = findClosestIndex(prices, randomNumber + time);
      // Return the selling price and holding time
      return [getChange(prices[sellIndex].price, initialPrice), prices[sellIndex].time, randomBuy];
    }
  }

  return [-Infinity, -Infinity];
}

function optimizeTrading(
  prices: PriceEntry[],
  takeProfitRange: number[],
  stopLossRange: number[],
  timeoutRange: number[],
  buyTime: number,
) {
  let bestProfit = -Infinity;
  let bestTime = -Infinity;
  let bestParams: number[] | null = null;

  for (const timeoutMs of timeoutRange) {
    for (const takeProfitPct of takeProfitRange) {
      for (const stopLossPct of stopLossRange) {
        const [sellingPrice, t] = simulateTrading(prices, takeProfitPct, stopLossPct, timeoutMs, buyTime);
        const profit = sellingPrice - prices[0].price;

        if (profit > bestProfit) {
          bestTime = t;
          bestProfit = profit;
          bestParams = [takeProfitPct, stopLossPct, timeoutMs];
        }
      }
    }
  }

  return [bestParams![0], bestParams![1], bestParams![2], bestProfit, bestTime];
}

// Define ranges for take profit, stop loss, and timeout
const takeProfitRange = range(0.01, 0.5, 0.01);
const stopLossRange = range(0.01, 0.5, 0.01);
const timeoutRange = range(1000, 60000 * 3, 1000);
let fileData = [];
try {
  // Optimize the trading strategy
  for (const addr of tokenAddresses) {
    const sampleData = data[addr];

    // Convert the sample data to an array for inspection
    const df = sampleData.map((entry: { time: string; price: string }) => ({
      time: parseInt(entry.time),
      price: parseFloat(entry.price),
    }));
    const prices: PriceEntry[] = df;
    let bestParamsArray = [];
    for (let i = 2000; i < 10000; i += 50) {
      const [bestTakeProfit, bestStopLoss, bestTimeout, bestProfit, bestTime] = optimizeTrading(
        prices,
        takeProfitRange,
        stopLossRange,
        timeoutRange,
        i,
      );
      bestParamsArray.push({
        bestTakeProfit,
        bestStopLoss,
        bestTimeout,
        bestProfit,
        buyTIme: i,
      });
      console.log(addr, i);
    }
    console.log(bestParamsArray);
    fileData.push({ address: addr, params: bestParamsArray });
    fs.writeFileSync('params.json', JSON.stringify(fileData));
  }
} catch (error) {
  console.error(error);
}
