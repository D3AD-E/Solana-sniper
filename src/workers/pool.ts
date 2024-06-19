import { PublicKey } from '@solana/web3.js';
import { DataStore, ParentMessage, WorkerAction, WorkerMessage, WorkerResult } from './worker.types';
import { RawAccount } from '@solana/spl-token';
import { MinimalTokenAccountData } from '../cryptoQueries/cryptoQueries.types';
import { Worker } from 'worker_threads';
import { toSerializable } from './converter';
import { writeFile, readFileSync, existsSync } from 'fs';
import logger from '../utils/logger';
const DATA_FILE = 'data.json';
export class WorkerPool {
  private numWorkers: number;
  private workers: Worker[];
  private freeWorkers: Worker[];
  private takenWorkers: Map<string, Worker> = new Map<string, Worker>();
  private quoteTokenAssociatedAddress: PublicKey;
  private dataStore: DataStore = {};

  constructor(numWorkers: number, quoteTokenAssociatedAddress: PublicKey) {
    this.numWorkers = numWorkers;
    this.workers = [];
    this.freeWorkers = [];
    this.quoteTokenAssociatedAddress = quoteTokenAssociatedAddress;
    if (existsSync(DATA_FILE)) {
      const data = readFileSync(DATA_FILE, 'utf-8');
      Object.assign(this.dataStore, JSON.parse(data));
    }
    this.createWorkers();
  }

  private sendMessageToWorker(worker: Worker, message: WorkerMessage) {
    worker.postMessage(JSON.stringify(toSerializable(message)));
  }

  private async createWorkers() {
    for (let i = 0; i < this.numWorkers; i++) {
      const worker = new Worker('./src/workers/worker.ts', {
        execArgv: ['--require', 'ts-node/register'],
        workerData: process.env,
      });
      worker.on('message', (message: ParentMessage) => {
        if (message.result === WorkerResult.SellSuccess) {
          this.freeWorker(message.data.token);
        } else if (message.result === WorkerResult.TokenPriceUpdate) {
          const tokenAddress = message.data.token;
          if (!this.dataStore[tokenAddress]) {
            this.dataStore[tokenAddress] = [];
          }
          this.dataStore[tokenAddress].push({ time: message.data.time, price: message.data.price });

          // Save to JSON file
          writeFile(DATA_FILE, JSON.stringify(this.dataStore, null, 2), (err) => {
            if (err) {
              console.error('Error writing to file', err);
            }
          });
        }
      });
      worker.on('error', (message: any) => {
        console.log(message);
      });
      const setupMessage: WorkerMessage = {
        action: WorkerAction.Setup,
        data: {
          quoteTokenAssociatedAddress: this.quoteTokenAssociatedAddress,
        },
      };
      this.sendMessageToWorker(worker, setupMessage);
      this.workers.push(worker);
      this.freeWorkers.push(worker);
    }
  }

  public areThereFreeWorkers = () => this.freeWorkers.length > 0;

  public gotToken(token: string, lastRequest: any) {
    if (this.freeWorkers.length > 0) {
      if (this.takenWorkers.has(token)) throw 'Token is already being processed';
      const worker = this.freeWorkers.pop()!;
      this.takenWorkers.set(token, worker);
      const tokenGotMessage: WorkerMessage = {
        action: WorkerAction.GetToken,
        data: {
          token,
          lastRequest,
        },
      };
      this.sendMessageToWorker(worker, tokenGotMessage);
      setTimeout(
        () => {
          this.freeWorker(token);
          console.log(`Worker for ${token} terminated.`);
        },
        4 * 60 * 1000,
      );
    } else throw 'No free workers';
  }

  public doesTokenExist(token: string) {
    return this.takenWorkers.has(token);
  }

  public freeWorker(token: string) {
    if (!this.takenWorkers.has(token)) return;
    const worker = this.takenWorkers.get(token);
    const msg: WorkerMessage = {
      action: WorkerAction.Clear,
    };
    this.sendMessageToWorker(worker!, msg);
    this.freeWorkers.push(worker!);
    this.takenWorkers.delete(token);
  }

  public forceSell(token: string, accountData: RawAccount) {
    if (!this.takenWorkers.has(token)) return;
    const worker = this.takenWorkers.get(token);
    const forceSellMessage: WorkerMessage = {
      action: WorkerAction.ForceSell,
      data: {
        accountData,
      },
    };
    this.sendMessageToWorker(worker!, forceSellMessage);
  }

  public gotWalletToken(token: string, foundTokenData: RawAccount) {
    const worker = this.takenWorkers.get(token);
    const tokenGotMessage: WorkerMessage = {
      action: WorkerAction.GotWalletToken,
      data: {
        foundTokenData,
      },
    };
    this.sendMessageToWorker(worker!, tokenGotMessage);
  }
  public addTokenAccount(token: string, tokenAccount: MinimalTokenAccountData) {
    const worker = this.takenWorkers.get(token);
    const tokenGotMessage: WorkerMessage = {
      action: WorkerAction.AddTokenAccount,
      data: {
        tokenAccount,
      },
    };
    this.sendMessageToWorker(worker!, tokenGotMessage);
  }
}
