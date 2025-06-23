import { workerData, parentPort } from 'worker_threads';
import Sender from './Sender.mjs';

const sender = new Sender(workerData);

await sender.Run(workerData);


