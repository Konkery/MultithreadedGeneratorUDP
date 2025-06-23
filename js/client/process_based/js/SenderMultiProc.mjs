import Sender from './Sender.mjs';
import { argv } from 'process';

const [ path, fn, args ] = argv;
let workerData = JSON.parse(args);

const sender = new Sender(workerData);
process.on('message', (msg) => {
    console.log(msg);
    if (msg.type === 'SIGINT') {
        sender.StartGracefulShutDown();
    }
});
await sender.Run(workerData);
console.log(`Process ${process.pid}: sockets ${workerData.sockets}`);